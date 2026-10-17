import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { analyzeChannels } from '../audio/analysis';
import type { HotCue } from '../audio/Deck';
import { getEngine } from '../audio/engine';
import { deleteAudio, loadJSON, PickedAudio, readAudio, saveAudio, saveJSON } from './storage';
import type { Crate, Track, Waveform } from './types';

type Cues = { cuePoint: number; hotCues: (HotCue | null)[] };

interface ImportProgress {
  total: number;
  done: number;
  current: string;
}

interface LibraryState {
  tracks: Track[];
  crates: Crate[];
  cues: Record<string, Cues>;
  progress: ImportProgress | null;
  pickAndImport: (opts?: { spotifyId?: string }) => Promise<Track[]>;
  importPicked: (files: PickedAudio[], opts?: { spotifyId?: string }) => Promise<Track[]>;
  removeTrack: (id: string) => Promise<void>;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  saveCrate: (crate: Crate) => void;
  removeCrate: (id: string) => void;
  setCues: (trackId: string, cues: Cues) => void;
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function parseFileName(name: string): { artist: string; title: string } {
  const base = name
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_/g, ' ')
    .replace(/^\d{1,3}[\s.\-_]+/, '')
    .trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: '', title: base };
}

const waveformCache = new Map<string, Waveform>();

export async function getWaveform(id: string): Promise<Waveform | null> {
  const cached = waveformCache.get(id);
  if (cached) return cached;
  const w = await loadJSON<Waveform>(id);
  if (w) waveformCache.set(id, w);
  return w;
}

async function analyzeTrack(id: string) {
  const ctx = getEngine().ctx;
  const buffer = await ctx.decodeAudioData(await readAudio(id));
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c));
  const { analysis, waveform } = await analyzeChannels(channels, buffer.sampleRate);
  waveformCache.set(id, waveform);
  await saveJSON(id, waveform);
  return analysis;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      tracks: [],
      crates: [],
      cues: {},
      progress: null,

      pickAndImport: async (opts) => {
        const res = await DocumentPicker.getDocumentAsync({
          type: ['audio/*'],
          multiple: !opts?.spotifyId,
          copyToCacheDirectory: true,
        });
        if (res.canceled || !res.assets?.length) return [];
        return get().importPicked(
          res.assets.map((a) => ({ uri: a.uri, name: a.name, file: (a as { file?: Blob }).file })),
          opts,
        );
      },

      importPicked: async (files, opts) => {
        const added: Track[] = [];
        set({ progress: { total: files.length, done: 0, current: '' } });
        try {
          for (const f of files) {
            const id = newId();
            const { artist, title } = parseFileName(f.name);
            set((s) => ({ progress: { ...s.progress!, current: title } }));
            await saveAudio(id, f);
            let track: Track = {
              id,
              title,
              artist,
              fileName: f.name,
              addedAt: Date.now(),
              spotifyId: opts?.spotifyId,
              analyzed: false,
              bpm: 0,
              firstBeat: 0,
              key: '',
              camelot: '',
              duration: 0,
            };
            set((s) => ({ tracks: [track, ...s.tracks] }));
            try {
              const analysis = await analyzeTrack(id);
              track = { ...track, ...analysis, analyzed: true };
            } catch (e) {
              console.warn('analysis failed', f.name, e);
            }
            set((s) => ({
              tracks: s.tracks.map((t) => (t.id === id ? track : t)),
              progress: { ...s.progress!, done: s.progress!.done + 1 },
            }));
            added.push(track);
          }
        } finally {
          set({ progress: null });
        }
        return added;
      },

      removeTrack: async (id) => {
        await deleteAudio(id);
        waveformCache.delete(id);
        set((s) => {
          const cues = { ...s.cues };
          delete cues[id];
          return {
            tracks: s.tracks.filter((t) => t.id !== id),
            cues,
            crates: s.crates.map((c) => ({
              ...c,
              entries: c.entries.map((e) => (e.trackId === id ? { ...e, trackId: undefined } : e)),
            })),
          };
        });
      },

      updateTrack: (id, patch) => {
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
        const t = get().tracks.find((x) => x.id === id);
        if (t) getEngine().refreshTrack(t);
      },

      saveCrate: (crate) =>
        set((s) => ({ crates: [crate, ...s.crates.filter((c) => c.id !== crate.id)] })),

      removeCrate: (id) => set((s) => ({ crates: s.crates.filter((c) => c.id !== id) })),

      setCues: (trackId, cues) => set((s) => ({ cues: { ...s.cues, [trackId]: cues } })),
    }),
    {
      name: 'mrdj-library',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ tracks: s.tracks, crates: s.crates, cues: s.cues }),
    },
  ),
);

/** Wire hot-cue persistence into the audio engine once at startup. */
export function connectCuePersistence() {
  getEngine().setCuePersistence({
    get: (id) => useLibrary.getState().cues[id],
    set: (id, cues) => useLibrary.getState().setCues(id, cues),
  });
}
