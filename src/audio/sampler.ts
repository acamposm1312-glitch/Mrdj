import type { AudioBuffer, AudioContext, AudioNode, GainNode } from 'react-native-audio-api';

export const SAMPLES = ['kick', 'snare', 'clap', 'hat', 'horn', 'riser', 'laser', 'boom'] as const;
export type SampleName = (typeof SAMPLES)[number];

/**
 * One-shot sound pads. Every sound is synthesised on the device the first
 * time it is needed, so there are no audio files and nothing to license.
 */
export class Sampler {
  private out: GainNode;
  private cache = new Map<SampleName, AudioBuffer>();
  volume = 0.7;

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(dest);
  }

  setVolume(v: number) {
    this.volume = v;
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  trigger(name: SampleName) {
    if (this.ctx.state !== 'running') this.ctx.resume();
    let buf = this.cache.get(name);
    if (!buf) {
      const data = synth(name, this.ctx.sampleRate);
      buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      buf.copyToChannel(data, 0);
      this.cache.set(name, buf);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    src.onEnded = () => src.disconnect();
    src.start();
  }
}

const TAU = Math.PI * 2;

function synth(name: SampleName, rate: number): Float32Array<ArrayBuffer> {
  const make = (sec: number) => new Float32Array(Math.floor(sec * rate));
  const noise = () => Math.random() * 2 - 1;
  switch (name) {
    case 'kick': {
      const out = make(0.5);
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        ph += (TAU * (45 + 110 * Math.exp(-t * 28))) / rate;
        out[i] = Math.sin(ph) * Math.exp(-t * 7) + (t < 0.004 ? noise() * 0.4 : 0);
      }
      return out;
    }
    case 'snare': {
      const out = make(0.3);
      let prev = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        const n = noise();
        const hp = n - prev; // crude high-pass keeps the rattle bright
        prev = n;
        out[i] = 0.55 * hp * Math.exp(-t * 14) + 0.5 * Math.sin(TAU * 190 * t) * Math.exp(-t * 30);
      }
      return out;
    }
    case 'clap': {
      const out = make(0.35);
      let prev = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        // three quick slaps then a short room tail
        const burst = t < 0.03 ? Math.exp(-((t % 0.01) * 300)) : Math.exp(-(t - 0.03) * 16);
        const n = noise();
        out[i] = (n - prev) * burst * 0.7;
        prev = n;
      }
      return out;
    }
    case 'hat': {
      const out = make(0.09);
      let prev = 0;
      for (let i = 0; i < out.length; i++) {
        const n = noise();
        out[i] = (n - prev) * 0.45 * Math.exp(-(i / rate) * 55);
        prev = n;
      }
      return out;
    }
    case 'horn': {
      // dun-dun-duuun: square-ish chord with a little vibrato
      const out = make(1.3);
      const hits: [number, number][] = [[0, 0.16], [0.2, 0.36], [0.42, 1.3]];
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        const hit = hits.find(([a, b]) => t >= a && t < b);
        if (!hit) continue;
        const local = t - hit[0];
        const env = Math.min(1, local * 60) * Math.min(1, (hit[1] - t) * 25);
        const vib = 1 + 0.006 * Math.sin(TAU * 6 * t);
        let s = 0;
        for (const f of [440, 554, 659]) s += Math.tanh(4 * Math.sin(TAU * f * vib * t));
        out[i] = (s / 3) * env * 0.5;
      }
      return out;
    }
    case 'riser': {
      const out = make(2);
      let ph = 0;
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        const k = t / 2;
        ph += (TAU * (180 * Math.pow(12, k))) / rate;
        const a = 0.02 + 0.5 * k * k; // the filter opens as it climbs
        lp += a * (noise() - lp);
        out[i] = (0.35 * Math.sin(ph) + 0.5 * lp) * k * Math.min(1, (2 - t) * 20);
      }
      return out;
    }
    case 'laser': {
      const out = make(0.35);
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        ph += (TAU * (200 + 2600 * Math.exp(-t * 14))) / rate;
        out[i] = Math.sign(Math.sin(ph)) * 0.3 * Math.exp(-t * 6);
      }
      return out;
    }
    case 'boom': {
      const out = make(1.8);
      let ph = 0;
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        ph += (TAU * (32 + 50 * Math.exp(-t * 4))) / rate;
        lp += 0.05 * (noise() - lp);
        out[i] = Math.tanh(1.6 * Math.sin(ph)) * Math.exp(-t * 2.2) * 0.8 + lp * Math.exp(-t * 5) * 1.2;
      }
      return out;
    }
  }
}
