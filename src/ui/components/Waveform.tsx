import React, { useEffect, useMemo, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';
import type { Deck } from '../../audio/Deck';
import { useFrame } from '../../audio/engine';
import { getWaveform } from '../../library/library';
import type { Waveform as WaveData } from '../../library/types';
import { colors, hotCueColors } from '../theme';

export function useWaveform(trackId: string | undefined, analyzed?: boolean) {
  const [wave, setWave] = useState<WaveData | null>(null);
  useEffect(() => {
    let alive = true;
    setWave(null);
    if (trackId) getWaveform(trackId).then((w) => alive && setWave(w));
    return () => {
      alive = false;
    };
  }, [trackId, analyzed]);
  return wave;
}

const LOW_COLOR = '#2563EB';
const HIGH_COLOR = '#F8FAFC';

/**
 * Scrolling, beat-gridded waveform centred on the playhead (rekordbox / Serato style).
 * Only the visible window is turned into SVG paths each frame.
 */
export function ScrollingWaveform({
  deck,
  color,
  height = 56,
  seconds = 8,
}: {
  deck: Deck;
  color: string;
  height?: number;
  seconds?: number;
}) {
  const [width, setWidth] = useState(300);
  const wave = useWaveform(deck.track?.id, deck.track?.analyzed);
  const pos = useFrame(() => deck.position(), 40);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const paths = useMemo(() => {
    if (!wave) return null;
    const pxPerSec = width / seconds;
    const barPx = 2;
    const bars = Math.ceil(width / barPx);
    const secPerBar = barPx / pxPerSec;
    const startT = pos - seconds / 2;
    const mid = height / 2;
    let dPeak = '';
    let dLow = '';
    let dHigh = '';
    for (let b = 0; b < bars; b++) {
      const t = startT + b * secPerBar;
      if (t < 0) continue;
      const i = Math.floor(t * wave.rate);
      if (i >= wave.peak.length) break;
      // max over the samples covered by this bar
      const j = Math.min(wave.peak.length, Math.floor((t + secPerBar) * wave.rate) + 1);
      let pk = 0;
      let lo = 0;
      let hi = 0;
      for (let k = i; k < j; k++) {
        if (wave.peak[k] > pk) {
          pk = wave.peak[k];
          lo = wave.low[k];
          hi = wave.high[k];
        }
      }
      const h = (pk / 255) * mid * 0.95;
      const x = b * barPx;
      dPeak += `M${x} ${mid - h}V${mid + h}`;
      const hl = h * Math.min(1, (lo / 255) * 1.15);
      if (hl > 0.5) dLow += `M${x} ${mid - hl}V${mid + hl}`;
      const hh = h * Math.min(1, (hi / 255) * 1.6);
      if (hh > 0.5) dHigh += `M${x} ${mid - hh}V${mid + hh}`;
    }
    return { dPeak, dLow, dHigh };
  }, [wave, pos, width, height, seconds]);

  const overlays = useMemo(() => {
    const els: React.ReactNode[] = [];
    const pxPerSec = width / seconds;
    const startT = pos - seconds / 2;
    const toX = (t: number) => (t - startT) * pxPerSec;
    const bl = deck.beatLength;
    if (bl > 0 && deck.track) {
      const first = deck.firstBeat;
      let n = Math.ceil((startT - first) / bl);
      for (let t = first + n * bl; t < startT + seconds; t += bl, n++) {
        if (t < 0) continue;
        const bar = ((n % 4) + 4) % 4 === 0;
        els.push(
          <Line key={`b${n}`} x1={toX(t)} x2={toX(t)} y1={0} y2={height} stroke={bar ? '#ffffffaa' : '#ffffff33'} strokeWidth={bar ? 1.2 : 0.8} />,
        );
      }
    }
    const loop = deck.loop;
    if (loop) {
      els.push(
        <Rect
          key="loop"
          x={toX(loop.start)}
          y={0}
          width={Math.max(1, (loop.end - loop.start) * pxPerSec)}
          height={height}
          fill={loop.active ? `${colors.loop}40` : '#ffffff14'}
          stroke={loop.active ? colors.loop : '#ffffff40'}
          strokeWidth={1}
        />,
      );
    }
    deck.hotCues.forEach((hc, i) => {
      if (!hc) return;
      const x = toX(hc.time);
      if (x < -10 || x > width + 10) return;
      els.push(
        <G key={`h${i}`}>
          <Line x1={x} x2={x} y1={0} y2={height} stroke={hotCueColors[i]} strokeWidth={1.5} />
          <Rect x={x} y={0} width={9} height={9} fill={hotCueColors[i]} />
        </G>,
      );
    });
    const cx = toX(deck.cuePoint);
    if (deck.track && cx > -10 && cx < width + 10) {
      els.push(<Path key="cue" d={`M${cx - 5} ${height}L${cx + 5} ${height}L${cx} ${height - 7}Z`} fill={colors.cue} />);
    }
    return els;
  }, [deck, deck.loop, deck.hotCues, deck.cuePoint, deck.track, pos, width, height, seconds]);

  return (
    <View style={[styles.scroll, { height }]} onLayout={onLayout}>
      {deck.track ? (
        <Svg width={width} height={height}>
          {paths && (
            <>
              <Path d={paths.dPeak} stroke={color} strokeOpacity={0.75} strokeWidth={1.6} />
              <Path d={paths.dLow} stroke={LOW_COLOR} strokeWidth={1.6} />
              <Path d={paths.dHigh} stroke={HIGH_COLOR} strokeOpacity={0.85} strokeWidth={1.2} />
            </>
          )}
          {overlays}
          <Line x1={width / 2} x2={width / 2} y1={0} y2={height} stroke={colors.rec} strokeWidth={2} />
        </Svg>
      ) : null}
      {deck.track && !wave && (
        <Text style={styles.placeholder}>{deck.loading ? '…' : deck.track.analyzed ? '' : '…'}</Text>
      )}
    </View>
  );
}

/** Whole-track overview with progress, cue markers and needle search. */
export function OverviewWaveform({ deck, color, height = 26 }: { deck: Deck; color: string; height?: number }) {
  const [width, setWidth] = useState(200);
  const wave = useWaveform(deck.track?.id, deck.track?.analyzed);
  const pos = useFrame(() => deck.position(), 10);
  const duration = deck.duration || deck.track?.duration || 0;

  const d = useMemo(() => {
    if (!wave) return '';
    const bars = Math.floor(width / 2);
    const per = wave.peak.length / bars;
    const mid = height / 2;
    let s = '';
    for (let b = 0; b < bars; b++) {
      let pk = 0;
      for (let k = Math.floor(b * per); k < Math.floor((b + 1) * per); k++) if (wave.peak[k] > pk) pk = wave.peak[k];
      const h = (pk / 255) * mid;
      s += `M${b * 2} ${mid - h}V${mid + h}`;
    }
    return s;
  }, [wave, width, height]);

  const onPress = (e: GestureResponderEvent) => {
    if (!duration) return;
    deck.seek((e.nativeEvent.locationX / width) * duration);
  };
  const px = duration ? (pos / duration) * width : 0;

  return (
    <Pressable onPress={onPress} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[styles.overview, { height }]}>
      <Svg width={width} height={height}>
        <Path d={d} stroke={color} strokeOpacity={0.35} strokeWidth={1.4} />
        <Rect x={0} y={0} width={px} height={height} fill="#ffffff10" />
        {deck.hotCues.map((hc, i) =>
          hc && duration ? (
            <Rect key={i} x={(hc.time / duration) * width - 1} y={0} width={2} height={height} fill={hotCueColors[i]} />
          ) : null,
        )}
        {deck.loop && duration ? (
          <Rect
            x={(deck.loop.start / duration) * width}
            y={0}
            width={Math.max(2, ((deck.loop.end - deck.loop.start) / duration) * width)}
            height={height}
            fill={`${colors.loop}55`}
          />
        ) : null}
        <Rect x={px - 1} y={0} width={2} height={height} fill={colors.text} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: '#05050A', borderRadius: 6, overflow: 'hidden', justifyContent: 'center' },
  placeholder: { position: 'absolute', alignSelf: 'center', color: colors.dim },
  overview: { backgroundColor: '#05050A', borderRadius: 4, overflow: 'hidden' },
});
