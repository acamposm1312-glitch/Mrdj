import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bpmFromTaps, isHarmonic } from '../audio/analysis';
import { TEMPO_RANGES } from '../audio/Deck';
import { useEngine } from '../audio/engine';
import { FX_BEATS, FX_TYPES, FxType } from '../audio/fx';
import { useLibrary } from '../library/library';
import { useT } from '../state/settings';
import { Fader, Knob, Panel, PressButton, Screen } from './components/controls';
import { JogWheel } from './components/JogWheel';
import { OverviewWaveform } from './components/Waveform';
import { colors, deckColors, deckLetters, hotCueColors, mono } from './theme';

type Tab = 'cues' | 'loop' | 'beat' | 'fx';

const loopLabel = (b: number) => (b < 1 ? `1/${Math.round(1 / b)}` : `${b}`);

export function DeckView({
  index,
  width,
  mirror,
  otherIndex,
  maxJog = 300,
}: {
  index: number;
  width: number;
  mirror?: boolean;
  otherIndex: number;
  maxJog?: number;
}) {
  const engine = useEngine();
  const t = useT();
  const deck = engine.decks[index];
  const other = engine.decks[otherIndex];
  const color = deckColors[index];
  const [tab, setTab] = useState<Tab>('cues');
  const [shift, setShift] = useState(false);
  const taps = useRef<number[]>([]);
  const updateTrack = useLibrary((s) => s.updateTrack);

  const track = deck.track;
  const faderW = 34;
  const jogSize = Math.max(110, Math.min(width - faderW - 30, maxJog));
  const narrow = width < 300;
  const harmonic = !!track && !!other.track && isHarmonic(track.camelot, other.track.camelot);
  const tempoPct = (deck.rate - 1) * 100;
  const isMaster = engine.masterIndex === index;
  const padW = Math.floor((width - 24 - 3 * 5) / 4);
  const padH = Math.max(34, Math.min(52, padW * 0.7));

  const tap = () => {
    const now = Date.now();
    const list = taps.current.filter((x) => now - x < 2500);
    list.push(now);
    taps.current = list.slice(-8);
    const bpm = bpmFromTaps(taps.current);
    if (list.length >= 4 && bpm > 40 && bpm < 250) deck.setBpmOverride(bpm);
  };

  const setGridHere = () => {
    if (!track) return;
    const bl = deck.beatLength;
    let fb = deck.position();
    if (bl) fb = fb - Math.floor(fb / bl) * bl;
    updateTrack(track.id, { firstBeat: fb });
  };

  const pads: React.ReactNode[] = [];
  const pad = (key: string, label: string, c: string, onPress: () => void, active = false, armed = false, dim = false) =>
    pads.push(
      <PressButton
        key={key}
        label={label}
        color={c}
        active={active}
        armed={armed}
        dim={dim}
        onPress={onPress}
        style={{ width: padW, height: padH, borderRadius: 7 }}
        textSize={padW < 50 ? 10 : 12}
      />,
    );

  if (tab === 'cues') {
    deck.hotCues.forEach((hc, i) =>
      pad(`h${i}`, `${i + 1}`, hotCueColors[i], () => (shift ? deck.clearHotCue(i) : deck.hotCue(i)), false, !!hc, !track),
    );
  } else if (tab === 'loop') {
    [1, 2, 4, 8].forEach((b) =>
      pad(`l${b}`, `${b}`, colors.loop, () => deck.autoLoop(b), !!deck.loop?.active && deck.loop.beats === b),
    );
    pad('half', '÷2', colors.loop, () => deck.resizeLoop(0.5));
    pad('dbl', '×2', colors.loop, () => deck.resizeLoop(2));
    pad('in', shift ? t.reloop : 'IN', colors.loop, () => (shift ? deck.reloop() : deck.loopIn()), deck.loopInPending);
    pad('out', deck.loop?.active ? 'EXIT' : 'OUT', colors.loop, () => (deck.loop?.active ? deck.exitLoop() : deck.loopOut()), !!deck.loop?.active);
  } else if (tab === 'beat') {
    const jumps = shift ? [-16, -8, 8, 16] : [-4, -1, 1, 4];
    jumps.forEach((j) => pad(`j${j}`, j > 0 ? `+${j}` : `${j}`, colors.sync, () => deck.beatJump(j)));
    pad('bh', `BPM${t.half}`, colors.accent, () => deck.bpm && deck.setBpmOverride(deck.bpm / 2));
    pad('bd', `BPM${t.double}`, colors.accent, () => deck.bpm && deck.setBpmOverride(deck.bpm * 2));
    pad('tap', t.tapTempo, colors.accent, tap);
    pad('grid', 'GRID', colors.accent, setGridHere);
  }

  return (
    <Panel style={[styles.deck, { width }]} accent={color}>
      {/* info display */}
      <Screen style={styles.header}>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{deckLetters[index]}</Text>
        </View>
        <View style={{ flex: 1, marginHorizontal: 6 }}>
          <Text numberOfLines={1} style={styles.title}>
            {deck.loading ? t.loading : track ? track.title : t.noTrack}
          </Text>
          <Text numberOfLines={1} style={styles.artist}>
            {track?.artist || ' '}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.bpm, mono, { color: deck.sync ? colors.sync : colors.text }]}>
            {deck.bpm ? deck.currentBpm.toFixed(1) : '--.-'}
          </Text>
          <Text style={[styles.key, { color: harmonic ? colors.play : colors.dim }]}>
            {track?.camelot ? `${track.camelot} · ${track.key}` : ' '}
          </Text>
        </View>
      </Screen>

      <Screen>
        <OverviewWaveform deck={deck} color={color} />
      </Screen>

      {/* jog + pitch */}
      <View style={[styles.mid, { flexDirection: mirror ? 'row-reverse' : 'row' }]}>
        <View style={{ alignItems: 'center', width: faderW + 6 }}>
          <Text style={[styles.tempo, mono, { color: Math.abs(tempoPct) < 0.005 ? colors.dim : colors.text }]}>
            {tempoPct >= 0 ? '+' : ''}
            {tempoPct.toFixed(1)}%
          </Text>
          <Fader
            testID={`pitch-${index}`}
            value={(1 - deck.pitch) / 2}
            onChange={(v) => engine.setPitch(index, 1 - 2 * v)}
            length={jogSize - 34}
            thickness={faderW}
            color={color}
            center
            defaultValue={0.5}
          />
          <PressButton
            label={`±${Math.round(deck.pitchRange * 100)}`}
            textSize={9}
            style={styles.smallBtn}
            onPress={() => deck.setPitchRange(TEMPO_RANGES[(TEMPO_RANGES.indexOf(deck.pitchRange) + 1) % TEMPO_RANGES.length])}
          />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <JogWheel deck={deck} size={jogSize} color={color} />
        </View>
      </View>

      {/* mode buttons */}
      <View style={styles.row}>
        <PressButton label={t.keyLock} color={colors.sync} active={deck.keyLock} onPress={() => deck.setKeyLock(!deck.keyLock)} style={styles.flexBtn} textSize={10} />
        <PressButton label={t.quantize} color={colors.cue} active={deck.quantize} onPress={() => { deck.quantize = !deck.quantize; engine.emit(); }} style={styles.flexBtn} textSize={10} />
        <PressButton label={narrow ? '◉' : t.vinyl} color={color} active={deck.vinyl} onPress={() => { deck.vinyl = !deck.vinyl; engine.emit(); }} style={styles.flexBtn} textSize={10} />
        <PressButton label={narrow ? '0%' : t.reset} onPress={() => engine.setRate(index, 1)} style={styles.flexBtn} textSize={10} />
        <PressButton label={narrow ? '⇧' : 'SHIFT'} color={colors.rec} active={shift} onPress={() => setShift(!shift)} style={styles.flexBtn} textSize={10} />
      </View>

      {/* transport */}
      <View style={styles.row}>
        <PressButton
          testID={`cue-${index}`}
          label={t.cue}
          color={colors.cue}
          onPress={() => {
            engine.resume();
            deck.cueDown();
          }}
          onRelease={() => deck.cueUp()}
          round
          style={[styles.transport]}
          textSize={14}
        />
        <PressButton
          testID={`play-${index}`}
          label={deck.playing ? '❚❚' : '▶'}
          color={colors.play}
          active={deck.playing}
          onPress={() => engine.togglePlay(index)}
          round
          style={[styles.transport]}
          textSize={18}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <PressButton label={t.sync} color={colors.sync} active={deck.sync} onPress={() => engine.toggleSync(index)} style={{ flex: 1 }} textSize={11} />
          <PressButton label={t.master} color={colors.cue} active={isMaster} onPress={() => engine.setMaster(index)} style={{ flex: 1 }} textSize={9} />
        </View>
      </View>

      {/* pad modes */}
      <View style={styles.tabs}>
        {(
          [
            ['cues', narrow ? t.cue : t.hotCue],
            ['loop', t.loop],
            ['beat', t.beatJump],
            ['fx', t.fx],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <PressButton key={k} label={label} color={color} active={tab === k} onPress={() => setTab(k)} style={styles.tab} textSize={9} />
        ))}
      </View>

      {tab === 'fx' ? (
        <FxPanel deckIndex={index} width={width} />
      ) : (
        <View style={styles.pads}>{pads}</View>
      )}
    </Panel>
  );
}

