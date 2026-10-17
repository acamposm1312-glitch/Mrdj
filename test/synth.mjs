// Deterministic synthetic dance loops used by tests and the browser smoke test.
export function synthTrack({ bpm, seconds = 40, rate = 44100, offset = 0.25, root = 57, minor = true }) {
  const n = Math.floor(seconds * rate);
  const out = new Float32Array(n);
  const beat = 60 / bpm;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const freq = (m) => 440 * 2 ** ((m - 69) / 12);
  const chord = minor ? [0, 3, 7] : [0, 4, 7];
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let s = 0;
    // pad chord + bass
    for (const c of chord) s += 0.06 * Math.sin(2 * Math.PI * freq(root + c) * t);
    s += 0.08 * Math.sin(2 * Math.PI * freq(root - 12) * t);
    const tb = t - offset;
    if (tb >= 0) {
      const k = tb % beat;
      // kick
      if (k < 0.18) s += 0.8 * Math.exp(-k * 22) * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-k * 30)) * k);
      // off-beat hat
      const h = (tb + beat / 2) % beat;
      if (h < 0.04) s += 0.15 * Math.exp(-h * 90) * rnd();
    }
    out[i] = s;
  }
  return out;
}

export function wav(samples, rate = 44100) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}
