import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeChannels, applyBpmHint, isHarmonic } from '../src/audio/analysis.ts';
import { synthTrack } from './synth.mjs';

const cases = [
  { bpm: 124, root: 57, minor: true, camelot: '8A' }, // A minor
  { bpm: 128, root: 60, minor: false, camelot: '8B' }, // C major
  { bpm: 95, root: 62, minor: true, camelot: '7A' }, // D minor (reggaeton tempo)
  { bpm: 174, root: 55, minor: true, camelot: '6A' }, // G minor, drum & bass
];

for (const c of cases) {
  test(`detects ${c.bpm} BPM and key ${c.camelot}`, async () => {
    const x = synthTrack({ bpm: c.bpm, root: c.root, minor: c.minor, offset: 0.3 });
    const { analysis, waveform } = await analyzeChannels([x], 44100);
    // 174 may legitimately fold to half-time (87)
    const bpm = analysis.bpm;
    const ok = Math.abs(bpm - c.bpm) < 0.2 || Math.abs(bpm * 2 - c.bpm) < 0.3;
    assert.ok(ok, `bpm ${bpm} vs ${c.bpm}`);
    assert.equal(analysis.camelot, c.camelot);
    const beat = 60 / c.bpm;
    const phaseErr = Math.abs(((analysis.firstBeat - 0.3) / beat) % 1);
    assert.ok(Math.min(phaseErr, 1 - phaseErr) < 0.08, `beat phase off: firstBeat ${analysis.firstBeat}`);
    assert.ok(waveform.peak.length > 1500);
    assert.ok(Math.abs(analysis.duration - 40) < 0.01);
  });
}

test('camelot compatibility', () => {
  assert.ok(isHarmonic('8A', '8A'));
  assert.ok(isHarmonic('8A', '9A'));
  assert.ok(isHarmonic('12B', '1B'));
  assert.ok(isHarmonic('8A', '8B'));
  assert.ok(!isHarmonic('8A', '10A'));
});

test('file name settles half/double time', () => {
  assert.equal(applyBpmHint(87, 'MrDj Demo - Ruta 5 Sur (Drum and Bass 174).mp3'), 174);
  assert.equal(applyBpmHint(87, 'Boom Bap 87 BPM.mp3'), 87);
  assert.equal(applyBpmHint(87, 'some track.mp3'), 87);
  assert.equal(applyBpmHint(140, 'Dubstep 70bpm.wav'), 70);
  assert.equal(applyBpmHint(128, '01 - Artist - Song (Original Mix).mp3'), 128);
});
