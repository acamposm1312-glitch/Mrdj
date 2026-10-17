import type {
  AnalyserNode,
  AudioBuffer,
  AudioBufferSourceNode,
  AudioContext,
  BiquadFilterNode,
  GainNode,
} from 'react-native-audio-api';
import type { Track } from '../library/types';
import { FxUnit } from './fx';

export type XfAssign = 'A' | 'THRU' | 'B';
export const TEMPO_RANGES = [0.06, 0.1, 0.16, 0.5];
export const LOOP_SIZES = [1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32];

export interface HotCue {
  time: number;
}

export interface LoopState {
  start: number;
  end: number;
  active: boolean;
  beats: number | null;
}

const SCRATCH_GRAIN = 0.07;

/**
 * One player deck plus its mixer channel strip:
 * source → trim → EQ(low/mid/high) → HPF → LPF → FX → meter → fader → crossfader → master
 *                                                          └→ cue (PFL) send
 * Playhead position is tracked analytically from the context clock so the UI
 * can render waveforms without polling native code.
 */
export class Deck {
  buffer: AudioBuffer | null = null;
  track: Track | null = null;
  loading = false;

  readonly trimNode: GainNode;
  private eqLow: BiquadFilterNode;
  private eqMid: BiquadFilterNode;
  private eqHigh: BiquadFilterNode;
  private hpf: BiquadFilterNode;
  private lpf: BiquadFilterNode;
  readonly fx: FxUnit;
  readonly meter: AnalyserNode;
  private faderNode: GainNode;
  readonly xfNode: GainNode;
  readonly cueNode: GainNode;

  private source: AudioBufferSourceNode | null = null;
  private grain: AudioBufferSourceNode | null = null;
  private srcToken = 0;
  private anchorCtx = 0;
  private anchorPos = 0;

  playing = false;
  cuePoint = 0;
  private cuePreview = false;
  hotCues: (HotCue | null)[] = Array(8).fill(null);
  loop: LoopState | null = null;
  private manualLoopIn: number | null = null;
  loopBeats = 4;

  pitch = 0; // fader -1..1
  pitchRange = 0.08;
  rate = 1;
  private bend = 0;
  keyLock = false;
  quantize = true;
  vinyl = true;
  sync = false;
  /** BPM override from ÷2 / ×2 / tap tempo */
  bpmOverride: number | null = null;

  // channel strip
  trim = 0; // -1..1
  eq = { low: 0, mid: 0, high: 0 }; // -1..1
  filter = 0; // -1..1
  volume = 0.8;
  pfl = false;
  xfAssign: XfAssign;

  private scratching = false;
  private scratchResume = false;
  private lastGrainAt = 0;
  private meterBuf = new Float32Array(256);

