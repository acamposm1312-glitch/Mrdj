import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Google Drive as a cloud music library: list a folder, download a file when
 * it is loaded on a deck. Read-only access; tokens stay on the device.
 */

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};
export const CLIENT_ID_RE = /^[\w-]+\.apps\.googleusercontent\.com$/;

interface DriveAuth {
  clientId: string;
  accessToken: string;
  expiresAt: number;
  setClientId: (id: string) => void;
  setToken: (token: string, expiresIn: number) => void;
  clear: () => void;
}

export const useDriveAuth = create<DriveAuth>()(
  persist(
    (set) => ({
      clientId: '',
      accessToken: '',
      expiresAt: 0,
      setClientId: (clientId) => set({ clientId: clientId.trim() }),
      setToken: (accessToken, expiresIn) => set({ accessToken, expiresAt: Date.now() + (expiresIn - 60) * 1000 }),
      clear: () => set({ accessToken: '', expiresAt: 0 }),
    }),
    { name: 'mrdj-drive', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export function driveConnected() {
  const s = useDriveAuth.getState();
  return !!s.accessToken && Date.now() < s.expiresAt;
}

export class DriveAuthError extends Error {
  constructor() {
    super('drive-auth');
  }
}

async function driveFetch(url: string): Promise<Response> {
  const s = useDriveAuth.getState();
  if (!driveConnected()) throw new DriveAuthError();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${s.accessToken}` } });
  if (res.status === 401) {
    s.clear();
    throw new DriveAuthError();
  }
  if (!res.ok) throw new Error(`Google Drive ${res.status}`);
  return res;
}

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  isFolder: boolean;
}

const FOLDER = 'application/vnd.google-apps.folder';
const AUDIO_EXT = /\.(mp3|wav|aiff?|flac|m4a|aac|ogg|opus)$/i;
const API = 'https://www.googleapis.com/drive/v3/files';

export async function listFolder(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const url = `${API}?q=${q}&pageSize=1000&orderBy=folder,name&fields=nextPageToken,files(id,name,mimeType,size)${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const json = await (await driveFetch(url)).json();
    for (const f of json.files ?? []) {
      const isFolder = f.mimeType === FOLDER;
      if (isFolder || String(f.mimeType).startsWith('audio/') || AUDIO_EXT.test(f.name)) {
        out.push({ id: f.id, name: f.name, size: Number(f.size ?? 0), isFolder });
      }
    }
    pageToken = json.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

/** The "MrDj" folder if the user created one, otherwise the Drive root. */
export async function findStartFolder(): Promise<{ id: string; name: string }> {
  const q = encodeURIComponent(`name = 'MrDj' and mimeType = '${FOLDER}' and trashed = false`);
  const json = await (await driveFetch(`${API}?q=${q}&fields=files(id,name)&pageSize=1`)).json();
  const f = json.files?.[0];
  return f ? { id: f.id, name: f.name } : { id: 'root', name: 'Mi unidad' };
}

export async function downloadFile(id: string): Promise<ArrayBuffer> {
  return (await driveFetch(`${API}/${id}?alt=media`)).arrayBuffer();
}
