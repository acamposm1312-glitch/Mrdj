import { requireOptionalNativeModule } from 'expo';

export interface MidiMessageEvent {
  /** raw MIDI bytes (may hold several messages) */
  data: number[];
  device: string;
}

interface Subscription {
  remove(): void;
}

export interface MrdjMidiNative {
  isSupported(): boolean;
  start(): string[];
  getDevices(): string[];
  /** iOS only: shows the system Bluetooth-MIDI pairing sheet */
  showBluetoothPairing(): Promise<void>;
  addListener(event: 'onMessage', cb: (e: MidiMessageEvent) => void): Subscription;
  addListener(event: 'onDevicesChanged', cb: (e: { devices: string[] }) => void): Subscription;
}

/** null in Expo Go / web, where the native module is not compiled in. */
export default requireOptionalNativeModule<MrdjMidiNative>('MrdjMidi');
