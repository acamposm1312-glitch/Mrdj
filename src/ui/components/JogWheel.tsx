import React, { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, G, Line, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import type { Deck } from '../../audio/Deck';
import { useFrame } from '../../audio/engine';
import { colors, mono } from '../theme';

/** 33⅓ rpm: one platter revolution = 1.8 s of audio. */
const SEC_PER_REV = 1.8;

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t * 10) % 10);
  return `${m}:${s.toString().padStart(2, '0')}.${d}`;
}

/**
 * Touch platter. Top surface scratches (vinyl mode) or bends; the outer ring
 * always bends the tempo, like a CDJ / DDJ jog wheel.
 */
export function JogWheel({ deck, size, color }: { deck: Deck; size: number; color: string }) {
  const state = useRef({ lastAngle: 0, lastT: 0, mode: 'none' as 'none' | 'scratch' | 'bend', bendTimer: 0 as any });
  const r = size / 2;

  const angleOf = (x: number, y: number) => Math.atan2(y - r, x - r);

  const gesture = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    onBegin: (e) => {
      const s = state.current;
      const dist = Math.hypot(e.x - r, e.y - r);
      s.lastAngle = angleOf(e.x, e.y);
      s.lastT = Date.now();
      const onPlatter = dist < r * 0.78;
      if (onPlatter && deck.vinyl && deck.track) {
        s.mode = 'scratch';
        deck.scratchStart();
      } else s.mode = 'bend';
    },
    onUpdate: (e) => {
      const s = state.current;
      const a = angleOf(e.x, e.y);
      let da = a - s.lastAngle;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      s.lastAngle = a;
      const now = Date.now();
      const dt = Math.max(1, now - s.lastT) / 1000;
      s.lastT = now;
      const deltaSec = (da / (2 * Math.PI)) * SEC_PER_REV;
      if (s.mode === 'scratch') {
        deck.scratchMove(deltaSec, Math.abs(deltaSec) / dt);
      } else if (deck.playing) {
        deck.setBend(Math.max(-0.3, Math.min(0.3, (deltaSec / dt) * 0.25)));
        clearTimeout(s.bendTimer);
        s.bendTimer = setTimeout(() => deck.setBend(0), 90);
      } else if (deck.track) {
        deck.seek(deck.position() + deltaSec * 0.5);
      }
    },
    onFinalize: () => {
      const s = state.current;
      if (s.mode === 'scratch') deck.scratchEnd();
      else deck.setBend(0);
      s.mode = 'none';
    },
  });

  const frame = useFrame(() => ({ pos: deck.position(), phase: deck.beatPhase() }), 40);
  const turns = frame.pos / SEC_PER_REV;
  const angleDeg = (turns % 1) * 360;
  const remaining = (deck.duration || 0) - frame.pos;
  const playing = deck.playing;
  const chromeW = Math.max(5, r * 0.07);
  const ledR = r - chromeW - 4;
  const platterR = ledR - 5;
  const labelR = platterR * 0.42;
  const segs = 40;
  const head = Math.floor((turns % 1) * segs);
  const ledEls = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * 2 * Math.PI;
    const dist = (head - i + segs) % segs;
    const on = deck.track ? Math.max(0, 1 - dist / 7) : 0;
    ledEls.push(
      <Line
        key={i}
        x1={r + Math.sin(a) * (ledR + 2.5)}
        y1={r - Math.cos(a) * (ledR + 2.5)}
        x2={r + Math.sin(a) * (ledR - 2.5)}
        y2={r - Math.cos(a) * (ledR - 2.5)}
        stroke={on > 0 ? color : '#1e1e2a'}
        strokeOpacity={on > 0 ? 0.25 + on * 0.75 : 1}
        strokeWidth={3}
        strokeLinecap="round"
      />,
    );
  }
  const grooves = [];
  for (let k = 0; k < 14; k++) {
    const gr = labelR + 3 + ((platterR - labelR - 5) * k) / 13;
    grooves.push(<Circle key={k} cx={r} cy={r} r={gr} fill="none" stroke={k % 4 === 0 ? '#ffffff12' : '#ffffff07'} strokeWidth={k % 4 === 0 ? 1.2 : 0.7} />);
  }
  const beatPulse = playing ? 1 - frame.phase : 0;

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id={`chrome${deck.index}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#f2f3f7" />
              <Stop offset="0.22" stopColor="#7c7f8f" />
              <Stop offset="0.45" stopColor="#dfe1e8" />
              <Stop offset="0.62" stopColor="#4a4c5a" />
              <Stop offset="0.82" stopColor="#b4b7c4" />
              <Stop offset="1" stopColor="#3a3c48" />
            </LinearGradient>
            <RadialGradient id={`vinyl${deck.index}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#1c1c24" />
              <Stop offset="0.85" stopColor="#0b0b0f" />
              <Stop offset="1" stopColor="#050507" />
            </RadialGradient>
            <RadialGradient id={`label${deck.index}`} cx="40%" cy="35%" r="70%">
              <Stop offset="0" stopColor={color} stopOpacity={1} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.85} />
            </RadialGradient>
            <LinearGradient id={`sheen${deck.index}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.16} />
              <Stop offset="0.4" stopColor="#ffffff" stopOpacity={0} />
              <Stop offset="0.6" stopColor="#ffffff" stopOpacity={0} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0.07} />
            </LinearGradient>
          </Defs>
          {/* drop shadow + chrome bezel */}
          <Circle cx={r} cy={r + 3} r={r - 2} fill="#000" opacity={0.6} />
          <Circle cx={r} cy={r} r={r - 2} fill={`url(#chrome${deck.index})`} />
          <Circle cx={r} cy={r} r={r - 2 - chromeW} fill="#08080c" />
          {ledEls}
          {/* rotating record */}
          <G transform={`rotate(${angleDeg} ${r} ${r})`}>
            <Circle cx={r} cy={r} r={platterR} fill={`url(#vinyl${deck.index})`} stroke="#2a2a36" strokeWidth={1} />
            {grooves}
            <Circle cx={r} cy={r} r={labelR} fill={`url(#label${deck.index})`} />
            <Circle cx={r} cy={r - labelR * 0.72} r={Math.max(2, labelR * 0.1)} fill="#ffffff" opacity={0.9} />
            <Line x1={r} y1={r - platterR + 2} x2={r} y2={r - labelR - 2} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.5} />
          </G>
          {/* static gloss */}
          <Circle cx={r} cy={r} r={platterR} fill={`url(#sheen${deck.index})`} />
          <Circle cx={r} cy={r} r={labelR * 0.62} fill="#06060a" opacity={0.82} stroke={color} strokeOpacity={0.3 + beatPulse * 0.7} strokeWidth={1.5} />
          <Circle cx={r} cy={r} r={Math.max(2.5, labelR * 0.07)} fill="#c9cbd6" />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={[styles.time, mono, { fontSize: Math.max(8, size * 0.058) }]}>-{fmt(remaining)}</Text>
          <Text style={[styles.mode, { color: deck.vinyl ? color : colors.faint }]}>{deck.vinyl ? 'VINYL' : 'CDJ'}</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

export function VuMeter({ level, height = 80, width = 7 }: { level: () => number; height?: number; width?: number }) {
  const v = useFrame(level, 30);
  const segs = 14;
  const lit = Math.round(Math.sqrt(v) * segs);
  return (
    <View style={[styles.vu, { height, width }]}>
      {Array.from({ length: segs }).map((_, i) => {
        const idx = segs - 1 - i;
        const on = idx < lit;
        const c = idx >= segs - 2 ? colors.rec : idx >= segs - 5 ? colors.cue : colors.play;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              borderRadius: 1,
              backgroundColor: on ? c : '#15151e',
              shadowColor: c,
              shadowOpacity: on ? 1 : 0,
              shadowRadius: 3,
            }}
          />
        );
      })}
    </View>
  );
}

export { fmt as formatTime };

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  time: { color: colors.text, fontWeight: '700' },
  mode: { fontSize: 7, fontWeight: '800', marginTop: 1, letterSpacing: 1 },
  vu: { justifyContent: 'flex-end', gap: 1.2, backgroundColor: '#050508', padding: 1, borderRadius: 2 },
});
