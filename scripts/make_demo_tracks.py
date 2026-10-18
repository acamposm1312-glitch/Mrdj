"""Generates MrDj's royalty-free demo tracks (original synth compositions).

Every sound is synthesized here, so the tracks are free to use and share.
    python3 scripts/make_demo_tracks.py public/demo
"""
import os
import sys
import numpy as np
import lameenc

SR = 44100
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a=0.005, d=0.1, s=0.0, r=0.05, length=None):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    length = length or n
    e = np.zeros(n)
    e[:a_n] = np.linspace(0, 1, a_n, endpoint=False)
    dd = min(d_n, max(0, length - a_n))
    e[a_n:a_n + dd] = np.linspace(1, s, dd, endpoint=False)
    e[a_n + dd:length] = s
    rr = min(r_n, n - length)
    if rr > 0:
        e[length:length + rr] = np.linspace(s if s else e[length - 1], 0, rr)
    return e


def lowpass(x, fc):
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # small buffers only
        acc += a * (x[i] - acc)
        y[i] = acc
    return y


def kick(level=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return level * np.sin(ph) * np.exp(-t * 7.5) + level * 0.3 * np.exp(-t * 300) * rng.uniform(-1, 1, n)


def noise_hit(dur, decay, hp=True, level=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.uniform(-1, 1, n)
    if hp:
        x = x - lowpass(x, 6000)
    return level * x * np.exp(-t * decay)


def clap(level=0.5):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    x = rng.uniform(-1, 1, n)
    x = x - lowpass(x, 900)
    e = np.exp(-t * 18) + 0.6 * np.exp(-np.maximum(t - 0.012, 0) * 40) * (t > 0.012)
    return level * x * e * 0.6


def tom(note, level=0.5):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = midi(note) * (1 + 0.5 * np.exp(-t * 40))
    return level * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12)


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune) if detune else (0,):
        f = freq * (1 + d)
        out += 2 * ((t * f) % 1) - 1
    return out / (3 if detune else 1)


def bass(note, dur, level=0.5, cutoff=600):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(note)
    x = 0.7 * np.sin(2 * np.pi * f * t) + 0.3 * lowpass(saw(f, n), cutoff)
    return level * x * env(n, 0.004, dur * 0.6, 0.5, 0.03, int(n * 0.9))


def chord(notes, dur, level=0.18, cutoff=2500, pluck=False):
    n = int(dur * SR)
    x = np.zeros(n)
    for nt in notes:
        x += saw(midi(nt), n, detune=0.004)
    x = lowpass(x / len(notes), cutoff)
    e = env(n, 0.003, 0.18, 0.0, 0.02) if pluck else env(n, 0.04, 0.3, 0.7, 0.2, int(n * 0.85))
    return level * x * e


def piano(notes, dur, level=0.25):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for nt in notes:
        f = midi(nt)
        x += np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) + 0.15 * np.sin(6 * np.pi * f * t)
    return level * x / len(notes) * np.exp(-t * 2.2) * env(n, 0.003, 0.01, 1.0, 0.05, int(n * 0.95))


