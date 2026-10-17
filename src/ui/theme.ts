export const colors = {
  bg: '#07070D',
  panel: '#11111B',
  panel2: '#191926',
  panel3: '#232335',
  border: '#2C2C42',
  text: '#EEEEF8',
  dim: '#8C8CA6',
  faint: '#55556E',
  accent: '#8B5CF6',
  play: '#22C55E',
  cue: '#F59E0B',
  rec: '#EF4444',
  sync: '#38BDF8',
  loop: '#A3E635',
  fx: '#E879F9',
};

export const deckColors = ['#22D3EE', '#F43F9E', '#A3E635', '#FB923C'];
export const deckLetters = ['A', 'B', 'C', 'D'];

export const hotCueColors = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
];

export const mono = { fontVariant: ['tabular-nums' as const] };

/** `#rrggbb` + alpha 0..1 → rgba() */
export function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Brushed-metal / rubber gradients shared by the hardware-style controls. */
export const metal = {
  panel: ['#22222f', '#17171f', '#101016'] as const,
  panelEdge: '#34344a',
  rubber: ['#2e2e3c', '#1b1b25', '#14141b'] as const,
  rubberPressed: ['#15151c', '#1c1c26'] as const,
  cap: ['#b8b8c8', '#6e6e82', '#3a3a4a', '#585870'] as const,
};
