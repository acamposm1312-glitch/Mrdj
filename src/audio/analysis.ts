import type { Analysis, Waveform } from '../library/types';

/**
 * Offline track analysis that runs entirely on the device: waveform with
 * colour bands, tempo + beat grid and musical key (Camelot notation).
 * No server, no API calls.
 */

const TARGET_RATE = 11025;
const WAVE_RATE = 50; // waveform buckets per second
const ENV_RATE = 100; // onset envelope frames per second

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

export interface AnalysisResult {
  analysis: Analysis;
  waveform: Waveform;
}

export async function analyzeChannels(
  channels: Float32Array[],
  sampleRate: number,
): Promise<AnalysisResult> {
  const mono = await downmix(channels, sampleRate);
  const rate = sampleRate / Math.max(1, Math.round(sampleRate / TARGET_RATE));
  const duration = channels[0].length / sampleRate;
  await yieldToUI();
  const waveform = computeWaveform(mono, rate);
  await yieldToUI();
  const env = onsetEnvelope(mono, rate);
  await yieldToUI();
  const { bpm, firstBeat } = detectTempo(env);
  await yieldToUI();
  const { key, camelot } = detectKey(mono, rate);
  return { analysis: { bpm, firstBeat, key, camelot, duration }, waveform };
}

async function downmix(channels: Float32Array[], sampleRate: number): Promise<Float32Array> {
  const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE));
  const len = Math.floor(channels[0].length / factor);
  const out = new Float32Array(len);
  const nch = channels.length;
  const norm = 1 / (factor * nch);
  for (let i = 0; i < len; i++) {
    let s = 0;
    const base = i * factor;
    for (let c = 0; c < nch; c++) {
      const ch = channels[c];
      for (let k = 0; k < factor; k++) s += ch[base + k];
    }
    out[i] = s * norm;
    if ((i & 0x3ffff) === 0 && i > 0) await yieldToUI();
  }
  return out;
}

function onePoleCoef(fc: number, rate: number) {
  return 1 - Math.exp((-2 * Math.PI * fc) / rate);
}

export function computeWaveform(x: Float32Array, rate: number): Waveform {
  const bucket = Math.max(1, Math.floor(rate / WAVE_RATE));
  const n = Math.floor(x.length / bucket);
  const peak: number[] = new Array(n);
  const low: number[] = new Array(n);
  const high: number[] = new Array(n);
  const aLow = onePoleCoef(220, rate);
  const aHi = onePoleCoef(2200, rate);
  let lp = 0;
  let lp2 = 0;
  let maxPeak = 1e-6;
  const rawPeak = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let p = 0;
    let eAll = 1e-9;
    let eLow = 0;
    let eHigh = 0;
    for (let i = b * bucket, end = i + bucket; i < end; i++) {
      const s = x[i];
      lp += aLow * (s - lp);
      lp2 += aHi * (s - lp2);
      const hp = s - lp2;
      const a = s < 0 ? -s : s;
      if (a > p) p = a;
      eAll += s * s;
      eLow += lp * lp;
      eHigh += hp * hp;
    }
    rawPeak[b] = p;
    if (p > maxPeak) maxPeak = p;
    low[b] = Math.min(255, Math.round(Math.sqrt(eLow / eAll) * 255));
    high[b] = Math.min(255, Math.round(Math.sqrt(eHigh / eAll) * 255));
  }
  for (let b = 0; b < n; b++) peak[b] = Math.round((rawPeak[b] / maxPeak) * 255);
  return { rate: rate / bucket, peak, low, high };
}

/** Half-wave rectified log-energy flux, emphasising the kick/bass band. */
export function onsetEnvelope(x: Float32Array, rate: number): Float32Array {
  const hop = rate / ENV_RATE;
  const n = Math.floor(x.length / hop);
  const env = new Float32Array(n);
  const aLow = onePoleCoef(150, rate);
  let lp = 0;
  let prevLow = 0;
  let prevAll = 0;
  for (let f = 0; f < n; f++) {
    let eLow = 0;
    let eAll = 0;
    const start = Math.floor(f * hop);
    const end = Math.floor((f + 1) * hop);
    for (let i = start; i < end; i++) {
      const s = x[i];
      lp += aLow * (s - lp);
      eLow += lp * lp;
      eAll += s * s;
    }
    const lLow = Math.log(1 + 1000 * eLow);
    const lAll = Math.log(1 + 1000 * eAll);
    const d = Math.max(0, lLow - prevLow) * 1.5 + Math.max(0, lAll - prevAll);
    env[f] = d;
    prevLow = lLow;
    prevAll = lAll;
  }
  // remove local mean (0.5 s window) and rectify
  const w = 25;
  const out = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < Math.min(n, w); i++) acc += env[i];
  for (let i = 0; i < n; i++) {
    const lo = i - w - 1;
    const hi = i + w;
    if (hi < n) acc += env[hi];
    if (lo >= 0) acc -= env[lo];
    const count = Math.min(n - 1, hi) - Math.max(0, lo + 1) + 1;
    out[i] = Math.max(0, env[i] - acc / count);
  }
  return out;
}

const MIN_BPM = 70;
const MAX_BPM = 180;

