import { getEngine } from '../audio/engine';

export type MidiKind = 'button' | 'knob' | 'jog';

export interface MidiTarget {
  id: string;
  label: string;
  kind: MidiKind;
  /** value 0..1 for knobs, 1/0 press/release for buttons, signed ticks for jog */
  handle: (value: number) => void;
}

const bi = (v: number) => v * 2 - 1;

export function buildTargets(): MidiTarget[] {
  const e = getEngine();
  const list: MidiTarget[] = [];
  e.decks.forEach((d, i) => {
    const L = 'ABCD'[i];
    const btn = (id: string, label: string, fn: () => void, release?: () => void) =>
      list.push({ id: `d${i}.${id}`, label: `${L} ${label}`, kind: 'button', handle: (v) => (v > 0 ? fn() : release?.()) });
    const knob = (id: string, label: string, fn: (v: number) => void) =>
      list.push({ id: `d${i}.${id}`, label: `${L} ${label}`, kind: 'knob', handle: fn });
    btn('play', 'PLAY', () => e.togglePlay(i));
    btn('cue', 'CUE', () => d.cueDown(), () => d.cueUp());
    btn('sync', 'SYNC', () => e.toggleSync(i));
    for (let h = 0; h < 8; h++) btn(`hot${h}`, `HOT CUE ${h + 1}`, () => d.hotCue(h));
    btn('loop', 'LOOP 4', () => d.autoLoop(4));
    btn('loopHalf', 'LOOP ÷2', () => d.resizeLoop(0.5));
    btn('loopDouble', 'LOOP ×2', () => d.resizeLoop(2));
    btn('pfl', 'CUE (PFL)', () => d.setPfl(!d.pfl));
    btn('fx', 'FX ON', () => d.fx.setOn(!d.fx.on));
    knob('pitch', 'TEMPO', (v) => e.setPitch(i, -bi(v)));
    knob('volume', 'VOLUMEN', (v) => d.setVolume(v));
    knob('trim', 'GAIN', (v) => d.setTrim(bi(v)));
    knob('high', 'HI', (v) => d.setEq('high', bi(v)));
    knob('mid', 'MID', (v) => d.setEq('mid', bi(v)));
    knob('low', 'LOW', (v) => d.setEq('low', bi(v)));
    knob('filter', 'FILTRO', (v) => d.setFilter(bi(v)));
    knob('fxMix', 'FX MIX', (v) => {
      d.fx.setMix(v);
      e.emit();
    });
    list.push({
      id: `d${i}.jog`,
      label: `${L} JOG`,
      kind: 'jog',
      handle: (ticks) => {
        if (d.playing) {
          d.setBend(ticks * 0.02);
          setTimeout(() => d.setBend(0), 80);
        } else d.seek(d.position() + ticks * 0.01);
      },
    });
  });
  list.push({ id: 'xfader', label: 'Crossfader', kind: 'knob', handle: (v) => e.setCrossfader(bi(v)) });
  list.push({ id: 'master', label: 'Master', kind: 'knob', handle: (v) => e.setMasterVolume(v) });
  list.push({ id: 'cueMix', label: 'CUE/MST', kind: 'knob', handle: (v) => e.setCueMix(v) });
  return list;
}
