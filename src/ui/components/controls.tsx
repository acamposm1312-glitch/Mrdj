import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Touch controls built on react-native-gesture-handler so several can be
 * operated at once (fader + jog + button), like real hardware.
 */

// ───────────────────────── Button ─────────────────────────

interface PressButtonProps {
  label?: string;
  sub?: string;
  color?: string;
  active?: boolean;
  dim?: boolean;
  onPress?: () => void;
  onRelease?: () => void;
  style?: StyleProp<ViewStyle>;
  textSize?: number;
  filled?: boolean;
  children?: React.ReactNode;
  testID?: string;
}

export function PressButton({
  label,
  sub,
  color = colors.dim,
  active,
  dim,
  onPress,
  onRelease,
  style,
  textSize = 12,
  filled,
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
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.btn,
          {
            borderColor: lit ? color : colors.border,
            backgroundColor: filled && lit ? color : lit ? `${color}33` : colors.panel2,
            opacity: dim ? 0.45 : 1,
          },
          lit && { shadowColor: color, shadowOpacity: 0.8, shadowRadius: 8, elevation: 4 },
          style,
        ]}
      >
        {children}
        {label != null && (
          <Text
            style={[styles.btnText, { fontSize: textSize, color: filled && lit ? '#08080F' : lit ? colors.text : color }]}
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

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  if (Math.abs(to - from) < 0.5) return '';
  const [a, b] = from < to ? [from, to] : [to, from];
  const p1 = polar(cx, cy, r, a);
  const p2 = polar(cx, cy, r, b);
  const large = b - a > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
}

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
      // gentle detent at centre for bipolar knobs
      if (bipolar && Math.abs(v - reset) < (max - min) * 0.015) v = reset;
      valueRef.current = v;
      onChange(v);
    },
  });
  const t = (value - min) / (max - min);
  const deg = -ARC + t * ARC * 2;
  const startDeg = bipolar ? 0 : -ARC;
  const c = size / 2;
  const r = size / 2 - 3;
  const tip = polar(c, c, r - 5, deg);
  const inner = polar(c, c, r * 0.25, deg);
  return (
    <View style={{ alignItems: 'center' }} testID={testID}>
      <GestureDetector gesture={gesture}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Path d={arcPath(c, c, r, -ARC, ARC)} stroke={colors.panel3} strokeWidth={3} fill="none" strokeLinecap="round" />
            <Path d={arcPath(c, c, r, startDeg, deg)} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
            <Circle cx={c} cy={c} r={r - 5} fill="#1d1d2b" stroke="#34344a" strokeWidth={1} />
            <Line x1={inner.x} y1={inner.y} x2={tip.x} y2={tip.y} stroke={colors.text} strokeWidth={2.2} strokeLinecap="round" />
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
  const capLen = vertical ? 22 : 18;
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
    tickEls.push(
      <View
        key={i}
        style={
          vertical
            ? { position: 'absolute', top: p, left: 2, right: 2, height: 1, backgroundColor: i === (ticks - 1) / 2 && center ? colors.dim : '#2a2a3c' }
            : { position: 'absolute', left: p, top: 2, bottom: 2, width: 1, backgroundColor: i === (ticks - 1) / 2 && center ? colors.dim : '#2a2a3c' }
        }
      />,
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
          style={
            vertical
              ? { position: 'absolute', top: capLen / 2, bottom: capLen / 2, width: 4, borderRadius: 2, backgroundColor: '#05050a' }
              : { position: 'absolute', left: capLen / 2, right: capLen / 2, height: 4, borderRadius: 2, backgroundColor: '#05050a' }
          }
        />
        <View
          style={[
            styles.cap,
            vertical
              ? { top: offset, width: thickness - 4, height: capLen }
              : { left: offset, height: thickness - 4, width: capLen },
          ]}
        >
          <View style={vertical ? { height: 2, width: '80%', backgroundColor: color } : { width: 2, height: '80%', backgroundColor: color }} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    minHeight: 30,
  },
  btnText: { fontWeight: '800', letterSpacing: 0.2, textAlign: 'center' },
  btnSub: { fontSize: 8, fontWeight: '600', marginTop: 1 },
  knobLabel: { color: colors.dim, fontSize: 9, fontWeight: '700', marginTop: 1, letterSpacing: 0.5 },
  cap: {
    position: 'absolute',
    borderRadius: 4,
    backgroundColor: '#3a3a52',
    borderWidth: 1,
    borderColor: '#55557a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
