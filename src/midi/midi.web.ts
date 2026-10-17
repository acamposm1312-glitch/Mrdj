import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { buildTargets, MidiTarget } from './targets';

/** Web MIDI with MIDI-learn: any class-compliant controller works in Chrome/Edge. */
export interface MidiState {
  supported: boolean;
  devices: string[];
  learning: string | null;
  mappings: Record<string, string>;
  init: () => Promise<void>;
  learn: (targetId: string | null) => void;
  clear: () => void;
}

let targets: Map<string, MidiTarget> | null = null;
let started = false;

export const useMidi = create<MidiState>()(
  persist(
    (set, get) => ({
      supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
      devices: [],
      learning: null,
      mappings: {},
      init: async () => {
        if (started || !get().supported) return;
        started = true;
        const access = await navigator.requestMIDIAccess();
        const attach = () => {
          const names: string[] = [];
          access.inputs.forEach((input) => {
            names.push(input.name ?? 'MIDI');
            input.onmidimessage = (msg) => onMessage(msg.data);
          });
          set({ devices: names });
        };
        access.onstatechange = attach;
        attach();
      },
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

function onMessage(data: Uint8Array | null) {
  if (!data || data.length < 3) return;
  const [status, d1, d2] = data;
  const type = status & 0xf0;
  const ch = status & 0x0f;
  const isNote = type === 0x90 || type === 0x80;
  if (!isNote && type !== 0xb0) return;
  const key = `${isNote ? 'n' : 'c'}${ch}:${d1}`;
  const state = useMidi.getState();
  if (!targets) targets = new Map(buildTargets().map((t) => [t.id, t]));
  if (state.learning) {
    if (isNote && (type === 0x80 || d2 === 0)) return;
    useMidi.setState({ mappings: { ...state.mappings, [key]: state.learning }, learning: null });
    return;
  }
  const target = targets.get(state.mappings[key]);
  if (!target) return;
  if (target.kind === 'button') target.handle(type === 0x90 && d2 > 0 ? 1 : isNote ? 0 : d2 > 63 ? 1 : 0);
  else if (target.kind === 'jog') target.handle(d2 < 64 ? d2 : d2 - 128);
  else target.handle(d2 / 127);
}
