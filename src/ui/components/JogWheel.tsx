import React, { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
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
  const angle = ((frame.pos / SEC_PER_REV) % 1) * 2 * Math.PI;
  const mx = r + Math.sin(angle) * r * 0.62;
  const my = r - Math.cos(angle) * r * 0.62;
  const remaining = (deck.duration || 0) - frame.pos;
  const playing = deck.playing;
  const ring = r - 3;

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="plate" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#2b2b3e" />
              <Stop offset="0.75" stopColor="#151520" />
              <Stop offset="1" stopColor="#0c0c14" />
            </RadialGradient>
          </Defs>
          <Circle cx={r} cy={r} r={ring} fill="#0b0b12" stroke={playing ? color : colors.border} strokeWidth={3} />
          {Array.from({ length: 48 }).map((_, i) => {
            const a = (i / 48) * 2 * Math.PI;
            return (
              <Line
                key={i}
                x1={r + Math.sin(a) * (ring - 2)}
                y1={r - Math.cos(a) * (ring - 2)}
                x2={r + Math.sin(a) * (ring - 7)}
                y2={r - Math.cos(a) * (ring - 7)}
                stroke="#2c2c40"
                strokeWidth={1}
              />
            );
          })}
          <Circle cx={r} cy={r} r={r * 0.78} fill="url(#plate)" stroke="#3a3a55" strokeWidth={1} />
          {[0.7, 0.6, 0.5].map((k) => (
            <Circle key={k} cx={r} cy={r} r={r * k} fill="none" stroke="#ffffff08" strokeWidth={1} />
          ))}
          <Line x1={r} y1={r} x2={mx} y2={my} stroke={color} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={r} cy={r} r={r * 0.3} fill="#0a0a10" stroke={color} strokeOpacity={0.35 + (playing ? (1 - frame.phase) * 0.65 : 0)} strokeWidth={2} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={[styles.time, mono, { fontSize: Math.max(9, size * 0.075) }]}>-{fmt(remaining)}</Text>
          <Text style={[styles.mode, { color: deck.vinyl ? color : colors.faint }]}>{deck.vinyl ? 'VINYL' : 'CDJ'}</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

export function VuMeter({ level, height = 80, width = 6 }: { level: () => number; height?: number; width?: number }) {
  const v = useFrame(level, 30);
  const segs = 12;
  const lit = Math.round(Math.sqrt(v) * segs);
  return (
    <View style={{ height, width, justifyContent: 'flex-end', gap: 1.5 }}>
      {Array.from({ length: segs }).map((_, i) => {
        const idx = segs - 1 - i;
        const on = idx < lit;
        const c = idx >= segs - 2 ? colors.rec : idx >= segs - 4 ? colors.cue : colors.play;
        return <View key={i} style={{ flex: 1, borderRadius: 1, backgroundColor: on ? c : '#1b1b28' }} />;
      })}
    </View>
  );
}

export { fmt as formatTime };

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  time: { color: colors.text, fontWeight: '700' },
  mode: { fontSize: 8, fontWeight: '800', marginTop: 2, letterSpacing: 1 },
});
