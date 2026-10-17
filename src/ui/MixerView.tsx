import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useEngine } from '../audio/engine';
import { useT } from '../state/settings';
import { Fader, Knob, Panel, PressButton } from './components/controls';
import { VuMeter } from './components/JogWheel';
import { colors, deckColors, deckLetters } from './theme';

function Channel({ index, width, faderLen, compact }: { index: number; width: number; faderLen: number; compact?: boolean }) {
  const engine = useEngine();
  const t = useT();
  const d = engine.decks[index];
  const color = deckColors[index];
  const ks = Math.max(30, Math.min(42, width * 0.5));
  const nextAssign = { A: 'THRU', THRU: 'B', B: 'A' } as const;
  if (compact) {
    const k = 26;
    return (
      <View style={[styles.channel, { width, paddingVertical: 4, gap: 2 }]}>
        <View style={styles.grid}>
          <Knob testID={`eq-high-${index}`} value={d.eq.high} onChange={(v) => d.setEq('high', v)} size={k} color={color} label={t.high} />
          <Knob testID={`trim-${index}`} value={d.trim} onChange={(v) => d.setTrim(v)} size={k} color={colors.dim} label={t.trim} />
          <Knob testID={`eq-mid-${index}`} value={d.eq.mid} onChange={(v) => d.setEq('mid', v)} size={k} color={color} label={t.mid} />
          <Knob testID={`filter-${index}`} value={d.filter} onChange={(v) => d.setFilter(v)} size={k} color={colors.accent} label="FLT" />
          <Knob testID={`eq-low-${index}`} value={d.eq.low} onChange={(v) => d.setEq('low', v)} size={k} color={color} label={t.low} />
          <PressButton testID={`pfl-${index}`} label="🎧" color={colors.cue} active={d.pfl} onPress={() => d.setPfl(!d.pfl)} style={{ width: k + 4, height: k, minHeight: 0, marginTop: 2 }} textSize={11} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: faderLen }}>
          <VuMeter level={() => d.level()} height={faderLen - 10} width={5} />
          <Fader testID={`volume-${index}`} value={d.volume} onChange={(v) => d.setVolume(v)} length={faderLen} thickness={28} color={color} defaultValue={0.8} ticks={5} />
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.channel, { width }]}>
      <Text style={[styles.chLabel, { color }]}>{deckLetters[index]}</Text>
      <Knob testID={`trim-${index}`} value={d.trim} onChange={(v) => d.setTrim(v)} size={ks} color={colors.dim} label={t.trim} />
      <Knob testID={`eq-high-${index}`} value={d.eq.high} onChange={(v) => d.setEq('high', v)} size={ks} color={color} label={t.high} />
      <Knob testID={`eq-mid-${index}`} value={d.eq.mid} onChange={(v) => d.setEq('mid', v)} size={ks} color={color} label={t.mid} />
      <Knob testID={`eq-low-${index}`} value={d.eq.low} onChange={(v) => d.setEq('low', v)} size={ks} color={color} label={t.low} />
      <Knob testID={`filter-${index}`} value={d.filter} onChange={(v) => d.setFilter(v)} size={ks} color={colors.accent} label={t.filter} />
      <PressButton
        testID={`pfl-${index}`}
        label={`🎧 ${t.cue}`}
        color={colors.cue}
        active={d.pfl}
        onPress={() => d.setPfl(!d.pfl)}
        style={{ alignSelf: 'stretch', minHeight: 26, height: 26 }}
        textSize={9}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: faderLen }}>
        <VuMeter level={() => d.level()} height={faderLen - 12} />
        <Fader testID={`volume-${index}`} value={d.volume} onChange={(v) => d.setVolume(v)} length={faderLen} thickness={32} color={color} defaultValue={0.8} />
      </View>
      <PressButton
        label={d.xfAssign}
        color={color}
        active={d.xfAssign !== 'THRU'}
        onPress={() => engine.setXfAssign(index, nextAssign[d.xfAssign])}
        style={{ alignSelf: 'stretch', minHeight: 22, height: 22 }}
        textSize={9}
      />
    </View>
  );
}

