/** Web persistence (IndexedDB). Mirrors the API of storage.ts. */

export interface PickedAudio {
  uri: string;
  name: string;
  file?: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('mrdj', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('audio');
        req.result.createObjectStore('json');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudio(id: string, picked: PickedAudio): Promise<void> {
  const blob = picked.file ?? (await (await fetch(picked.uri)).blob());
  await tx('audio', 'readwrite', (s) => s.put(blob, id));
}

export async function readAudio(id: string): Promise<ArrayBuffer> {
  const blob = await tx<Blob | undefined>('audio', 'readonly', (s) => s.get(id));
  if (!blob) throw new Error('audio not found');
  return blob.arrayBuffer();
}

export async function deleteAudio(id: string): Promise<void> {
  await tx('audio', 'readwrite', (s) => s.delete(id));
  await tx('json', 'readwrite', (s) => s.delete(id));
}

export async function saveJSON(key: string, data: unknown): Promise<void> {
  await tx('json', 'readwrite', (s) => s.put(data, key));
}

export async function loadJSON<T>(key: string): Promise<T | null> {
  return ((await tx<T | undefined>('json', 'readonly', (s) => s.get(key))) ?? null) as T | null;
}

export async function saveAndShareRecording(name: string, data: ArrayBuffer | Blob, mime: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}
