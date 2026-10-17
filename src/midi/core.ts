import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { buildTargets, MidiTarget } from './targets';

/**
 * Platform-independent MIDI state: device list, MIDI-learn and the mapping
 * from controller messages to MrDj controls. Web (Web MIDI) and native
 * (mrdj-midi module) only differ in how bytes arrive — see midi.ts / midi.web.ts.
 */
export interface MidiState {
  supported: boolean;
  bluetoothPairing: boolean;
  devices: string[];
  learning: string | null;
  mappings: Record<string, string>;
  learn: (targetId: string | null) => void;
  clear: () => void;
}

export const useMidiStore = create<MidiState>()(
  persist(
    (set) => ({
      supported: false,
      bluetoothPairing: false,
      devices: [],
      learning: null,
      mappings: {},
      learn: (targetId) => set({ learning: targetId }),
      clear: () => set({ mappings: {} }),
    }),
    {
      name: 'mrdj-midi',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ mappings: s.mappings }),
    },
  ),
);

let targets: Map<string, MidiTarget> | null = null;

function dispatch(status: number, d1: number, d2: number) {
  const type = status & 0xf0;
  const ch = status & 0x0f;
  const isNote = type === 0x90 || type === 0x80;
  if (!isNote && type !== 0xb0) return;
  const key = `${isNote ? 'n' : 'c'}${ch}:${d1}`;
  const state = useMidiStore.getState();
  if (!targets) targets = new Map(buildTargets().map((t) => [t.id, t]));
  if (state.learning) {
    if (isNote && (type === 0x80 || d2 === 0)) return;
    useMidiStore.setState({ mappings: { ...state.mappings, [key]: state.learning }, learning: null });
    return;
  }
  const target = targets.get(state.mappings[key]);
  if (!target) return;
  if (target.kind === 'button') target.handle(type === 0x90 && d2 > 0 ? 1 : isNote ? 0 : d2 > 63 ? 1 : 0);
  else if (target.kind === 'jog') target.handle(d2 < 64 ? d2 : d2 - 128);
  else target.handle(d2 / 127);
}

let running = 0;

/** Parses a raw byte stream (several messages, running status) and dispatches each. */
export function handleMidiBytes(bytes: ArrayLike<number>) {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b >= 0xf8) {
      i++; // realtime (clock, start/stop…)
      continue;
    }
    if (b === 0xf0) {
      while (i < bytes.length && bytes[i] !== 0xf7) i++; // skip sysex
      i++;
      continue;
    }
    if (b & 0x80) {
      running = b;
      i++;
    }
    const type = running & 0xf0;
    const len = type === 0xc0 || type === 0xd0 ? 1 : 2;
    if (!running || i + len > bytes.length) break;
    if (len === 2) dispatch(running, bytes[i], bytes[i + 1]);
    i += len;
  }
}
