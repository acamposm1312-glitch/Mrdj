import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { getEngine } from '../audio/engine';

/**
 * PC keyboard control (web build). Uses physical key codes so it works the
 * same on Spanish / English layouts.
 *   Left deck:  Z cue · X play · C sync · 1-4 hot cues · A loop 4 · S ÷2 · D ×2 · Q/W nudge
 *   Right deck: M cue · , play · . sync · 7-0 hot cues · J loop 4 · K ÷2 · L ×2 · O/P nudge
 *   ← → crossfader · ↓ centre
 */
export const SHORTCUTS: [string, string][] = [
  ['Z / M', 'CUE'],
  ['X / ,', 'PLAY / PAUSA'],
  ['C / .', 'SYNC'],
  ['1-4 / 7-0', 'HOT CUES'],
  ['A / J', 'LOOP 4'],
  ['S D / K L', 'LOOP ÷2 ×2'],
  ['Q W / O P', 'NUDGE − +'],
  ['← → ↓', 'CROSSFADER'],
];

type Action = { deck: 0 | 1; down: (d: number) => void; up?: (d: number) => void };

export function useKeyboardShortcuts(left: number, right: number) {
  const decks = useRef([left, right]);
  decks.current = [left, right];

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const e = getEngine();
    const nudge = (amt: number) => (i: number) => e.decks[i].setBend(amt);
    const unbend = (i: number) => e.decks[i].setBend(0);
    const map: Record<string, Action> = {};
    const side = (deck: 0 | 1, keys: string[]) => {
      const [cue, play, sync, loop, half, dbl, nDown, nUp, ...hot] = keys;
      map[cue] = { deck, down: (i) => (e.resume(), e.decks[i].cueDown()), up: (i) => e.decks[i].cueUp() };
      map[play] = { deck, down: (i) => e.togglePlay(i) };
      map[sync] = { deck, down: (i) => e.toggleSync(i) };
      map[loop] = { deck, down: (i) => e.decks[i].autoLoop(4) };
      map[half] = { deck, down: (i) => e.decks[i].resizeLoop(0.5) };
      map[dbl] = { deck, down: (i) => e.decks[i].resizeLoop(2) };
      map[nDown] = { deck, down: nudge(-0.04), up: unbend };
      map[nUp] = { deck, down: nudge(0.04), up: unbend };
      hot.forEach((k, h) => (map[k] = { deck, down: (i) => e.decks[i].hotCue(h) }));
    };
    side(0, ['KeyZ', 'KeyX', 'KeyC', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyW', 'Digit1', 'Digit2', 'Digit3', 'Digit4']);
    side(1, ['KeyM', 'Comma', 'Period', 'KeyJ', 'KeyK', 'KeyL', 'KeyO', 'KeyP', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);

    const typing = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const onDown = (ev: KeyboardEvent) => {
      if (typing(ev) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') {
        e.setCrossfader(e.crossfader + (ev.code === 'ArrowLeft' ? -0.1 : 0.1));
        ev.preventDefault();
        return;
      }
      if (ev.code === 'ArrowDown') {
        e.setCrossfader(0);
        ev.preventDefault();
        return;
      }
      const a = map[ev.code];
      if (!a || ev.repeat) return;
      ev.preventDefault();
      a.down(decks.current[a.deck]);
    };
    const onUp = (ev: KeyboardEvent) => {
      const a = map[ev.code];
      if (a?.up && !typing(ev)) a.up(decks.current[a.deck]);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);
}
