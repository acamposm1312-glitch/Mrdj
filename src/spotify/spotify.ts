import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Track } from '../library/types';

/**
 * Spotify is used ONLY to read playlist metadata (title / artist) so the DJ can
 * find the matching files in their own library. No Spotify audio is streamed,
 * downloaded or mixed — that would violate the Spotify Developer Terms.
 * Auth is OAuth PKCE straight from the device: no backend, no secret.
 */

export const SPOTIFY_SCOPES = ['playlist-read-private', 'playlist-read-collaborative', 'user-library-read'];
export const SPOTIFY_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

interface TokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  setTokens: (t: { accessToken: string; refreshToken?: string; expiresIn: number }) => void;
  clear: () => void;
}

export const useSpotifyAuth = create<TokenState>()(
  persist(
    (set, get) => ({
      accessToken: '',
      refreshToken: '',
      expiresAt: 0,
      setTokens: ({ accessToken, refreshToken, expiresIn }) =>
        set({
          accessToken,
          refreshToken: refreshToken || get().refreshToken,
          expiresAt: Date.now() + (expiresIn - 60) * 1000,
        }),
      clear: () => set({ accessToken: '', refreshToken: '', expiresAt: 0 }),
    }),
    { name: 'mrdj-spotify', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

async function token(clientId: string): Promise<string> {
  const s = useSpotifyAuth.getState();
  if (s.accessToken && Date.now() < s.expiresAt) return s.accessToken;
  if (!s.refreshToken) throw new Error('not connected');
  const res = await fetch(SPOTIFY_DISCOVERY.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.refreshToken)}&client_id=${encodeURIComponent(clientId)}`,
  });
  if (!res.ok) {
    s.clear();
    throw new Error(`refresh failed (${res.status})`);
  }
  const j = await res.json();
  s.setTokens({ accessToken: j.access_token, refreshToken: j.refresh_token, expiresIn: j.expires_in });
  return j.access_token;
}

async function api<T>(clientId: string, url: string): Promise<T> {
  const full = url.startsWith('http') ? url : `https://api.spotify.com/v1${url}`;
  const res = await fetch(full, { headers: { Authorization: `Bearer ${await token(clientId)}` } });
  if (!res.ok) {
    const err = new Error(`Spotify ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  image?: string;
  total: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string;
  durationMs: number;
}

interface Page<T> {
  items: T[];
  next: string | null;
}

export async function getPlaylists(clientId: string): Promise<SpotifyPlaylist[]> {
  const out: SpotifyPlaylist[] = [];
  let url: string | null = '/me/playlists?limit=50';
  while (url && out.length < 500) {
    const page: Page<any> = await api(clientId, url);
    for (const p of page.items) {
      if (!p) continue;
      out.push({
        id: p.id,
        name: p.name,
        image: p.images?.[0]?.url,
        total: p.items?.total ?? p.tracks?.total ?? 0,
      });
    }
    url = page.next;
  }
  return out;
}

function toTrack(t: any): SpotifyTrack | null {
  if (!t || t.type === 'episode' || !t.id) return null;
  return {
    id: t.id,
    name: t.name,
    artists: (t.artists ?? []).map((a: any) => a.name).join(', '),
    durationMs: t.duration_ms ?? 0,
  };
}

async function collect(clientId: string, first: string, limit = 1000): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  let url: string | null = first;
  while (url && out.length < limit) {
    const page: Page<any> = await api(clientId, url);
    for (const it of page.items) {
      const t = toTrack(it?.item ?? it?.track);
      if (t) out.push(t);
    }
    url = page.next;
  }
  return out;
}

export async function getPlaylistTracks(clientId: string, playlistId: string): Promise<SpotifyTrack[]> {
  try {
    return await collect(clientId, `/playlists/${playlistId}/items?limit=100`);
  } catch (e) {
    // older API surface
    if ((e as { status?: number }).status === 404) {
      return collect(clientId, `/playlists/${playlistId}/tracks?limit=100`);
    }
    throw e;
  }
}

export function getLikedTracks(clientId: string): Promise<SpotifyTrack[]> {
  return collect(clientId, '/me/tracks?limit=50');
}

// ───────────────────────── matching ─────────────────────────

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\((feat|ft|with|prod)[^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft)\.?\s.*$/g, ' ')
    .replace(/-\s*(remaster(ed)?|radio edit|original mix).*$/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string) {
  return new Set(normalize(s).split(' ').filter((w) => w.length > 1));
}

function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  a.forEach((w) => b.has(w) && n++);
  return n / Math.min(a.size, b.size);
}

/** Finds the library file that best matches a Spotify track. */
export function matchTrack(st: SpotifyTrack, library: Track[]): Track | undefined {
  const linked = library.find((t) => t.spotifyId === st.id);
  if (linked) return linked;
  const title = tokens(st.name);
  const artist = tokens(st.artists);
  let best: Track | undefined;
  let bestScore = 0;
  for (const t of library) {
    const tt = tokens(`${t.title}`);
    const all = tokens(`${t.artist} ${t.title} ${t.fileName}`);
    const sTitle = Math.max(overlap(title, tt), overlap(title, all));
    if (sTitle < 0.75) continue;
    const sArtist = artist.size ? overlap(artist, all) : 1;
    const score = sTitle * 0.7 + sArtist * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 0.75 ? best : undefined;
}
