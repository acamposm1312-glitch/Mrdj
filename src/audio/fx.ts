import type { AudioContext, AudioNode, GainNode, OscillatorNode } from 'react-native-audio-api';

export type FxType = 'echo' | 'reverb' | 'flanger' | 'filter' | 'crush';
export const FX_TYPES: FxType[] = ['echo', 'reverb', 'flanger', 'filter', 'crush'];
export const FX_BEATS = [0.25, 0.5, 0.75, 1, 2, 4];

/** Send effects keep the dry signal at full level and let their tail ring out when switched off. */
const SEND_TYPES: FxType[] = ['echo', 'reverb'];

/**
 * One beat-synced effect slot inserted in a channel strip:
 *   input ─┬─ dry ──────────────┬─ output
 *          └─ send ─ effect ─ wet ┘
 */
export class FxUnit {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private send: GainNode;
  private wet: GainNode;
  private nodes: AudioNode[] = [];
  private lfo: OscillatorNode | null = null;
  private timeTarget: { param: { value: number }; kind: 'delay' | 'lfo' } | null = null;

  type: FxType = 'echo';
  on = false;
  mix = 0.5;
  beats = 0.5;
  private beatSeconds = 0.5;

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.send = ctx.createGain();
    this.wet = ctx.createGain();
    this.input.connect(this.dry);
    this.dry.connect(this.output);
    this.input.connect(this.send);
    this.wet.connect(this.output);
    this.build();
    this.applyLevels();
  }

  setType(type: FxType) {
    if (type === this.type) return;
    this.type = type;
    this.build();
    this.applyLevels();
  }

  setOn(on: boolean) {
    this.on = on;
    this.applyLevels();
  }

  setMix(mix: number) {
    this.mix = Math.max(0, Math.min(1, mix));
    this.applyLevels();
  }

  setBeats(beats: number) {
    this.beats = beats;
    this.applyTiming();
  }

  /** Length of one beat in real seconds, after tempo changes. */
  setBeatSeconds(sec: number) {
    if (!isFinite(sec) || sec <= 0) return;
    this.beatSeconds = sec;
    this.applyTiming();
  }

  private applyLevels() {
    const t = this.ctx.currentTime;
    const isSend = SEND_TYPES.includes(this.type);
    const dry = this.on && !isSend ? 1 - this.mix : 1;
    const send = this.on ? 1 : 0;
    // send effects keep wet open so tails decay naturally
    const wet = isSend ? this.mix : this.on ? this.mix : 0;
    this.dry.gain.setTargetAtTime(dry, t, 0.01);
    this.send.gain.setTargetAtTime(send, t, 0.01);
    this.wet.gain.setTargetAtTime(wet, t, 0.01);
  }

  private applyTiming() {
    if (!this.timeTarget) return;
    const period = this.beats * this.beatSeconds;
    if (this.timeTarget.kind === 'delay') {
      this.timeTarget.param.value = Math.min(1.9, period);
    } else {
      // LFO sweeps once per (beats × 4) — slow, musical modulation
      this.timeTarget.param.value = 1 / Math.max(0.05, period * 4);
    }
  }

  private teardown() {
    try {
      this.send.disconnect();
    } catch {}
    if (this.lfo) {
      try {
        this.lfo.stop();
      } catch {}
      this.lfo = null;
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {}
    }
    this.nodes = [];
    this.timeTarget = null;
  }

  private build() {
    this.teardown();
    const ctx = this.ctx;
    switch (this.type) {
      case 'echo': {
        const delay = ctx.createDelay(2);
        const fb = ctx.createGain();
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 280;
        fb.gain.value = 0.5;
        this.send.connect(delay);
        delay.connect(this.wet);
        delay.connect(hp);
        hp.connect(fb);
        fb.connect(delay);
        this.nodes = [delay, fb, hp];
        this.timeTarget = { param: delay.delayTime, kind: 'delay' };
        break;
      }
      case 'reverb': {
        const conv = ctx.createConvolver();
        conv.buffer = makeImpulse(ctx, 2.8, 2.5);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 7000;
        this.send.connect(conv);
        conv.connect(lp);
        lp.connect(this.wet);
        this.nodes = [conv, lp];
        break;
      }
      case 'flanger': {
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = 0.004;
        const fb = ctx.createGain();
        fb.gain.value = 0.6;
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        const depth = ctx.createGain();
        depth.gain.value = 0.0032;
        lfo.connect(depth);
        depth.connect(delay.delayTime);
        this.send.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(this.wet);
        this.send.connect(this.wet);
        lfo.start();
        this.lfo = lfo;
        this.nodes = [delay, fb, depth, lfo];
        this.timeTarget = { param: lfo.frequency, kind: 'lfo' };
        break;
      }
      case 'filter': {
        const bq = ctx.createBiquadFilter();
        bq.type = 'lowpass';
        bq.frequency.value = 1400;
        bq.Q.value = 9;
        const lfo = ctx.createOscillator();
        lfo.type = 'triangle';
        const depth = ctx.createGain();
        depth.gain.value = 1200;
        lfo.connect(depth);
        depth.connect(bq.frequency);
        this.send.connect(bq);
        bq.connect(this.wet);
        lfo.start();
        this.lfo = lfo;
        this.nodes = [bq, depth, lfo];
        this.timeTarget = { param: lfo.frequency, kind: 'lfo' };
        break;
      }
      case 'crush': {
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeCrushCurve(5);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 6000;
        this.send.connect(shaper);
        shaper.connect(lp);
        lp.connect(this.wet);
        this.nodes = [shaper, lp];
        break;
      }
    }
    this.applyTiming();
  }
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = new Float32Array(len);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    buf.copyToChannel(data, c);
  }
  return buf;
}

function makeCrushCurve(bits: number) {
  const n = 4096;
  const steps = 2 ** bits;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

/** Soft-clip curve used as a brick-wall-ish master limiter. */
export function makeLimiterCurve() {
  const n = 8192;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.abs(x) < 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((Math.abs(x) - 0.8) / 0.2));
  }
  return curve;
}
