import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Native (iOS / Android) persistence: audio files are copied into the app's
 * document directory so they keep working after the original is moved.
 * The web build swaps this file for storage.web.ts (IndexedDB).
 */

export interface PickedAudio {
  uri: string;
  name: string;
  file?: Blob;
}

function root() {
  const dir = new Directory(Paths.document, 'mrdj');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function sub(name: string) {
  const dir = new Directory(root(), name);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function audioFile(id: string) {
  return new File(sub('tracks'), id);
}

export async function saveAudio(id: string, picked: PickedAudio): Promise<void> {
  const dest = audioFile(id);
  if (dest.exists) dest.delete();
  await new File(picked.uri).copy(dest);
}

export async function readAudio(id: string): Promise<ArrayBuffer> {
  const bytes = await audioFile(id).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function deleteAudio(id: string): Promise<void> {
  const f = audioFile(id);
  if (f.exists) f.delete();
  const w = new File(sub('waveforms'), `${id}.json`);
  if (w.exists) w.delete();
}

export async function saveJSON(key: string, data: unknown): Promise<void> {
  const f = new File(sub('waveforms'), `${key}.json`);
  await f.write(JSON.stringify(data));
}

export async function loadJSON<T>(key: string): Promise<T | null> {
  const f = new File(sub('waveforms'), `${key}.json`);
  if (!f.exists) return null;
  try {
    return JSON.parse(await f.text()) as T;
  } catch {
    return null;
  }
}

/** Writes a finished recording and opens the system share sheet. */
export async function saveAndShareRecording(name: string, data: ArrayBuffer | Blob, mime: string) {
  const f = new File(sub('recordings'), name);
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(await data.arrayBuffer());
  await f.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: 'MrDj' });
  }
  return f.uri;
}
