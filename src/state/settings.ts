import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { en, es, Strings } from '../i18n/strings';

export type Lang = 'es' | 'en';
export type Layout = 'classic' | 'pro';

interface SettingsState {
  lang: Lang;
  fourDecks: boolean;
  spotifyClientId: string;
  view3d: boolean;
  layout: Layout;
  setLayout: (v: Layout) => void;
  setView3d: (v: boolean) => void;
  setLang: (lang: Lang) => void;
  setFourDecks: (v: boolean) => void;
  setSpotifyClientId: (id: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: 'es',
      fourDecks: false,
      spotifyClientId: '',
      view3d: false,
      layout: 'classic',
      setLayout: (layout) => set({ layout }),
      setView3d: (view3d) => set({ view3d }),
      setLang: (lang) => set({ lang }),
      setFourDecks: (fourDecks) => set({ fourDecks }),
      setSpotifyClientId: (spotifyClientId) => set({ spotifyClientId: spotifyClientId.trim() }),
    }),
    { name: 'mrdj-settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export function useT(): Strings {
  const lang = useSettings((s) => s.lang);
  return lang === 'en' ? en : es;
}