  constructor(
    private ctx: AudioContext,
    readonly index: number,
    private onChange: () => void,
  ) {
    this.xfAssign = index % 2 === 0 ? 'A' : 'B';
    this.trimNode = ctx.createGain();
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 220;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 0.7;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 3800;
    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 10;
    this.hpf.Q.value = 0.9;
    this.lpf = ctx.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 22000;
    this.lpf.Q.value = 0.9;
    this.fx = new FxUnit(ctx);
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 256;
    this.faderNode = ctx.createGain();
    this.xfNode = ctx.createGain();
    this.cueNode = ctx.createGain();
    this.cueNode.gain.value = 0;

    this.trimNode.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.hpf);
    this.hpf.connect(this.lpf);
    this.lpf.connect(this.fx.input);
    this.fx.output.connect(this.meter);
    this.meter.connect(this.faderNode);
    this.faderNode.connect(this.xfNode);
    this.meter.connect(this.cueNode);
    this.applyVolume();
  }

  // ───────────────────────── track ─────────────────────────

  get duration() {
    return this.buffer?.duration ?? 0;
  }

  get bpm(): number {
    return this.bpmOverride ?? this.track?.bpm ?? 0;
  }

  /** Current BPM after the tempo fader. */
  get currentBpm(): number {
    return this.bpm * this.effectiveRate();
  }

  get beatLength(): number {
    return this.bpm > 0 ? 60 / this.bpm : 0;
  }

  get firstBeat(): number {
    return this.track?.firstBeat ?? 0;
  }

  setTrack(track: Track, buffer: AudioBuffer, cues?: { cuePoint: number; hotCues: (HotCue | null)[] }) {
    this.stopSource();
    this.playing = false;
    this.track = track;
    this.buffer = buffer;
    this.loop = null;
    this.manualLoopIn = null;
    this.bpmOverride = null;
    this.sync = false;
    this.cuePoint = cues?.cuePoint ?? Math.max(0, track.firstBeat);
    this.hotCues = cues?.hotCues ?? Array(8).fill(null);
    this.anchorPos = this.cuePoint;
    this.updateFxTiming();
    this.onChange();
  }

  eject() {
    this.stopSource();
    this.playing = false;
    this.track = null;
    this.buffer = null;
    this.loop = null;
    this.anchorPos = 0;
    this.onChange();
  }

  // ───────────────────────── transport ─────────────────────────

  effectiveRate() {
    return this.rate * (1 + this.bend);
  }

  position(): number {
    if (!this.buffer) return 0;
    let p = this.anchorPos;
    if (this.playing && !this.scratching) {
      p += (this.ctx.currentTime - this.anchorCtx) * this.effectiveRate();
      const l = this.loop;
      if (l?.active && p >= l.end && this.anchorPos < l.end) {
        const len = l.end - l.start;
        p = l.start + ((p - l.start) % len);
      }
    }
    return Math.max(0, Math.min(p, this.duration));
  }

  private reanchor() {
    this.anchorPos = this.position();
    this.anchorCtx = this.ctx.currentTime;
  }

  private stopSource() {
    this.srcToken++;
    const s = this.source;
    this.source = null;
    if (s) {
      s.onEnded = null;
      try {
        s.stop();
      } catch {}
      try {
        s.disconnect();
      } catch {}
    }
  }

  private startSource(at: number) {
    if (!this.buffer) return;
    this.stopSource();
    const src = this.ctx.createBufferSource({ pitchCorrection: this.keyLock });
    src.buffer = this.buffer;
    src.playbackRate.value = this.effectiveRate();
    if (this.loop?.active && at < this.loop.end) {
      src.loop = true;
      src.loopStart = this.loop.start;
      src.loopEnd = this.loop.end;
    }
    src.connect(this.trimNode);
    const token = this.srcToken;
    src.onEnded = () => {
      if (token !== this.srcToken || !this.playing) return;
      this.playing = false;
      this.anchorPos = this.duration;
      this.source = null;
      this.onChange();
    };
    src.start(0, Math.max(0, Math.min(at, this.duration - 0.001)));
    this.source = src;
    this.anchorPos = at;
    this.anchorCtx = this.ctx.currentTime;
  }

  play() {
    if (!this.buffer || this.playing) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.anchorPos >= this.duration - 0.05) this.anchorPos = 0;
    this.startSource(this.anchorPos);
    this.playing = true;
    this.cuePreview = false;
    this.onChange();
  }

  pause() {
    if (!this.playing) return;
    this.anchorPos = this.position();
    this.stopSource();
    this.playing = false;
    this.onChange();
  }

  togglePlay() {
    if (this.playing && !this.cuePreview) this.pause();
    else if (this.cuePreview) {
      this.cuePreview = false;
      this.onChange();
    } else this.play();
  }

  seek(t: number) {
    if (!this.buffer) return;
    const pos = Math.max(0, Math.min(t, this.duration - 0.01));
    if (this.loop?.active && (pos < this.loop.start || pos > this.loop.end)) this.loop.active = false;
    if (this.playing) this.startSource(pos);
    else this.anchorPos = pos;
    this.onChange();
  }

  /** CDJ-style CUE: press while playing returns to cue; press while paused sets cue or previews it. */
  cueDown() {
    if (!this.buffer) return;
    if (this.playing) {
      this.pause();
      this.seek(this.cuePoint);
      return;
    }
    const pos = this.position();
    if (Math.abs(pos - this.cuePoint) < 0.03) {
      this.play();
      this.cuePreview = true;
    } else {
      this.cuePoint = this.quantize ? this.snap(pos) : pos;
      this.seek(this.cuePoint);
    }
  }

  cueUp() {
    if (!this.cuePreview) return;
    this.cuePreview = false;
    this.pause();
    this.seek(this.cuePoint);
  }

  // ───────────────────────── beat grid ─────────────────────────

  snap(t: number) {
    const bl = this.beatLength;
    if (!bl) return t;
    return this.firstBeat + Math.round((t - this.firstBeat) / bl) * bl;
  }

  private floorBeat(t: number) {
    const bl = this.beatLength;
    if (!bl) return t;
    return this.firstBeat + Math.floor((t - this.firstBeat) / bl + 1e-6) * bl;
  }

  /** Phase within the current beat, 0..1. */
  beatPhase(t = this.position()) {
    const bl = this.beatLength;
    if (!bl) return 0;
    const x = (t - this.firstBeat) / bl;
    return x - Math.floor(x);
  }

  beatJump(beats: number) {
    const bl = this.beatLength || 0.5;
    const target = this.position() + beats * bl;
    if (this.loop?.active) {
      const len = this.loop.end - this.loop.start;
      this.loop.start += beats * bl;
      this.loop.end = this.loop.start + len;
    }
    this.seek(target);
  }

  // ───────────────────────── hot cues ─────────────────────────

  hotCue(i: number) {
    if (!this.buffer) return;
    const hc = this.hotCues[i];
    if (!hc) {
      const pos = this.position();
      this.hotCues = this.hotCues.slice();
      this.hotCues[i] = { time: this.quantize ? this.snap(pos) : pos };
      this.onChange();
      return;
    }
    this.seek(hc.time);
    if (!this.playing) this.play();
  }

  clearHotCue(i: number) {
    this.hotCues = this.hotCues.slice();
    this.hotCues[i] = null;
    this.onChange();
  }

  // ───────────────────────── loops ─────────────────────────

  private applyLoop() {
    const l = this.loop;
    if (!l) return;
    let p = this.position();
    if (l.active && p >= l.end) p = l.start + ((p - l.start) % (l.end - l.start));
    if (this.playing) this.startSource(p);
    else this.anchorPos = p;
    this.onChange();
  }

  autoLoop(beats: number) {
    if (!this.buffer) return;
    const bl = this.beatLength || 0.5;
    if (this.loop?.active && this.loop.beats === beats) {
      this.exitLoop();
      return;
    }
    const pos = this.position();
    const start = this.quantize && bl ? this.floorBeat(pos) : pos;
    this.loopBeats = beats;
    this.loop = { start, end: start + beats * bl, active: true, beats };
    this.applyLoop();
  }

  resizeLoop(factor: number) {
    const bl = this.beatLength || 0.5;
    const next = Math.max(1 / 32, Math.min(32, this.loopBeats * factor));
    this.loopBeats = next;
    if (this.loop) {
      this.loop.beats = next;
      this.loop.end = this.loop.start + next * bl;
      this.applyLoop();
    } else this.onChange();
  }

  loopIn() {
    if (!this.buffer) return;
    const pos = this.position();
    this.manualLoopIn = this.quantize ? this.snap(pos) : pos;
    this.onChange();
  }

  loopOut() {
    if (this.manualLoopIn == null) return;
    const pos = this.position();
    const end = this.quantize ? this.snap(pos) : pos;
    if (end - this.manualLoopIn < 0.02) return;
    const beats = this.beatLength ? (end - this.manualLoopIn) / this.beatLength : null;
    this.loop = { start: this.manualLoopIn, end, active: true, beats };
    this.manualLoopIn = null;
    this.applyLoop();
  }

  get loopInPending() {
    return this.manualLoopIn != null;
  }

  exitLoop() {
    if (!this.loop) return;
    const p = this.position();
    this.loop = { ...this.loop, active: false };
    this.anchorPos = p;
    this.anchorCtx = this.ctx.currentTime;
    if (this.source) this.source.loop = false;
    this.onChange();
  }

  reloop() {
    if (!this.loop) return;
    if (this.loop.active) {
      this.exitLoop();
      return;
    }
    this.loop = { ...this.loop, active: true };
    this.seek(this.loop.start);
  }

  // ───────────────────────── tempo ─────────────────────────

  setPitch(v: number) {
    this.pitch = Math.max(-1, Math.min(1, v));
    this.setRate(1 + this.pitch * this.pitchRange, false);
  }

  /** Set absolute rate (used by sync); keeps fader position in range for display. */
  setRate(rate: number, updateFader = true) {
    this.reanchor();
    this.rate = Math.max(0.2, Math.min(3, rate));
    if (updateFader) this.pitch = Math.max(-1, Math.min(1, (this.rate - 1) / this.pitchRange));
    this.applyRate();
    this.onChange();
  }

  setPitchRange(range: number) {
    this.pitchRange = range;
    this.pitch = Math.max(-1, Math.min(1, (this.rate - 1) / range));
    this.onChange();
  }

  resetTempo() {
    this.setRate(1);
  }

  /** Temporary pitch bend from jog wheel / nudge buttons. */
  setBend(b: number) {
    this.reanchor();
    this.bend = Math.max(-0.5, Math.min(0.5, b));
    this.applyRate();
  }

  private applyRate() {
    if (this.source) this.source.playbackRate.value = this.effectiveRate();
    this.updateFxTiming();
  }

  updateFxTiming() {
    if (this.beatLength) this.fx.setBeatSeconds(this.beatLength / this.effectiveRate());
  }

  setKeyLock(on: boolean) {
    this.keyLock = on;
    if (this.playing) {
      this.reanchor();
      this.startSource(this.anchorPos);
    }
    this.onChange();
  }

  setBpmOverride(bpm: number | null) {
    this.bpmOverride = bpm && bpm > 0 ? Math.round(bpm * 100) / 100 : null;
    this.updateFxTiming();
    this.onChange();
  }

  // ───────────────────────── scratch ─────────────────────────

  scratchStart() {
    if (!this.buffer) return;
    this.scratchResume = this.playing;
    this.anchorPos = this.position();
    this.anchorCtx = this.ctx.currentTime;
    this.stopSource();
    this.scratching = true;
  }

  /** Move the record by `deltaSec` of audio; `speed` is |audio-seconds per real second|. */
  scratchMove(deltaSec: number, speed: number) {
    if (!this.scratching || !this.buffer) return;
    this.anchorPos = Math.max(0, Math.min(this.duration - 0.01, this.anchorPos + deltaSec));
    const now = this.ctx.currentTime;
    if (now - this.lastGrainAt < 0.03 || speed < 0.05) return;
    this.lastGrainAt = now;
    this.stopGrain();
    const g = this.ctx.createBufferSource();
    g.buffer = this.buffer;
    g.playbackRate.value = Math.max(0.25, Math.min(3, speed));
    g.connect(this.trimNode);
    const start = deltaSec >= 0 ? this.anchorPos : Math.max(0, this.anchorPos - SCRATCH_GRAIN * speed);
    g.start(0, start, SCRATCH_GRAIN * Math.max(0.25, speed));
    this.grain = g;
  }

  private stopGrain() {
    if (this.grain) {
      try {
        this.grain.stop();
      } catch {}
      try {
        this.grain.disconnect();
      } catch {}
      this.grain = null;
    }
  }

  scratchEnd() {
    if (!this.scratching) return;
    this.scratching = false;
    this.stopGrain();
    if (this.scratchResume) {
      this.startSource(this.anchorPos);
      this.playing = true;
    } else this.anchorCtx = this.ctx.currentTime;
    this.onChange();
  }

  get isScratching() {
    return this.scratching;
  }

  // ───────────────────────── channel strip ─────────────────────────

  setTrim(v: number) {
    this.trim = v;
    const db = v * 12;
    this.trimNode.gain.setTargetAtTime(10 ** (db / 20), this.ctx.currentTime, 0.01);
    this.onChange();
  }

  setEq(band: 'low' | 'mid' | 'high', v: number) {
    this.eq = { ...this.eq, [band]: v };
    // kill at the bottom, +6 dB boost at the top
    const db = v < 0 ? (v <= -0.98 ? -60 : v * 26) : v * 6;
    const node = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh;
    node.gain.setTargetAtTime(db, this.ctx.currentTime, 0.01);
    this.onChange();
  }

  setFilter(v: number) {
    this.filter = v;
    const t = this.ctx.currentTime;
    const a = Math.abs(v);
    if (a < 0.03) {
      this.lpf.frequency.setTargetAtTime(22000, t, 0.01);
      this.hpf.frequency.setTargetAtTime(10, t, 0.01);
      this.lpf.Q.value = 0.7;
      this.hpf.Q.value = 0.7;
    } else if (v < 0) {
      this.lpf.frequency.setTargetAtTime(20000 * Math.pow(0.004, a), t, 0.01);
      this.hpf.frequency.setTargetAtTime(10, t, 0.01);
      this.lpf.Q.value = 1 + a * 4;
    } else {
      this.hpf.frequency.setTargetAtTime(20 * Math.pow(300, a), t, 0.01);
      this.lpf.frequency.setTargetAtTime(22000, t, 0.01);
      this.hpf.Q.value = 1 + a * 4;
    }
    this.onChange();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
    this.onChange();
  }

  private applyVolume() {
    this.faderNode.gain.setTargetAtTime(this.volume * this.volume, this.ctx.currentTime, 0.005);
  }

  setPfl(on: boolean) {
    this.pfl = on;
    this.cueNode.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.01);
    this.onChange();
  }

  /** Peak level 0..1 (post-FX, pre-fader). */
  level(): number {
    if (!this.playing && !this.scratching) return 0;
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let p = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const a = Math.abs(this.meterBuf[i]);
      if (a > p) p = a;
    }
    return Math.min(1, p);
  }
}
