import { handleMidiBytes, useMidiStore } from './core';

/** Web: any class-compliant controller through Web MIDI (Chrome / Edge). */
export const useMidi = useMidiStore;

let started = false;

export async function initMidi() {
  if (started || typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) return;
  started = true;
  useMidiStore.setState({ supported: true });
  const access = await navigator.requestMIDIAccess();
  const attach = () => {
    const names: string[] = [];
    access.inputs.forEach((input) => {
      names.push(input.name ?? 'MIDI');
      input.onmidimessage = (msg) => msg.data && handleMidiBytes(msg.data);
    });
    useMidiStore.setState({ devices: names });
  };
  access.onstatechange = attach;
  attach();
}

export function pairBluetoothMidi() {
  return Promise.resolve();
}
