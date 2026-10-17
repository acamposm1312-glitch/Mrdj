import { LinearGradient } from 'expo-linear-gradient';
import React, { useId, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop } from 'react-native-svg';
import { alpha, colors, metal, shade } from '../theme';

/**
 * Hardware-style touch controls (rubber pads, metal knobs, fader caps) built
 * on react-native-gesture-handler so several can be used at once, like a real
 * controller.
 */

// ───────────────────────── Panel ─────────────────────────

/** Brushed-metal faceplate with bevelled edge and corner screws. */
export function Panel({
  children,
  style,
  accent,
  screws = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: string;
  screws?: boolean;
}) {
  return (
    <View style={[styles.panelShadow, style]}>
      <LinearGradient colors={metal.panel} start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.25 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {accent && <View style={[styles.accentBar, { backgroundColor: accent, shadowColor: accent }]} />}
      {screws &&
        (['tl', 'tr', 'bl', 'br'] as const).map((k) => (
          <View
            key={k}
            pointerEvents="none"
            style={[styles.screw, k[0] === 't' ? { top: 4 } : { bottom: 4 }, k[1] === 'l' ? { left: 4 } : { right: 4 }]}
          >
            <View style={[styles.screwSlot, { transform: [{ rotate: k === 'tl' ? '35deg' : k === 'tr' ? '-20deg' : k === 'bl' ? '70deg' : '10deg' }] }]} />
          </View>
        ))}
      {children}
    </View>
  );
}

/** Recessed LCD screen with glass reflection. */
export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.screen, style]}>
      {children}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.15, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

// ───────────────────────── Button ─────────────────────────

interface PressButtonProps {
  label?: string;
  sub?: string;
  color?: string;
  active?: boolean;
  /** assigned but not lit (e.g. a hot cue that is set) */
  armed?: boolean;
  dim?: boolean;
  onPress?: () => void;
  onRelease?: () => void;
  style?: StyleProp<ViewStyle>;
  textSize?: number;
  filled?: boolean;
  round?: boolean;
  children?: React.ReactNode;
  testID?: string;
}

/** Rubber pad / backlit button. Fires on touch-down for tight timing. */
export function PressButton({
  label,
  sub,
  color = colors.dim,
  active,
  armed,
  dim,
  onPress,
  onRelease,
  style,
  textSize = 12,
  filled,
  round,
  children,
  testID,
}: PressButtonProps) {
  const [down, setDown] = useState(false);
  const gesture = usePanGesture({
    runOnJS: true,
    minDistance: 100000,
    onBegin: () => {
      setDown(true);
      onPress?.();
    },
    onFinalize: () => {
      setDown(false);
      onRelease?.();
    },
  });
  const lit = active || down;
  const bg: readonly [string, string, ...string[]] = lit
    ? filled
      ? [shade(color, 0.25), color, shade(color, -0.25)]
      : [alpha(color, 0.5), alpha(color, 0.26), alpha(color, 0.18)]
    : armed
      ? [alpha(color, 0.3), alpha(color, 0.14), alpha(color, 0.1)]
      : down
        ? metal.rubberPressed
        : metal.rubber;
  const textColor = filled && lit ? '#08080F' : lit ? '#ffffff' : armed ? shade(color, 0.3) : color;
  const flat = StyleSheet.flatten(style) || {};
  const radius = round ? 999 : (flat.borderRadius as number) ?? 9;
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.btnOuter,
          { borderRadius: radius, opacity: dim ? 0.45 : 1, transform: [{ translateY: down ? 1.5 : 0 }] },
          lit && { shadowColor: color, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
          style,
        ]}
      >
        <LinearGradient
          colors={bg}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              borderWidth: 1.5,
              borderColor: lit ? shade(color, 0.2) : armed ? alpha(color, 0.6) : '#3a3a4e',
              borderBottomColor: lit ? shade(color, -0.3) : '#0a0a0f',
            },
          ]}
        />
        {!down && <View pointerEvents="none" style={[styles.btnHighlight, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]} />}
        {children}
        {label != null && (
          <Text
            style={[
              styles.btnText,
              { fontSize: textSize, color: textColor },
              (lit || armed) && { textShadowColor: color, textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } },
            ]}
          >
            {label}
          </Text>
        )}
        {sub != null && <Text style={[styles.btnSub, { color: lit ? colors.text : colors.faint }]}>{sub}</Text>}
      </View>
    </GestureDetector>
  );
}

// ───────────────────────── Knob ─────────────────────────

