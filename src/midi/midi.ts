import { Platform } from 'react-native';
import MrdjMidi from '../../modules/mrdj-midi';
import { handleMidiBytes, useMidiStore } from './core';

/** iOS / Android: bytes come from the native mrdj-midi module (CoreMIDI / android.media.midi). */
export const useMidi = useMidiStore;

let started = false;

export async function initMidi() {
  if (started || !MrdjMidi) return;
  if (!MrdjMidi.isSupported()) return;
  started = true;
  useMidiStore.setState({ supported: true, bluetoothPairing: Platform.OS === 'ios' });
  MrdjMidi.addListener('onMessage', (e) => handleMidiBytes(e.data));
  MrdjMidi.addListener('onDevicesChanged', (e) => useMidiStore.setState({ devices: e.devices }));
  useMidiStore.setState({ devices: MrdjMidi.start() });
}

export function pairBluetoothMidi() {
  return MrdjMidi?.showBluetoothPairing();
}
