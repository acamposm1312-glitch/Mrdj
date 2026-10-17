export interface Waveform {
  /** buckets per second of audio */
  rate: number;
  /** peak amplitude 0..255 per bucket */
  peak: number[];
  /** share of low / high energy per bucket 0..255 (mid = remainder) */
  low: number[];
  high: number[];
}

export interface Analysis {
  bpm: number;
  firstBeat: number;
  key: string;
  camelot: string;
  duration: number;
}

export interface Track extends Analysis {
  id: string;
  title: string;
  artist: string;
  fileName: string;
  addedAt: number;
  spotifyId?: string;
  analyzed: boolean;
}

export interface Crate {
  id: string;
  name: string;
  source: 'spotify' | 'user';
  entries: CrateEntry[];
}

export interface CrateEntry {
  title: string;
  artist: string;
  spotifyId?: string;
  trackId?: string;
}