interface KnobProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  bipolar?: boolean;
  size?: number;
  color?: string;
  label?: string;
  defaultValue?: number;
  testID?: string;
}

const ARC = 135;
const LEDS = 15;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Metal knob with knurled skirt and LED value ring. Drag up/down; double-tap resets. */
export function Knob({
  value,
  onChange,
  min = -1,
  max = 1,
  bipolar = true,
  size = 40,
  color = colors.accent,
  label,
  defaultValue,
  testID,
}: KnobProps) {
  const gid = useId().replace(/:/g, '');
  const valueRef = useRef(value);
  valueRef.current = value;
  const lastTap = useRef(0);
  const reset = defaultValue ?? (bipolar ? (min + max) / 2 : min);
  const gesture = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    onBegin: () => {
      const now = Date.now();
      if (now - lastTap.current < 300) onChange(reset);
      lastTap.current = now;
    },
    onUpdate: (e) => {
      const delta = (-e.changeY + e.changeX * 0.5) / 140;
      let v = valueRef.current + delta * (max - min);
      v = Math.max(min, Math.min(max, v));
      if (bipolar && Math.abs(v - reset) < (max - min) * 0.015) v = reset;
      valueRef.current = v;
      onChange(v);
    },
  });
  const t = (value - min) / (max - min);
  const deg = -ARC + t * ARC * 2;
  const c = size / 2;
  const ledR = size / 2 - 2.2;
  const skirtR = size / 2 - 6;
  const capR = skirtR * 0.72;
  const tip = polar(c, c, capR - 2, deg);
  const inner = polar(c, c, capR * 0.3, deg);
  const centreT = bipolar ? 0.5 : 0;

  const leds = [];
  for (let i = 0; i < LEDS; i++) {
    const lt = i / (LEDS - 1);
    const on = bipolar ? (t >= centreT ? lt >= centreT - 0.01 && lt <= t + 0.01 : lt <= centreT + 0.01 && lt >= t - 0.01) : lt <= t + 0.01;
    const p = polar(c, c, ledR, -ARC + lt * ARC * 2);
    leds.push(<Circle key={i} cx={p.x} cy={p.y} r={1.3} fill={on ? color : '#2a2a38'} opacity={on ? 1 : 0.9} />);
  }
  const knurl = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * 360 + deg;
    const p1 = polar(c, c + 1, skirtR - 0.5, a);
    const p2 = polar(c, c + 1, skirtR - 3, a);
    knurl.push(<Line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#0c0c12" strokeWidth={1} />);
  }
  return (
    <View style={{ alignItems: 'center' }} testID={testID}>
      <GestureDetector gesture={gesture}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id={`cap${gid}`} cx="38%" cy="30%" r="75%">
                <Stop offset="0" stopColor="#8a8aa0" />
                <Stop offset="0.45" stopColor="#3c3c4e" />
                <Stop offset="1" stopColor="#17171f" />
              </RadialGradient>
              <RadialGradient id={`sk${gid}`} cx="50%" cy="35%" r="70%">
                <Stop offset="0" stopColor="#3a3a4c" />
                <Stop offset="1" stopColor="#101016" />
              </RadialGradient>
            </Defs>
            {leds}
            <Circle cx={c} cy={c + 2} r={skirtR} fill="#000" opacity={0.55} />
            <Circle cx={c} cy={c + 1} r={skirtR} fill={`url(#sk${gid})`} stroke="#4a4a60" strokeWidth={0.6} />
            <G>{knurl}</G>
            <Circle cx={c} cy={c} r={capR} fill={`url(#cap${gid})`} stroke="#5c5c74" strokeWidth={0.6} />
            <Line x1={inner.x} y1={inner.y} x2={tip.x} y2={tip.y} stroke="#ffffff" strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </View>
      </GestureDetector>
      {label != null && <Text style={styles.knobLabel}>{label}</Text>}
    </View>
  );
}

// ───────────────────────── Fader ─────────────────────────

interface FaderProps {
  value: number; // 0..1
  onChange: (v: number) => void;
  vertical?: boolean;
  length?: number | `${number}%`;
  thickness?: number;
  color?: string;
  center?: boolean;
  invert?: boolean;
  defaultValue?: number;
  testID?: string;
  ticks?: number;
}

