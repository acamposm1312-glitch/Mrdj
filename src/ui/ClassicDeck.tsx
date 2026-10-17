import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isHarmonic } from '../audio/analysis';
import { TEMPO_RANGES } from '../audio/Deck';
import { useEngine, useFrame } from '../audio/engine';
import { FX_BEATS, FX_TYPES, FxType } from '../audio/fx';
import { SAMPLES } from '../audio/sampler';
import { useT } from '../state/settings';
import { Fader, Panel, PressButton, Screen } from './components/controls';
import { formatTime, JogWheel } from './components/JogWheel';
import { colors, deckColors, deckLetters, hotCueColors, mono } from './theme';

type Tab = 'cues' | 'loop' | 'smp' | 'fx';

const sampleColors = ['#F59E0B', '#3B82F6', '#8B5CF6', '#22C55E', '#EF4444', '#F97316', '#06B6D4', '#EC4899'];
const fxShort: Record<FxType, string> = { echo: 'ECHO', reverb: 'REV', flanger: 'FLNG', filter: 'FILT', crush: 'CRSH' };

function Clock({ index }: { index: number }) {
  const deck = useEngine().decks[index];
  const pos = useFrame(() => deck.position(), 4);
  return (
    <Text style={[styles.clock, mono]} numberOfLines={1}>
      {formatTime(pos).slice(0, -2)}/{formatTime(deck.duration || 0).slice(0, -2)}
    </Text>
  );
}

/**
 * Landscape deck in the classic DJ-app style: big platter, pitch fader on the
 * inner side, transport on the outer side and 8 pads with mode tabs below.
 */
