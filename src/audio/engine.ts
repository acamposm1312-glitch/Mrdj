import { useEffect, useReducer, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  AnalyserNode,
  AudioContext,
  AudioManager,
  GainNode,
  StereoPannerNode,
  WaveShaperNode,
} from 'react-native-audio-api';
import { readAudio } from '../library/storage';
import type { Track } from '../library/types';
import { Deck, HotCue } from './Deck';
import { makeLimiterCurve } from './fx';
import { MasterRecorder } from './recorder';

export type XfCurve = 'smooth' | 'sharp';

export interface CuePersistence {
  get(trackId: string): { cuePoint: number; hotCues: (HotCue | null)[] } | undefined;
  set(trackId: string, cues: { cuePoint: number; hotCues: (HotCue | null)[] }): void;
}

/**
 * The whole mixer: four decks, crossfader, master limiter, headphone cue bus
 * (split-cue on a single stereo output) and master recording.
 */
export class MixerEngine {
  readonly ctx: AudioContext;
  readonly decks: Deck[];
  private masterBus: GainNode;
  private limiter: WaveShaperNode;
  private masterGain: GainNode;
  private masterPan: StereoPannerNode;
  readonly masterMeter: AnalyserNode;
  private cueBus: GainNode;
  private masterToCue: GainNode;
  private cuePan: StereoPannerNode;
  private cueOut: GainNode;

  crossfader = 0;
  xfCurve: XfCurve = 'smooth';
  masterVolume = 0.85;
  splitCue = false;
  cueMix = 0; // 0 = only cue, 1 = only master in the headphone side
  headphoneVolume = 0.85;
  masterIndex: number | null = null;
  recording = false;
  recordStartedAt = 0;
  private recorder: MasterRecorder;

  private listeners = new Set<() => void>();
  version = 0;
  private emitScheduled = false;
  private cues: CuePersistence | null = null;
  private savedCueRefs = new Map<number, unknown>();
  private meterBuf = new Float32Array(512);

  constructor() {
    if (Platform.OS === 'ios') {
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playback',
        iosMode: 'default',
        iosOptions: ['allowBluetoothA2DP', 'allowAirPlay'],
      });
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.masterBus = ctx.createGain();
    this.limiter = ctx.createWaveShaper();
    this.limiter.curve = makeLimiterCurve();
    this.limiter.oversample = '2x';
    this.masterGain = ctx.createGain();
    this.masterPan = ctx.createStereoPanner();
    this.masterMeter = ctx.createAnalyser();
    this.masterMeter.fftSize = 512;
    this.cueBus = ctx.createGain();
    this.masterToCue = ctx.createGain();
    this.cuePan = ctx.createStereoPanner();
    this.cueOut = ctx.createGain();

    this.masterBus.connect(this.limiter);
    this.limiter.connect(this.masterGain);
    this.masterGain.connect(this.masterMeter);
    this.masterMeter.connect(this.masterPan);
    this.masterPan.connect(ctx.destination);

    this.cueBus.connect(this.cuePan);
    this.masterGain.connect(this.masterToCue);
    this.masterToCue.connect(this.cuePan);
    this.cuePan.connect(this.cueOut);
    this.cueOut.connect(ctx.destination);
    this.cuePan.pan.value = 1;