/** Long-throw fader with a slotted faceplate and a metal cap. */
export function Fader({
  value,
  onChange,
  vertical = true,
  length,
  thickness = 34,
  color = colors.text,
  center,
  invert,
  defaultValue,
  testID,
  ticks = 9,
}: FaderProps) {
  const [size, setSize] = useState(100);
  const valueRef = useRef(value);
  valueRef.current = value;
  const lastTap = useRef(0);
  const capLen = vertical ? 26 : 22;
  const travel = Math.max(1, size - capLen);
  const gesture = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    onBegin: () => {
      const now = Date.now();
      if (defaultValue != null && now - lastTap.current < 300) onChange(defaultValue);
      lastTap.current = now;
    },
    onUpdate: (e) => {
      let d = (vertical ? -e.changeY : e.changeX) / travel;
      if (invert) d = -d;
      let v = Math.max(0, Math.min(1, valueRef.current + d));
      if (center && Math.abs(v - 0.5) < 0.012) v = 0.5;
      valueRef.current = v;
      onChange(v);
    },
  });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize(vertical ? e.nativeEvent.layout.height : e.nativeEvent.layout.width);
  const shown = invert ? 1 - value : value;
  const offset = vertical ? (1 - shown) * travel : shown * travel;
  const tickEls = [];
  for (let i = 0; i < ticks; i++) {
    const p = capLen / 2 + (i / (ticks - 1)) * travel;
    const major = i === 0 || i === ticks - 1 || (center && i === (ticks - 1) / 2);
    const tick = { backgroundColor: major ? '#7a7a92' : '#3a3a4e' };
    tickEls.push(
      vertical ? (
        <React.Fragment key={i}>
          <View style={[styles.tickV, tick, { top: p, left: 0, width: major ? 8 : 5 }]} />
          <View style={[styles.tickV, tick, { top: p, right: 0, width: major ? 8 : 5 }]} />
        </React.Fragment>
      ) : (
        <React.Fragment key={i}>
          <View style={[styles.tickH, tick, { left: p, top: 0, height: major ? 8 : 5 }]} />
          <View style={[styles.tickH, tick, { left: p, bottom: 0, height: major ? 8 : 5 }]} />
        </React.Fragment>
      ),
    );
  }
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        onLayout={onLayout}
        style={[
          vertical ? { width: thickness, height: length ?? '100%' } : { height: thickness, width: length ?? '100%' },
          { justifyContent: 'center', alignItems: 'center' },
        ]}
      >
        {tickEls}
        <View
          style={[
            styles.slot,
            vertical
              ? { top: capLen / 2 - 3, bottom: capLen / 2 - 3, width: 6 }
              : { left: capLen / 2 - 3, right: capLen / 2 - 3, height: 6 },
          ]}
        />
        <View
          style={[
            styles.capShadow,
            vertical ? { top: offset, width: thickness - 6, height: capLen } : { left: offset, height: thickness - 6, width: capLen },
          ]}
        >
          <LinearGradient
            colors={metal.cap}
            locations={[0, 0.35, 0.65, 1]}
            start={vertical ? { x: 0, y: 0 } : { x: 0, y: 0 }}
            end={vertical ? { x: 0, y: 1 } : { x: 1, y: 0 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 4 }]}
          />
          <View
            style={[
              vertical ? { height: 3, width: '86%' } : { width: 3, height: '86%' },
              { backgroundColor: color, borderRadius: 1, shadowColor: color, shadowOpacity: 1, shadowRadius: 4 },
            ]}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  panelShadow: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: metal.panelEdge,
    borderBottomColor: '#07070b',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 2,
    borderRadius: 1,
    shadowOpacity: 1,
    shadowRadius: 6,
    opacity: 0.85,
  },
  screw: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#3c3c4c',
    borderWidth: 0.5,
    borderColor: '#5e5e72',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screwSlot: { width: 5, height: 1, backgroundColor: '#15151c' },
  screen: {
    backgroundColor: '#030306',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#0b0b10',
    borderTopColor: '#000',
    borderBottomColor: '#2a2a38',
  },
  btnOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    minHeight: 30,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  btnHighlight: {
    position: 'absolute',
    top: 1.5,
    left: 4,
    right: 4,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  btnText: { fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
  btnSub: { fontSize: 8, fontWeight: '600', marginTop: 1 },
  knobLabel: { color: '#9a9ab4', fontSize: 9, fontWeight: '800', marginTop: 1, letterSpacing: 0.8 },
  tickV: { position: 'absolute', height: 1 },
  tickH: { position: 'absolute', width: 1 },
  slot: {
    position: 'absolute',
    borderRadius: 3,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: '#000',
    borderBottomColor: '#2e2e3e',
    borderRightColor: '#2e2e3e',
  },
  capShadow: {
    position: 'absolute',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    borderWidth: 0.5,
    borderColor: '#1a1a24',
  },
});