function FxPanel({ deckIndex, width }: { deckIndex: number; width: number }) {
  const engine = useEngine();
  const t = useT();
  const fx = engine.decks[deckIndex].fx;
  const names: Record<FxType, string> = { echo: t.echo, reverb: t.reverb, flanger: t.flanger, filter: t.filterFx, crush: t.crush };
  const small = width < 260;
  return (
    <View style={{ gap: 5 }}>
      <View style={styles.rowWrap}>
        {FX_TYPES.map((ty) => (
          <PressButton
            key={ty}
            label={small ? names[ty].slice(0, 4).toUpperCase() : names[ty].toUpperCase()}
            color={colors.fx}
            active={fx.type === ty}
            onPress={() => {
              fx.setType(ty);
              engine.emit();
            }}
            style={{ flexGrow: 1, flexBasis: 0, height: 30 }}
            textSize={9}
          />
        ))}
      </View>
      <View style={styles.rowWrap}>
        {FX_BEATS.map((b) => (
          <PressButton
            key={b}
            label={b === 0.25 ? '¼' : b === 0.5 ? '½' : b === 0.75 ? '¾' : `${b}`}
            color={colors.fx}
            active={fx.beats === b}
            onPress={() => {
              fx.setBeats(b);
              engine.emit();
            }}
            style={{ flexGrow: 1, flexBasis: 0, height: 28 }}
            textSize={11}
          />
        ))}
      </View>
      <View style={[styles.row, { alignItems: 'center' }]}>
        <PressButton
          testID={`fx-on-${deckIndex}`}
          label={fx.on ? t.on : t.off}
          color={colors.fx}
          active={fx.on}
          filled
          onPress={() => {
            fx.setOn(!fx.on);
            engine.emit();
          }}
          style={{ flex: 1, height: 40 }}
          textSize={13}
        />
        <Knob
          value={fx.mix}
          min={0}
          max={1}
          bipolar={false}
          defaultValue={0.5}
          color={colors.fx}
          size={40}
          label={t.mix}
          onChange={(v) => {
            fx.setMix(v);
            engine.emit();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { padding: 10, paddingTop: 12, gap: 7 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 6 },
  badge: { width: 22, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#07070D', fontWeight: '900', fontSize: 13 },
  title: { color: colors.text, fontWeight: '700', fontSize: 12 },
  artist: { color: colors.dim, fontSize: 10 },
  bpm: { fontSize: 18, fontWeight: '800' },
  key: { fontSize: 9, fontWeight: '700' },
  mid: { alignItems: 'center', gap: 4 },
  tempo: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  smallBtn: { minHeight: 22, height: 22, marginTop: 4, width: 34 },
  row: { flexDirection: 'row', gap: 5 },
  rowWrap: { flexDirection: 'row', gap: 4 },
  flexBtn: { flex: 1, minHeight: 26, height: 26 },
  transport: { flex: 1.2, height: 56 },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { flex: 1, minHeight: 24, height: 24 },
  pads: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
});