    this.decks = [0, 1, 2, 3].map((i) => {
      const d = new Deck(ctx, i, () => this.onDeckChange(i));
      d.xfNode.connect(this.masterBus);
      d.cueNode.connect(this.cueBus);
      return d;
    });
    this.recorder = new MasterRecorder(ctx, this.masterGain);
    this.applyCrossfader();
    this.applyMaster();
    this.applyCue();
  }

  // ───────────────────────── subscriptions ─────────────────────────

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit = () => {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    queueMicrotask(() => {
      this.emitScheduled = false;
      this.version++;
      this.listeners.forEach((l) => l());
    });
  };

  private audioSource: (track: Track) => Promise<ArrayBuffer> = (track) => readAudio(track.id);

  /** Where track audio comes from (local storage, or the Drive cache). */
  setAudioSource(fn: (track: Track) => Promise<ArrayBuffer>) {
    this.audioSource = fn;
  }

  setCuePersistence(c: CuePersistence) {
    this.cues = c;
  }

  private onDeckChange(i: number) {
    const d = this.decks[i];
    if (this.cues && d.track) {
      const ref = d.hotCues;
      const key = `${d.track.id}:${d.cuePoint}`;
      if (this.savedCueRefs.get(i) !== ref || this.savedCueRefs.get(i + 10) !== key) {
        this.savedCueRefs.set(i, ref);
        this.savedCueRefs.set(i + 10, key);
        this.cues.set(d.track.id, { cuePoint: d.cuePoint, hotCues: d.hotCues });
      }
    }
    this.emit();
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  // ───────────────────────── loading ─────────────────────────

  async load(deckIndex: number, track: Track) {
    const d = this.decks[deckIndex];
    if (d.playing) d.pause();
    d.loading = true;
    this.emit();
    try {
      this.resume();
      const bytes = await this.audioSource(track);
      const buffer = await this.ctx.decodeAudioData(bytes);
      const cues = this.cues?.get(track.id);
      this.savedCueRefs.set(deckIndex, cues?.hotCues);
      d.setTrack(track, buffer, cues);
    } finally {
      d.loading = false;
      this.emit();
    }
  }

  /** Re-apply analysis results (e.g. after a BPM edit) to loaded decks. */
  refreshTrack(track: Track) {
    for (const d of this.decks) {
      if (d.track?.id === track.id) {
        d.track = track;
        d.updateFxTiming();
      }
    }
    this.emit();
  }

  // ───────────────────────── transport with sync ─────────────────────────

  togglePlay(i: number) {
    this.resume();
    const d = this.decks[i];
    const wasPlaying = d.playing;
    d.togglePlay();
    if (!wasPlaying && d.playing && d.sync) {
      const m = this.findMaster(i);
      if (m) this.alignPhase(d, m);
    }
  }

  private findMaster(exclude: number): Deck | null {
    if (this.masterIndex != null && this.masterIndex !== exclude) {
      const m = this.decks[this.masterIndex];
      if (m.track && m.bpm) return m;
    }
    const playing = this.decks.find((d, j) => j !== exclude && d.playing && d.bpm);
    if (playing) return playing;
    return this.decks.find((d, j) => j !== exclude && d.track && d.bpm) ?? null;
  }

  setMaster(i: number) {
    this.masterIndex = this.masterIndex === i ? null : i;
    this.emit();
  }

  toggleSync(i: number) {
    const d = this.decks[i];
    if (d.sync) {
      d.sync = false;
      this.emit();
      return;
    }
    if (!d.bpm) return;
    const m = this.findMaster(i);
    d.sync = true;
    if (!m) {
      this.masterIndex = i;
      this.emit();
      return;
    }
    if (this.masterIndex == null) this.masterIndex = m.index;
    this.matchTempo(d, m);
    if (d.playing && m.playing) this.alignPhase(d, m);
    this.emit();
  }

  private matchTempo(slave: Deck, master: Deck) {
    let target = master.currentBpm / slave.bpm;
    // match half / double time (e.g. 87 ↔ 174)
    while (target > 1.5) target /= 2;
    while (target < 0.67) target *= 2;
    slave.setRate(target);
  }

  private alignPhase(slave: Deck, master: Deck) {
    if (!slave.beatLength || !master.beatLength) return;
    let diff = master.beatPhase() - slave.beatPhase();
    if (diff > 0.5) diff -= 1;
    if (diff < -0.5) diff += 1;
    if (Math.abs(diff) < 0.01) return;
    slave.seek(slave.position() + diff * slave.beatLength);
  }

  setPitch(i: number, v: number) {
    const d = this.decks[i];
    if (d.sync && this.masterIndex !== i) d.sync = false;
    d.setPitch(v);
    this.propagateTempo(i);
  }

  setRate(i: number, rate: number) {
    this.decks[i].setRate(rate);
    this.propagateTempo(i);
  }

  private propagateTempo(i: number) {
    if (this.masterIndex !== i) return;
    const m = this.decks[i];
    for (const d of this.decks) {
      if (d !== m && d.sync && d.bpm) this.matchTempo(d, m);
    }
  }

  // ───────────────────────── mixer ─────────────────────────

  setCrossfader(x: number) {
    this.crossfader = Math.max(-1, Math.min(1, x));
    this.applyCrossfader();
    this.emit();
  }

  setXfCurve(c: XfCurve) {
    this.xfCurve = c;
    this.applyCrossfader();
    this.emit();
  }

  setXfAssign(i: number, a: Deck['xfAssign']) {
    this.decks[i].xfAssign = a;
    this.applyCrossfader();
    this.emit();
  }

  private xfGains(): [number, number] {
    const t = (this.crossfader + 1) / 2;
    if (this.xfCurve === 'sharp') {
      return [t < 0.95 ? 1 : (1 - t) / 0.05, t > 0.05 ? 1 : t / 0.05];
    }
    return [Math.cos((t * Math.PI) / 2), Math.sin((t * Math.PI) / 2)];
  }

  private applyCrossfader() {
    const [a, b] = this.xfGains();
    const now = this.ctx.currentTime;
    for (const d of this.decks) {
      const g = d.xfAssign === 'A' ? a : d.xfAssign === 'B' ? b : 1;
      d.xfNode.gain.setTargetAtTime(g, now, 0.004);
    }
  }

  setMasterVolume(v: number) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    this.applyMaster();
    this.emit();
  }

  private applyMaster() {
    this.masterGain.gain.setTargetAtTime(this.masterVolume ** 2 * 1.2, this.ctx.currentTime, 0.01);
  }

  setSplitCue(on: boolean) {
    this.splitCue = on;
    this.applyCue();
    this.emit();
  }

  setCueMix(v: number) {
    this.cueMix = Math.max(0, Math.min(1, v));
    this.applyCue();
    this.emit();
  }

  setHeadphoneVolume(v: number) {
    this.headphoneVolume = Math.max(0, Math.min(1, v));
    this.applyCue();
    this.emit();
  }

  private applyCue() {
    const now = this.ctx.currentTime;
    this.masterPan.pan.setTargetAtTime(this.splitCue ? -1 : 0, now, 0.01);
    this.cueBus.gain.setTargetAtTime(1 - this.cueMix, now, 0.01);
    this.masterToCue.gain.setTargetAtTime(this.cueMix, now, 0.01);
    this.cueOut.gain.setTargetAtTime(this.splitCue ? this.headphoneVolume ** 2 : 0, now, 0.01);
  }

  masterLevel(): number {
    this.masterMeter.getFloatTimeDomainData(this.meterBuf);
    let p = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const a = Math.abs(this.meterBuf[i]);
      if (a > p) p = a;
    }
    return Math.min(1, p);
  }

  // ───────────────────────── recording ─────────────────────────

  startRecording() {
    if (this.recording) return;
    this.resume();
    this.recorder.start();
    this.recording = true;
    this.recordStartedAt = Date.now();
    this.emit();
  }

  async stopRecording(): Promise<{ data: ArrayBuffer | Blob; mime: string; ext: string } | null> {
    if (!this.recording) return null;
    this.recording = false;
    this.emit();
    const data = await this.recorder.stop();
    if (!data) return null;
    return { data, mime: this.recorder.mime, ext: this.recorder.ext };
  }
}

let instance: MixerEngine | null = null;

export function getEngine(): MixerEngine {
  if (!instance) {
    instance = new MixerEngine();
    // handle for automated browser tests
    if (Platform.OS === 'web') (globalThis as { __MRDJ__?: MixerEngine }).__MRDJ__ = instance;
  }
  return instance;
}

/** Re-render when anything in the engine changes. */
export function useEngine(): MixerEngine {
  const engine = getEngine();
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => engine.subscribe(force), [engine]);
  return engine;
}

/** Calls `fn` every animation frame while mounted; returns its latest value. */
export function useFrame<T>(fn: () => T, fps = 30): T {
  const [value, setValue] = useState<T>(fn);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const interval = 1000 / fps;
    const loop = (t: number) => {
      if (t - last >= interval) {
        last = t;
        setValue(fnRef.current());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps]);
  return value;
}