export function MixerView({
  channels,
  width,
  faderLen = 120,
  compact,
  height,
  sampler,
}: {
  channels: number[];
  width: number;
  faderLen?: number;
  compact?: boolean;
  height?: number;
  /** show the sampler volume knob */
  sampler?: boolean;
}) {
  const engine = useEngine();
  const t = useT();
  if (compact) {
    const masterW = 64;
    const chW = Math.max(66, (width - masterW - 12 - 4 * channels.length) / channels.length);
    const stripH = (height ?? 240) - 8 - 30 - 4;
    const fl = Math.max(44, stripH - 3 * 41 - 12);
    const half = Math.ceil(channels.length / 2);
    return (
      <Panel style={[styles.mixer, { width, padding: 5, paddingTop: 6, gap: 4 }]} screws={false}>
        <View style={[styles.strips, { gap: 4, height: stripH }]}>
          {channels.slice(0, half).map((i) => (
            <Channel key={i} index={i} width={chW} faderLen={fl} compact />
          ))}
          <View style={[styles.master, { width: masterW, gap: 3, paddingVertical: 2 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Knob testID="master" value={engine.masterVolume} min={0} max={1} bipolar={false} defaultValue={0.85} onChange={(v) => engine.setMasterVolume(v)} size={34} color={colors.text} label="MST" />
              <VuMeter level={() => engine.masterLevel()} height={40} width={5} />
            </View>
            <Knob value={engine.cueMix} min={0} max={1} bipolar={false} defaultValue={0} onChange={(v) => engine.setCueMix(v)} size={26} color={colors.cue} label={t.cueMix} />
            <Knob value={engine.headphoneVolume} min={0} max={1} bipolar={false} defaultValue={0.85} onChange={(v) => engine.setHeadphoneVolume(v)} size={26} color={colors.cue} label="🎧 VOL" />
            <PressButton testID="split-cue" label="SPLIT" color={colors.cue} active={engine.splitCue} onPress={() => engine.setSplitCue(!engine.splitCue)} style={{ alignSelf: 'stretch', minHeight: 0, height: 22 }} textSize={8} />
            {sampler ? (
              <Knob value={engine.sampler.volume} min={0} max={1} bipolar={false} defaultValue={0.7} onChange={(v) => { engine.sampler.setVolume(v); engine.emit(); }} size={26} color={colors.fx} label="SMP" />
            ) : (
              <PressButton label={engine.xfCurve === 'smooth' ? '⌒XF' : '⊓XF'} color={colors.accent} active={engine.xfCurve === 'sharp'} onPress={() => engine.setXfCurve(engine.xfCurve === 'smooth' ? 'sharp' : 'smooth')} style={{ alignSelf: 'stretch', minHeight: 0, height: 22 }} textSize={8} />
            )}
          </View>
          {channels.slice(half).map((i) => (
            <Channel key={i} index={i} width={chW} faderLen={fl} compact />
          ))}
        </View>
        <View style={[styles.xfRow, { paddingVertical: 0, height: 30 }]}>
          <Text style={[styles.xfLabel, { color: deckColors[0], fontSize: 12 }]}>A</Text>
          <View style={{ flex: 1 }}>
            <Fader testID="crossfader" vertical={false} value={(engine.crossfader + 1) / 2} onChange={(v) => engine.setCrossfader(v * 2 - 1)} thickness={28} center defaultValue={0.5} color={colors.text} ticks={7} />
          </View>
          <Text style={[styles.xfLabel, { color: deckColors[1], fontSize: 12 }]}>B</Text>
        </View>
      </Panel>
    );
  }
  const masterW = Math.max(70, Math.min(96, width * 0.22));
  const chW = Math.max(52, (width - masterW - 16 - 6 * channels.length) / channels.length);
  const left = channels.slice(0, Math.ceil(channels.length / 2));
  const right = channels.slice(Math.ceil(channels.length / 2));
  return (
    <Panel style={[styles.mixer, { width }]}>
      <View style={styles.strips}>
        {left.map((i) => (
          <Channel key={i} index={i} width={chW} faderLen={faderLen} />
        ))}
        <View style={[styles.master, { width: masterW }]}>
          <Text style={styles.chLabel}>{t.master}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Knob testID="master" value={engine.masterVolume} min={0} max={1} bipolar={false} defaultValue={0.85} onChange={(v) => engine.setMasterVolume(v)} size={44} color={colors.text} />
            <VuMeter level={() => engine.masterLevel()} height={44} />
          </View>
          <View style={styles.sep} />
          <Text style={styles.small}>🎧 {t.headphones}</Text>
          <Knob value={engine.cueMix} min={0} max={1} bipolar={false} defaultValue={0} onChange={(v) => engine.setCueMix(v)} size={36} color={colors.cue} label={t.cueMix} />
          <Knob value={engine.headphoneVolume} min={0} max={1} bipolar={false} defaultValue={0.85} onChange={(v) => engine.setHeadphoneVolume(v)} size={36} color={colors.cue} label="VOL" />
          <PressButton
            testID="split-cue"
            label={t.splitCue.toUpperCase()}
            color={colors.cue}
            active={engine.splitCue}
            onPress={() => engine.setSplitCue(!engine.splitCue)}
            style={{ alignSelf: 'stretch', minHeight: 26, height: 26 }}
            textSize={8}
          />
          <View style={styles.sep} />
          {sampler && (
            <Knob value={engine.sampler.volume} min={0} max={1} bipolar={false} defaultValue={0.7} onChange={(v) => { engine.sampler.setVolume(v); engine.emit(); }} size={36} color={colors.fx} label={t.sampler} />
          )}
          <PressButton
            label={engine.xfCurve === 'smooth' ? '⌒ XF' : '⊓ XF'}
            color={colors.accent}
            active={engine.xfCurve === 'sharp'}
            onPress={() => engine.setXfCurve(engine.xfCurve === 'smooth' ? 'sharp' : 'smooth')}
            style={{ alignSelf: 'stretch', minHeight: 24, height: 24 }}
            textSize={9}
          />
        </View>
        {right.map((i) => (
          <Channel key={i} index={i} width={chW} faderLen={faderLen} />
        ))}
      </View>
      <View style={styles.xfRow}>
        <Text style={[styles.xfLabel, { color: deckColors[0] }]}>A</Text>
        <View style={{ flex: 1 }}>
          <Fader
            testID="crossfader"
            vertical={false}
            value={(engine.crossfader + 1) / 2}
            onChange={(v) => engine.setCrossfader(v * 2 - 1)}
            thickness={36}
            center
            defaultValue={0.5}
            color={colors.text}
          />
        </View>
        <Text style={[styles.xfLabel, { color: deckColors[1] }]}>B</Text>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  mixer: { padding: 10, paddingTop: 14, gap: 8 },
  strips: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  channel: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.5)',
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  master: { alignItems: 'center', gap: 5, paddingVertical: 6 },
  chLabel: { color: colors.dim, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  small: { color: colors.dim, fontSize: 9, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 64, justifyContent: 'space-between', rowGap: 1 },
  sep: { height: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginVertical: 2 },
  xfRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10 },
  xfLabel: { fontWeight: '900', fontSize: 14 },
});