export function detectTempo(env: Float32Array): { bpm: number; firstBeat: number } {
  const n = env.length;
  if (n < ENV_RATE * 4) return { bpm: 0, firstBeat: 0 };
  const maxLag = Math.min(n - 1, Math.ceil(((60 * ENV_RATE) / MIN_BPM) * 4) + 2);
  const acf = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0, end = n - lag; i < end; i++) s += env[i] * env[i + lag];
    acf[lag] = s / (n - lag);
  }
  const acfAt = (lag: number) => {
    if (lag >= maxLag) return 0;
    const i = Math.floor(lag);
    const f = lag - i;
    return acf[i] * (1 - f) + acf[i + 1] * f;
  };
  const score = (bpm: number) => {
    const lag = (60 * ENV_RATE) / bpm;
    let s = acfAt(lag) + 0.5 * acfAt(2 * lag) + 0.25 * acfAt(4 * lag);
    // mild preference for common dance tempos
    const oct = Math.log2(bpm / 118);
    s *= Math.exp(-0.5 * (oct / 0.9) ** 2);
    return s;
  };
  let best = 120;
  let bestScore = -Infinity;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
    const s = score(bpm);
    if (s > bestScore) {
      bestScore = s;
      best = bpm;
    }
  }
  for (let bpm = best - 0.6; bpm <= best + 0.6; bpm += 0.01) {
    const s = score(bpm);
    if (s > bestScore) {
      bestScore = s;
      best = bpm;
    }
  }
  // The autocorrelation peak is only accurate to ~0.5 %. Refine with a comb
  // over the whole track: a wrong tempo drifts off the kicks and loses energy.
  const envAt = (t: number) => {
    const i = Math.floor(t);
    const f = t - i;
    return (env[i] || 0) * (1 - f) + (env[i + 1] || 0) * f;
  };
  const comb = (b: number) => {
    const period = (60 * ENV_RATE) / b;
    let bestS = -Infinity;
    let bestPh = 0;
    for (let ph = 0; ph < period; ph += 0.5) {
      let s = 0;
      for (let t = ph; t < n - 1; t += period) s += envAt(t);
      if (s > bestS) {
        bestS = s;
        bestPh = ph;
      }
    }
    return { score: bestS / Math.max(1, (n / period) | 0), phase: bestPh };
  };
  let bpm = best;
  let bestComb = comb(best);
  for (let b = best - 1; b <= best + 1; b += 0.02) {
    const c = comb(b);
    if (c.score > bestComb.score) {
      bestComb = c;
      bpm = b;
    }
  }
  if (Math.abs(bpm - Math.round(bpm)) < 0.06) {
    const rounded = Math.round(bpm);
    const c = comb(rounded);
    if (c.score >= bestComb.score * 0.97) {
      bpm = rounded;
      bestComb = c;
    }
  }
  bpm = Math.round(bpm * 100) / 100;
  return { bpm, firstBeat: bestComb.phase / ENV_RATE };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

function pearson(a: number[], b: number[]) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

export function detectKey(x: Float32Array, rate: number): { key: string; camelot: string } {
  const N = 4096;
  const frames = Math.min(160, Math.floor(x.length / N));
  if (frames < 4) return { key: '', camelot: '' };
  const step = Math.floor((x.length - N) / frames);
  const window = new Float32Array(N);
  for (let i = 0; i < N; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const notes: { pc: number; coef: number }[] = [];
  for (let m = 40; m <= 88; m++) {
    const f = 440 * 2 ** ((m - 69) / 12);
    if (f >= rate / 2) break;
    notes.push({ pc: m % 12, coef: 2 * Math.cos((2 * Math.PI * f) / rate) });
  }
  const chroma = new Array(12).fill(0);
  const buf = new Float32Array(N);
  for (let fr = 0; fr < frames; fr++) {
    const off = fr * step;
    for (let i = 0; i < N; i++) buf[i] = x[off + i] * window[i];
    for (const { pc, coef } of notes) {
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < N; i++) {
        const s0 = buf[i] + coef * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      const power = s1 * s1 + s2 * s2 - coef * s1 * s2;
      chroma[pc] += Math.sqrt(Math.max(0, power));
    }
  }
  let bestKey = 0;
  let bestMinor = false;
  let bestScore = -Infinity;
  for (let k = 0; k < 12; k++) {
    const rotated = chroma.map((_, i) => chroma[(i + k) % 12]);
    const sMaj = pearson(rotated, MAJOR);
    const sMin = pearson(rotated, MINOR);
    if (sMaj > bestScore) {
      bestScore = sMaj;
      bestKey = k;
      bestMinor = false;
    }
    if (sMin > bestScore) {
      bestScore = sMin;
      bestKey = k;
      bestMinor = true;
    }
  }
  const key = NOTE_NAMES[bestKey] + (bestMinor ? 'm' : '');
  const camelot = bestMinor ? `${CAMELOT_MINOR[bestKey]}A` : `${CAMELOT_MAJOR[bestKey]}B`;
  return { key, camelot };
}

/** Camelot wheel neighbours: same, ±1 and relative major/minor mix harmonically. */
export function isHarmonic(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const la = a.slice(-1);
  const lb = b.slice(-1);
  if (na === nb) return true;
  const diff = (na - nb + 12) % 12;
  return la === lb && (diff === 1 || diff === 11);
}

export function bpmFromTaps(taps: number[]): number {
  if (taps.length < 2) return 0;
  const intervals: number[] = [];
  for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
  const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  return Math.round((60000 / avg) * 10) / 10;
}