export function ClassicDeck({
  index,
  otherIndex,
  width,
  height,
  mirror,
}: {
  index: number;
  otherIndex: number;
  width: number;
  height: number;
  mirror?: boolean;
}) {
  const engine = useEngine();
  const t = useT();
  const deck = engine.decks[index];
  const other = engine.decks[otherIndex];
  const color = deckColors[index];
  const [tab, setTab] = useState<Tab>('cues');
  const [shift, setShift] = useState(false);
  const track = deck.track;
  const harmonic = !!track && !!other.track && isHarmonic(track.camelot, other.track.camelot);
  const tempoPct = (deck.rate - 1) * 100;

  const pad = 6;
  const inner = width - pad * 2;
  const big = height > 420;
  const infoH = big ? 34 : 24;
  const rowH = big ? 30 : 24;
  const tabsW = big ? 64 : 48;
  const padW = Math.floor((inner - tabsW - 4 - 3 * 4) / 4) - 1;
  const padH = Math.max(30, Math.min(big ? 84 : 58, padW * 0.75, (height - pad * 2) * 0.15));
  const padsH = padH * 2 + 4;
  const jogH = height - pad * 2 - infoH - rowH - padsH - 3 * 4;
  const sideW = big ? 64 : 46;
  const pitchW = big ? 34 : 28;
  const jog = Math.max(70, Math.min(jogH, inner - sideW - pitchW - 8));

  // ── pads ──
  const p = (key: string, label: string, c: string, onPress: () => void, o: { active?: boolean; armed?: boolean; solid?: boolean; onRelease?: () => void } = {}) => (
    <PressButton
      key={key}
      label={label}
      color={c}
      active={o.active}
      armed={o.armed}
      solid={o.solid}
      onPress={onPress}
      onRelease={o.onRelease}
      style={{ width: padW, height: padH, minHeight: 0, borderRadius: 7 }}
      textSize={Math.max(7, Math.min(padW < 48 ? 9 : 11, Math.floor((padW - 4) / (label.length * 0.68))))}
    />
  );
  let pads: React.ReactNode[];
  if (tab === 'cues') {
    pads = deck.hotCues.map((hc, i) =>
      p(`h${i}`, `${i + 1}`, hotCueColors[i], () => (shift ? deck.clearHotCue(i) : deck.hotCue(i)), { solid: !!hc }),
    );
  } else if (tab === 'loop') {
    const jumps = shift ? [-16, -8, 8, 16] : [-4, -1, 1, 4];
    pads = [
      ...[1, 2, 4, 8].map((b) => p(`l${b}`, `${b}`, colors.loop, () => deck.autoLoop(b), { active: !!deck.loop?.active && deck.loop.beats === b })),
      ...jumps.map((j) => p(`j${j}`, j > 0 ? `${j}▶` : `◀${-j}`, colors.sync, () => deck.beatJump(j))),
    ];
  } else if (tab === 'smp') {
    pads = SAMPLES.map((s, i) => p(s, t.samples[s], sampleColors[i], () => engine.sampler.trigger(s), { solid: true }));
  } else {
    const fx = deck.fx;
    const set = (fn: () => void) => () => {
      fn();
      engine.emit();
    };
    pads = [
      ...FX_TYPES.map((ty) =>
        p(ty, fxShort[ty], colors.fx, set(() => {
          if (fx.type === ty) fx.setOn(!fx.on);
          else {
            fx.setType(ty);
            fx.setOn(true);
          }
        }), { active: fx.on && fx.type === ty, armed: fx.type === ty }),
      ),
      p('beats', fx.beats < 1 ? `${fx.beats}` : `${fx.beats}b`, colors.fx, set(() => fx.setBeats(FX_BEATS[(FX_BEATS.indexOf(fx.beats) + 1) % FX_BEATS.length]))),
      p('mix', `${Math.round(fx.mix * 100)}%`, colors.fx, set(() => fx.setMix(fx.mix >= 1 ? 0.25 : fx.mix + 0.25))),
      p('on', fx.on ? t.on : t.off, colors.fx, set(() => fx.setOn(!fx.on)), { active: fx.on }),
    ];
  }

  const tabs: [Tab, string][] = [
    ['cues', t.hotCue],
    ['loop', t.loop],
    ['smp', t.sampler],
    ['fx', t.fx],
  ];
  const small = (label: string, onPress: () => void, c: string = colors.dim, active = false, flex = 1) => (
    <PressButton key={label} label={label} color={c} active={active} onPress={onPress} style={{ flex, height: rowH, minHeight: 0, borderRadius: 6 }} textSize={big ? 10 : 8} />
  );
  const dir = mirror ? 'row-reverse' : 'row';

  return (
    <Panel style={[styles.deck, { width, height, padding: pad, gap: 4 }]} accent={color} screws={false}>
      <Screen style={[styles.info, { height: infoH, flexDirection: dir }]}>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{deckLetters[index]}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.title, { textAlign: mirror ? 'right' : 'left' }]}>
          {deck.loading ? t.loading : track ? track.title : t.noTrack}
        </Text>
        {track && <Clock index={index} />}
        <Text style={[styles.key, { color: harmonic ? colors.play : colors.dim }]}>{track?.camelot ?? ''}</Text>
        <Text style={[styles.bpm, mono, { fontSize: big ? 18 : 14, color: deck.sync ? colors.sync : colors.text }]}>
          {deck.bpm ? deck.currentBpm.toFixed(1) : '--.-'}
        </Text>
      </Screen>

      <View style={{ flexDirection: dir, gap: 3, height: rowH }}>
        {small('IN', () => deck.loopIn(), colors.loop, deck.loopInPending)}
        {small(deck.loop?.active ? 'EXIT' : 'OUT', () => (deck.loop?.active ? deck.exitLoop() : deck.loopOut()), colors.loop, !!deck.loop?.active)}
        {small(t.reloop.toUpperCase(), () => deck.reloop(), colors.loop, false, 1.4)}
        {small('½', () => deck.resizeLoop(0.5), colors.loop, false, 0.7)}
        {small('2×', () => deck.resizeLoop(2), colors.loop, false, 0.7)}
        {small(t.sync, () => engine.toggleSync(index), colors.sync, deck.sync, 1.2)}
        {small(t.keyLock, () => deck.setKeyLock(!deck.keyLock), colors.sync, deck.keyLock)}
        {small('⇧', () => setShift(!shift), colors.rec, shift, 0.8)}
      </View>

      <View style={{ flexDirection: dir, alignItems: 'center', gap: 4, height: jogH }}>
        <View style={{ width: sideW, height: Math.min(jogH, jog * 1.1), gap: 4 }}>
          <PressButton label={deck.vinyl ? '◉' : '○'} sub={deck.vinyl ? t.vinyl : 'CDJ'} color={color} active={deck.vinyl} onPress={() => { deck.vinyl = !deck.vinyl; engine.emit(); }} style={{ flex: 0.8, minHeight: 0 }} textSize={11} />
          <PressButton testID={`cue-${index}`} label={t.cue} color={colors.cue} onPress={() => { engine.resume(); deck.cueDown(); }} onRelease={() => deck.cueUp()} style={{ flex: 1, minHeight: 0 }} textSize={big ? 14 : 11} />
          <PressButton testID={`play-${index}`} label={deck.playing ? '❚❚' : '▶'} color={colors.play} active={deck.playing} onPress={() => engine.togglePlay(index)} style={{ flex: 1.15, minHeight: 0 }} textSize={big ? 20 : 15} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <JogWheel deck={deck} size={jog} color={color} />
        </View>
        <View style={{ width: pitchW, alignItems: 'center', height: jogH }}>
          <Text style={[styles.tempo, mono, { color: Math.abs(tempoPct) < 0.005 ? colors.dim : colors.text }]}>
            {tempoPct >= 0 ? '+' : ''}
            {tempoPct.toFixed(1)}
          </Text>
          <Fader
            testID={`pitch-${index}`}
            value={(1 - deck.pitch) / 2}
            onChange={(v) => engine.setPitch(index, 1 - 2 * v)}
            length={jogH - 14 - 22}
            thickness={pitchW - 2}
            color={color}
            center
            defaultValue={0.5}
            ticks={7}
          />
          <PressButton
            label={`±${Math.round(deck.pitchRange * 100)}`}
            onPress={() => deck.setPitchRange(TEMPO_RANGES[(TEMPO_RANGES.indexOf(deck.pitchRange) + 1) % TEMPO_RANGES.length])}
            style={{ width: pitchW, height: 18, minHeight: 0, marginTop: 4, borderRadius: 5 }}
            textSize={8}
          />
        </View>
      </View>

      <View style={{ flexDirection: dir, gap: 4, height: padsH }}>
        <View style={{ width: tabsW, gap: 2 }}>
          {tabs.map(([k, label]) => (
            <PressButton key={k} label={label} color={color} active={tab === k} onPress={() => setTab(k)} style={styles.tab} textSize={big ? 9 : 7} />
          ))}
        </View>
        <View style={styles.pads}>{pads}</View>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  deck: { overflow: 'hidden' },
  info: { alignItems: 'center', paddingHorizontal: 6, paddingVertical: 0, gap: 6 },
  badge: { width: 18, height: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#07070D', fontWeight: '900', fontSize: 11 },
  title: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 11 },
  clock: { color: colors.dim, fontSize: 10, fontWeight: '700' },
  key: { fontSize: 10, fontWeight: '800' },
  bpm: { fontWeight: '800' },
  tempo: { fontSize: 9, fontWeight: '700', marginBottom: 2 },
  tab: { flex: 1, minHeight: 0, borderRadius: 5 },
  pads: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignContent: 'space-between' },
});