def resonant_lp(x, fc, q=0.2):
    """Chamberlin state-variable low-pass; fc may be an array (filter sweeps)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    f = 2 * np.sin(np.pi * np.minimum(fc, SR / 6) / SR)
    low = band = 0.0
    y = np.empty_like(x)
    for i in range(len(x)):
        low += f[i] * band
        high = x[i] - low - q * band
        band += f[i] * high
        y[i] = low
    return y


def acid(note, dur, level=0.3, cutoff=500, accent=False):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(note)
    sq = np.sign(np.sin(2 * np.pi * f * t)) * 0.6 + 0.4 * (2 * ((t * f) % 1) - 1)
    sweep = cutoff * (1 + (5 if accent else 3) * np.exp(-t * 14))
    x = np.tanh(2 * resonant_lp(sq, sweep, 0.12))
    return level * x * env(n, 0.002, dur * 0.5, 0.6, 0.01, int(n * 0.85))


def reese(note, dur, level=0.5):
    n = int(dur * SR)
    f = midi(note)
    x = saw(f, n, detune=0.012) + 0.6 * np.sin(2 * np.pi * f / 2 * np.arange(n) / SR)
    x = lowpass(np.tanh(1.5 * x), 380)
    return level * x * env(n, 0.01, 0.2, 0.9, 0.05, int(n * 0.95))


def supersaw(notes, dur, level=0.15, cutoff=3000, attack=0.02):
    n = int(dur * SR)
    x = np.zeros(n)
    for nt in notes:
        x += saw(midi(nt), n, detune=0.011) + 0.5 * saw(midi(nt + 12), n, detune=0.007)
    x = lowpass(x / len(notes), cutoff)
    return level * x * env(n, attack, 0.2, 0.8, 0.15, int(n * 0.9))


def lead(note, dur, level=0.18, cutoff=2600):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = saw(midi(note), n, detune=0.006) + 0.5 * np.sin(2 * np.pi * midi(note - 12) * t)
    return level * lowpass(x, cutoff) * env(n, 0.003, 0.12, 0.25, 0.04, int(n * 0.8))


def snare(level=0.5):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    x = rng.uniform(-1, 1, n)
    x = x - lowpass(x, 1500)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 35)
    return level * (0.7 * x * np.exp(-t * 16) + 0.6 * tone)


def riser(beats, bpm, level=0.25):
    n = int(beats * 60 / bpm * SR)
    k = np.linspace(0, 1, n)
    x = rng.uniform(-1, 1, n)
    return level * resonant_lp(x, 300 + 9000 * k ** 2, 0.5) * k


class Track:
    def __init__(self, bpm, bars, offset=0.25):
        self.bpm = bpm
        self.beat = 60 / bpm
        self.offset = offset
        self.bars = bars
        n = int((offset + bars * 4 * self.beat + 2) * SR)
        self.L = np.zeros(n)
        self.R = np.zeros(n)
        self.padL = np.zeros(n)  # pumped by the kick (side-chain)
        self.padR = np.zeros(n)

    def put(self, sample, beat_pos, pan=0.0):
        i = int((self.offset + beat_pos * self.beat) * SR)
        j = min(len(self.L), i + len(sample))
        s = sample[: j - i]
        self.L[i:j] += s * (1 - max(0, pan))
        self.R[i:j] += s * (1 + min(0, pan))

    def pad(self, sample, beat_pos, pan=0.0):
        i = int((self.offset + beat_pos * self.beat) * SR)
        j = min(len(self.L), i + len(sample))
        s = sample[: j - i]
        self.padL[i:j] += s * (1 - max(0, pan))
        self.padR[i:j] += s * (1 + min(0, pan))

    def echo(self, sample, beat_pos, pan=0.0, fb=0.4, time=0.75):
        # ping-pong dotted-eighth delay
        for k in range(4):
            self.put(sample * (fb ** k), beat_pos + k * time, pan=pan if k % 2 == 0 else -pan)

    def master(self, path, title, artist):
        if np.any(self.padL):
            t = (np.arange(len(self.L)) / SR - self.offset) % self.beat
            pump = 1 - 0.7 * np.exp(-t * 9)
            self.L += self.padL * pump
            self.R += self.padR * pump
        x = np.stack([self.L, self.R], 1)
        x = np.tanh(x * 1.1) * 0.9
        x /= np.max(np.abs(x)) / 0.95
        # fade out the tail
        tail = int(1.5 * SR)
        x[-tail:] *= np.linspace(1, 0, tail)[:, None]
        pcm = (x * 32767).astype(np.int16)
        enc = lameenc.Encoder()
        enc.set_bit_rate(192)
        enc.set_in_sample_rate(SR)
        enc.set_channels(2)
        enc.set_quality(2)
        data = enc.encode(pcm.tobytes()) + enc.flush()
        with open(path, 'wb') as f:
            f.write(data)
        raw = os.environ.get('MRDJ_RAW_DIR')
        if raw:  # mono float32 dump so the analyser can be checked against it
            x.mean(1).astype(np.float32).tofile(os.path.join(raw, os.path.basename(path) + '.f32'))
        print(f'{path}: {len(data) / 1e6:.1f} MB, {title} – {artist}')


def section(bar, parts):
    return [name for name, (a, b) in parts.items() if a <= bar < b]


def afro_house(out):
    t = Track(122, 72)
    K, SH, CL = kick(), noise_hit(0.06, 70, level=0.12), clap(0.35)
    toms = [tom(57, 0.35), tom(62, 0.3), tom(64, 0.28)]
    prog = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]]  # Am7 Fmaj7 G7 Em7
    roots = [45, 41, 43, 40]
    parts = {'kick': (0, 64), 'perc': (0, 72), 'bass': (16, 32), 'bass2': (40, 64), 'chords': (8, 64), 'clap': (16, 64)}
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        for s in range(16):
            if 'perc' in on:
                t.put(SH * (1.0 if s % 2 else 0.6), b0 + s / 4, pan=0.3)
        if 'kick' in on and not (32 <= bar < 40):
            for q in range(4):
                t.put(K, b0 + q)
        if 'perc' in on:
            for pos, k in [(0.75, 0), (1.5, 1), (2.25, 2), (3.5, 0)]:
                t.put(toms[k], b0 + pos, pan=-0.4)
        if 'clap' in on and not (32 <= bar < 40):
            t.put(CL, b0 + 1)
            t.put(CL, b0 + 3)
        c = (bar // 2) % 4
        if 'chords' in on:
            for pos in (0.5, 1.75, 3.0):
                t.put(chord(prog[c], 0.35 * t.beat, 0.2, 2200, pluck=True), b0 + pos)
        if 32 <= bar < 40:
            t.put(chord(prog[c], 4 * t.beat, 0.22, 1600), b0)
        if 'bass' in on or 'bass2' in on:
            for pos in (0.5, 1.5, 2.5, 3.25):
                t.put(bass(roots[c], 0.4 * t.beat, 0.55), b0 + pos)
    t.master(out, 'Sol de Tambores', 'MrDj Demo')


def tech_house(out):
    t = Track(125, 72)
    K, OH, CH, CL = kick(1.05), noise_hit(0.18, 18, level=0.16), noise_hit(0.04, 90, level=0.1), clap(0.45)
    roots = [41, 41, 44, 39]  # F minor riff
    parts = {'kick': (0, 64), 'hats': (8, 68), 'bass': (16, 64), 'stab': (24, 64)}
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        brk = 40 <= bar < 48
        if 'kick' in on and not brk:
            for q in range(4):
                t.put(K, b0 + q)
        if 'hats' in on:
            for q in range(4):
                t.put(OH, b0 + q + 0.5, pan=0.2)
                for s in (0.25, 0.75):
                    t.put(CH, b0 + q + s, pan=-0.2)
            if not brk:
                t.put(CL, b0 + 1)
                t.put(CL, b0 + 3)
        r = roots[(bar // 2) % 4]
        if 'bass' in on and not brk:
            for s in range(16):
                if s % 4 in (1, 2, 3):
                    t.put(bass(r + (12 if s % 8 == 7 else 0), 0.22 * t.beat, 0.45, 450), b0 + s / 4)
        if 'stab' in on and bar % 2 == 1:
            t.put(chord([r + 24, r + 27, r + 31], 0.3 * t.beat, 0.22, 3000, pluck=True), b0 + 3.5)
        if brk:
            t.put(chord([r + 12, r + 15, r + 19, r + 22], 4 * t.beat, 0.2, 1200), b0)
    t.master(out, 'Martes de Hormigón', 'MrDj Demo')


def reggaeton(out):
    t = Track(95, 56)
    K, SN, HH = kick(1.0), clap(0.55), noise_hit(0.05, 80, level=0.12)
    prog = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]]  # Dm Bb C A
    roots = [38, 34, 36, 33]
    parts = {'beat': (4, 52), 'pads': (0, 56), 'bass': (8, 52), 'lead': (20, 44)}
    lead = [74, 72, 69, 72, 74, 77, 76, 74]
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        c = bar % 4
        if 'beat' in on:
            for q in range(4):
                t.put(K, b0 + q)
            for pos in (0.75, 1.5, 2.75, 3.5):  # dembow
                t.put(SN, b0 + pos)
            for s in range(8):
                t.put(HH, b0 + s / 2, pan=0.25)
        if 'pads' in on:
            t.put(chord(prog[c], 4 * t.beat, 0.16, 1400), b0)
        if 'bass' in on:
            t.put(bass(roots[c], 1.5 * t.beat, 0.6, 300), b0)
            t.put(bass(roots[c], 1.0 * t.beat, 0.5, 300), b0 + 2.5)
        if 'lead' in on:
            for i, nt in enumerate(lead):
                if (i + bar) % 3 != 2:
                    t.put(piano([nt], 0.45 * t.beat, 0.22), b0 + i / 2)
    t.master(out, 'Perreo en Temuco', 'MrDj Demo')


def house(out):
    t = Track(128, 72)
    K, CL, OH = kick(1.0), clap(0.4), noise_hit(0.15, 22, level=0.14)
    prog = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]]  # C Am F G
    roots = [36, 33, 41, 43]
    parts = {'kick': (0, 64), 'hats': (8, 68), 'piano': (16, 64), 'bass': (16, 64)}
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        brk = 40 <= bar < 48
        c = (bar // 2) % 4
        if 'kick' in on and not brk:
            for q in range(4):
                t.put(K, b0 + q)
            t.put(CL, b0 + 1)
            t.put(CL, b0 + 3)
        if 'hats' in on:
            for q in range(4):
                t.put(OH, b0 + q + 0.5, pan=0.2)
        if 'piano' in on or brk:
            for pos in (0, 0.75, 1.5, 2.5, 3.25):
                t.put(piano(prog[c], 0.6 * t.beat, 0.3), b0 + pos)
        if 'bass' in on and not brk:
            for pos in (0.5, 1.5, 2.5, 3.5):
                t.put(bass(roots[c], 0.4 * t.beat, 0.5, 500), b0 + pos)
    t.master(out, 'Piano de Medianoche', 'MrDj Demo')


def techno(out):
    t = Track(130, 72)
    K, CH, RD, CL = kick(1.1), noise_hit(0.03, 110, level=0.1), noise_hit(0.4, 8, level=0.06), clap(0.35)
    riff = [45, 45, 57, 45, 48, 45, 55, 45, 45, 52, 45, 57, 45, 48, 50, 45]  # A minor acid line
    parts = {'kick': (0, 64), 'hats': (4, 68), 'rumble': (8, 64), 'acid': (16, 64), 'ride': (24, 64), 'clap': (16, 64)}
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        brk = 40 <= bar < 48
        if 'kick' in on and not brk:
            for q in range(4):
                t.put(K, b0 + q)
                if 'rumble' in on:  # low rumble tail between kicks
                    t.put(bass(33, 0.5 * t.beat, 0.25, 140), b0 + q + 0.5)
        if 'hats' in on:
            for s in range(16):
                if s % 4 != 0:
                    t.put(CH * (1.0 if s % 2 else 0.5), b0 + s / 4, pan=0.3 if s % 4 == 2 else -0.3)
        if 'ride' in on and not brk:
            for q in range(4):
                t.put(RD, b0 + q + 0.5, pan=-0.15)
        if 'clap' in on and not brk:
            t.put(CL, b0 + 1)
            t.put(CL, b0 + 3)
        if 'acid' in on or brk:
            cut = 300 + 900 * (((bar - 16) % 16) / 15)
            for s, nt in enumerate(riff):
                if brk and s % 2:
                    continue
                t.put(acid(nt, 0.24 * t.beat, 0.28, cut, accent=s in (2, 6, 11)), b0 + s / 4, pan=0.1)
        if bar in (38, 39):
            t.put(riser(4, 130), b0)
    t.master(out, 'Fábrica Nocturna', 'MrDj Demo')


def deep_house(out):
    t = Track(120, 68)
    K, CL, SH, OH = kick(0.95), clap(0.3), noise_hit(0.05, 60, level=0.09), noise_hit(0.2, 15, level=0.1)
    prog = [[50, 53, 57, 60, 64], [48, 52, 55, 58, 62], [46, 50, 53, 57, 60], [45, 48, 52, 55, 59]]  # Dm9 C9 Bbmaj9 Am9
    roots = [38, 36, 34, 33]
    parts = {'kick': (0, 60), 'perc': (4, 64), 'chords': (8, 60), 'bass': (16, 60)}
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        brk = 36 <= bar < 44
        c = (bar // 2) % 4
        if 'kick' in on and not brk:
            for q in range(4):
                t.put(K, b0 + q)
            t.put(CL, b0 + 1)
            t.put(CL, b0 + 3)
        if 'perc' in on:
            for s in range(8):
                swing = 0.08 if s % 2 else 0  # shuffled 8ths
                t.put(SH, b0 + s / 2 + swing, pan=0.35)
            for q in range(4):
                t.put(OH, b0 + q + 0.5, pan=-0.2)
        if 'chords' in on or brk:
            for pos in ((0, 1.5, 2.75) if not brk else (0,)):
                d = 1.2 if not brk else 4
                t.pad(chord(prog[c], d * t.beat, 0.2, 1100 if not brk else 800), b0 + pos)
        if 'bass' in on and not brk:
            for pos, k in ((0, 0), (0.75, 0), (2.5, 12), (3.25, 0)):
                t.put(bass(roots[c] + k, 0.5 * t.beat, 0.5, 260), b0 + pos)
    t.master(out, 'Lluvia en Valdivia', 'MrDj Demo')


def melodic_techno(out):
    t = Track(124, 72)
    K, CH, CL = kick(1.05), noise_hit(0.03, 100, level=0.09), clap(0.3)
    roots = [40, 40, 36, 38]  # E minor, C, D
    parts = {'kick': (0, 64), 'hats': (8, 68), 'bass': (8, 64), 'arp': (16, 64), 'pad': (0, 72)}
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        brk = 40 <= bar < 48
        r = roots[(bar // 4) % 4]
        if 'kick' in on and not brk:
            for q in range(4):
                t.put(K, b0 + q)
            if bar >= 16:
                t.put(CL, b0 + 1)
                t.put(CL, b0 + 3)
        if 'hats' in on:
            for q in range(4):
                t.put(CH, b0 + q + 0.5, pan=0.25)
        if 'bass' in on and not brk:
            for s in range(16):
                if s % 4 != 0:  # rolling off-beat 16ths
                    t.put(bass(r, 0.2 * t.beat, 0.42, 380), b0 + s / 4)
        if 'arp' in on or brk:
            cut = 900 + 2200 * (((bar - 16) % 24) / 23)
            third = 3 if r == 40 else 4
            for s in range(16):
                nt = r + 24 + [0, 7, 12, third + 12, 19, third + 12, 12, 7][s % 8]
                t.echo(lead(nt, 0.22 * t.beat, 0.1, cut), b0 + s / 4, pan=0.35, fb=0.35)
        if 'pad' in on and bar % 4 == 0:
            third = 3 if r == 40 else 4
            t.pad(supersaw([r + 12, r + 12 + third, r + 19], 16 * t.beat, 0.08, 1200, attack=1.5), b0)
        if bar in (46, 47):
            t.put(riser(4, 124), b0)
    t.master(out, 'Volcán Llaima', 'MrDj Demo')


def progressive_house(out):
    t = Track(126, 72)
    K, CL, OH, CH = kick(1.0), clap(0.38), noise_hit(0.16, 20, level=0.13), noise_hit(0.03, 100, level=0.08)
    prog = [[55, 58, 62], [51, 55, 58], [53, 57, 60], [50, 53, 57]]  # Gm Eb F Dm
    roots = [43, 39, 41, 38]
    hook = [74, 70, 72, 74, 77, 74, 72, 70]
    parts = {'kick': (0, 64), 'hats': (8, 68), 'bass': (16, 64), 'chords': (16, 64), 'hook': (24, 64)}
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        brk = 40 <= bar < 48
        c = (bar // 2) % 4
        if 'kick' in on and not brk:
            for q in range(4):
                t.put(K, b0 + q)
            t.put(CL, b0 + 1)
            t.put(CL, b0 + 3)
        if 'hats' in on:
            for q in range(4):
                t.put(OH, b0 + q + 0.5, pan=0.2)
                t.put(CH, b0 + q + 0.25, pan=-0.3)
                t.put(CH, b0 + q + 0.75, pan=-0.3)
        if 'bass' in on and not brk:
            for q in range(4):
                t.put(bass(roots[c], 0.45 * t.beat, 0.5, 420), b0 + q + 0.5)
        if 'chords' in on or brk:
            t.pad(supersaw(prog[c], 2 * t.beat, 0.12, 2000 if not brk else 1200), b0)
            t.pad(supersaw(prog[c], 2 * t.beat, 0.12, 2000 if not brk else 1200), b0 + 2)
        if 'hook' in on or brk:
            for i, nt in enumerate(hook):
                if (i + bar) % 4 != 3:
                    t.echo(lead(nt, 0.4 * t.beat, 0.13, 3200), b0 + i / 2, pan=0.3)
        if bar in (46, 47):
            t.put(riser(4, 126), b0)
    t.master(out, 'Lago Villarrica', 'MrDj Demo')


def trance(out):
    t = Track(138, 80)
    K, CL, OH = kick(1.05), clap(0.35), noise_hit(0.12, 25, level=0.15)
    prog = [[53, 56, 60], [49, 53, 56], [51, 55, 58], [48, 51, 55]]  # Fm Db Eb Cm
    roots = [41, 37, 39, 36]
    gate = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1]
    melody = [77, 75, 72, 75, 77, 80, 79, 75]
    parts = {'kick': (0, 72), 'hats': (8, 76), 'bass': (8, 72), 'gate': (16, 72), 'lead': (32, 72)}
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        brk = 44 <= bar < 52
        c = (bar // 2) % 4
        if 'kick' in on and not brk:
            for q in range(4):
                t.put(K, b0 + q)
            if bar >= 16:
                t.put(CL, b0 + 1)
                t.put(CL, b0 + 3)
        if 'hats' in on and not brk:
            for q in range(4):
                t.put(OH, b0 + q + 0.5, pan=0.2)
        if 'bass' in on and not brk:
            for q in range(4):  # classic off-beat rolling bass
                for s in (0.25, 0.5, 0.75):
                    t.put(bass(roots[c], 0.2 * t.beat, 0.45, 600), b0 + q + s)
        if 'gate' in on and not brk:
            for s, g in enumerate(gate):
                if g:
                    t.pad(supersaw(prog[c], 0.22 * t.beat, 0.09, 2600), b0 + s / 4)
        if brk:
            t.pad(supersaw(prog[c], 4 * t.beat, 0.13, 1500, attack=0.4), b0)
        if 'lead' in on or (brk and bar >= 48):
            for i, nt in enumerate(melody):
                t.echo(lead(nt, 0.45 * t.beat, 0.14, 3800), b0 + i / 2, pan=0.35, fb=0.3)
        if bar in (50, 51):
            t.put(riser(4, 138), b0)
    t.master(out, 'Cordillera', 'MrDj Demo')


def drum_and_bass(out):
    t = Track(174, 96)
    K, SN, HH, RD = kick(0.9), snare(1.2), noise_hit(0.04, 90, level=0.11), noise_hit(0.3, 10, level=0.06)
    roots = [36, 36, 32, 34]  # C minor, Ab, Bb
    prog = [[60, 63, 67], [60, 63, 67], [56, 60, 63], [58, 62, 65]]
    parts = {'drums': (8, 88), 'bass': (16, 88), 'pad': (0, 96), 'ride': (24, 88)}
    for bar in range(t.bars):
        on = section(bar, parts)
        b0 = bar * 4
        brk = 56 <= bar < 64
        r = roots[(bar // 2) % 4]
        if 'drums' in on and not brk:
            t.put(K, b0)  # two-step
            t.put(K, b0 + 2.5)
            t.put(SN, b0 + 1)
            t.put(SN, b0 + 3)
            if bar % 4 == 3:
                t.put(SN * 0.4, b0 + 3.75)
            for s in range(8):
                t.put(HH * (1.0 if s % 2 else 0.6), b0 + s / 2, pan=0.3)
        if 'ride' in on and not brk:
            for q in range(4):
                t.put(RD, b0 + q + 0.5, pan=-0.2)
        if 'bass' in on and not brk:
            t.put(reese(r, 1.4 * t.beat, 0.55), b0)
            t.put(reese(r + (3 if bar % 2 else 0), 1.2 * t.beat, 0.5), b0 + 2.5)
        if 'pad' in on and bar % 2 == 0:
            t.pad(chord(prog[(bar // 2) % 4], 8 * t.beat, 0.11, 1400), b0)
        if bar in (62, 63):
            t.put(riser(4, 174), b0)
    t.master(out, 'Ruta 5 Sur', 'MrDj Demo')


NEW = {
    'techno': ('MrDj Demo - Fabrica Nocturna (Techno 130).mp3', techno),
    'deep': ('MrDj Demo - Lluvia en Valdivia (Deep House 120).mp3', deep_house),
    'melodic': ('MrDj Demo - Volcan Llaima (Melodic Techno 124).mp3', melodic_techno),
    'prog': ('MrDj Demo - Lago Villarrica (Progressive House 126).mp3', progressive_house),
    'trance': ('MrDj Demo - Cordillera (Trance 138).mp3', trance),
    'dnb': ('MrDj Demo - Ruta 5 Sur (Drum and Bass 174).mp3', drum_and_bass),
}


if __name__ == '__main__':
    d = sys.argv[1] if len(sys.argv) > 1 else 'public/demo'
    only = sys.argv[2:]  # e.g. `techno trance` to render just those
    for key, (name, fn) in NEW.items():
        if not only or key in only:
            fn(f'{d}/{name}')
    if only:
        sys.exit(0)
    afro_house(f'{d}/MrDj Demo - Sol de Tambores (Afro House 122).mp3')
    tech_house(f'{d}/MrDj Demo - Martes de Hormigon (Tech House 125).mp3')
    reggaeton(f'{d}/MrDj Demo - Perreo en Temuco (Reggaeton 95).mp3')
    house(f'{d}/MrDj Demo - Piano de Medianoche (House 128).mp3')
