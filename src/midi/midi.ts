import { create } from 'zustand';

/**
 * Native builds: MIDI over USB/Bluetooth needs a native module (CoreMIDI /
 * android.media.midi) that is not part of this first version.
 */
export interface MidiState {
  supported: boolean;
  devices: string[];
  learning: string | null;
  mappings: Record<string, string>;
  init: () => Promise<void>;
  learn: (targetId: string | null) => void;
  clear: () => void;
}

export const useMidi = create<MidiState>()(() => ({
  supported: false,
  devices: [],
  learning: null,
  mappings: {},
  init: async () => {},
  learn: () => {},
  clear: () => {},
}));
