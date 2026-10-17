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
  compact,
  height,
}: {
  index: number;
  width: number;
  mirror?: boolean;
  otherIndex: number;
  maxJog?: number;
  /** short landscape screens (phones): everything on one screen, no scrolling */
  compact?: boolean;
  height?: number;
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

  if (compact) {
    const H = Math.max(96, (height ?? 240) - 6 * 2 - 24 - 30 - 8);
    const colW = 58;
    const jog = Math.max(80, Math.min(H, width - 12 - faderW - colW - 12));
    const tabs: Tab[] = ['cues', 'loop', 'beat', 'fx'];
    const tabLabel: Record<Tab, string> = { cues: t.cue, loop: t.loop, beat: t.beatJump, fx: t.fx };
    const fx = deck.fx;
    const cpad = (key: string, label: string, c: string, onPress: () => void, active = false, armed = false) => (
      <PressButton key={key} label={label} color={c} active={active} armed={armed} dim={!track} onPress={onPress} style={styles.cpad} textSize={10} />
    );
    let row: React.ReactNode[];
    if (tab === 'cues') {
      row = [0, 1, 2, 3].map((i) =>
        cpad(`h${i}`, `${i + 1}`, hotCueColors[i], () => (shift ? deck.clearHotCue(i) : deck.hotCue(i)), false, !!deck.hotCues[i]),
      );
    } else if (tab === 'loop') {
      row = shift
        ? [
            cpad('half', '÷2', colors.loop, () => deck.resizeLoop(0.5)),
            cpad('dbl', '×2', colors.loop, () => deck.resizeLoop(2)),
            cpad('in', 'IN', colors.loop, () => deck.loopIn(), deck.loopInPending),
            cpad('out', deck.loop?.active ? 'EXIT' : 'OUT', colors.loop, () => (deck.loop?.active ? deck.exitLoop() : deck.loopOut()), !!deck.loop?.active),
          ]
        : [1, 2, 4, 8].map((b) => cpad(`l${b}`, `${b}`, colors.loop, () => deck.autoLoop(b), !!deck.loop?.active && deck.loop.beats === b));
    } else if (tab === 'beat') {
      row = (shift ? [-16, -8, 8, 16] : [-4, -1, 1, 4]).map((j) => cpad(`j${j}`, j > 0 ? `+${j}` : `${j}`, colors.sync, () => deck.beatJump(j)));
    } else {
      const names: Record<FxType, string> = { echo: 'ECHO', reverb: 'REV', flanger: 'FLNG', filter: 'FILT', crush: 'CRSH' };
      row = [
        cpad('on', fx.on ? t.on : t.off, colors.fx, () => { fx.setOn(!fx.on); engine.emit(); }, fx.on),
        cpad('type', names[fx.type], colors.fx, () => { fx.setType(FX_TYPES[(FX_TYPES.indexOf(fx.type) + 1) % FX_TYPES.length]); engine.emit(); }),
        cpad('beats', fx.beats < 1 ? `${fx.beats}` : `${fx.beats}b`, colors.fx, () => { fx.setBeats(FX_BEATS[(FX_BEATS.indexOf(fx.beats) + 1) % FX_BEATS.length]); engine.emit(); }),
        cpad('mix', `${Math.round(fx.mix * 100)}%`, colors.fx, () => { fx.setMix(fx.mix >= 1 ? 0.25 : fx.mix + 0.25); engine.emit(); }),
      ];
    }
    return (
      <Panel style={[styles.deck, { width, padding: 6, paddingTop: 7, gap: 4 }]} accent={color} screws={false}>
        <Screen style={[styles.header, { paddingVertical: 2, paddingHorizontal: 5 }]}>
          <View style={[styles.badge, { backgroundColor: color, width: 18, height: 18 }]}>
            <Text style={[styles.badgeText, { fontSize: 11 }]}>{deckLetters[index]}</Text>
          </View>
          <Text numberOfLines={1} style={[styles.title, { flex: 1, marginHorizontal: 5 }]}>
            {deck.loading ? t.loading : track ? track.title : t.noTrack}
          </Text>
          <Text style={[styles.key, { color: harmonic ? colors.play : colors.dim, marginRight: 5 }]}>{track?.camelot ?? ''}</Text>
          <Text style={[styles.bpm, mono, { fontSize: 15, color: deck.sync ? colors.sync : colors.text }]}>
            {deck.bpm ? deck.currentBpm.toFixed(1) : '--.-'}
          </Text>
        </Screen>
        <View style={{ flexDirection: mirror ? 'row-reverse' : 'row', alignItems: 'center', gap: 4, height: H }}>
          <View style={{ alignItems: 'center', width: faderW }}>
            <Text style={[styles.tempo, mono, { fontSize: 9, marginBottom: 0, color: Math.abs(tempoPct) < 0.005 ? colors.dim : colors.text }]}>
              {tempoPct >= 0 ? '+' : ''}
              {tempoPct.toFixed(1)}
            </Text>
            <Fader
              testID={`pitch-${index}`}
              value={(1 - deck.pitch) / 2}
              onChange={(v) => engine.setPitch(index, 1 - 2 * v)}
              length={H - 14}
              thickness={faderW - 4}
              color={color}
              center
              defaultValue={0.5}
              ticks={7}
            />
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <JogWheel deck={deck} size={jog} color={color} />
          </View>
          <View style={{ width: colW, height: H, gap: 3 }}>
            <PressButton testID={`cue-${index}`} label={t.cue} color={colors.cue} onPress={() => { engine.resume(); deck.cueDown(); }} onRelease={() => deck.cueUp()} style={{ flex: 1.3, minHeight: 0 }} textSize={12} />
            <PressButton testID={`play-${index}`} label={deck.playing ? '❚❚' : '▶'} color={colors.play} active={deck.playing} onPress={() => engine.togglePlay(index)} style={{ flex: 1.5, minHeight: 0 }} textSize={15} />
            <PressButton label={t.sync} color={colors.sync} active={deck.sync} onPress={() => engine.toggleSync(index)} style={{ flex: 1, minHeight: 0 }} textSize={10} />
            <PressButton label={t.keyLock} color={colors.sync} active={deck.keyLock} onPress={() => deck.setKeyLock(!deck.keyLock)} style={{ flex: 1, minHeight: 0 }} textSize={9} />
            <PressButton label={deck.vinyl ? '◉' : '○'} color={color} active={deck.vinyl} onPress={() => { deck.vinyl = !deck.vinyl; engine.emit(); }} style={{ flex: 1, minHeight: 0 }} textSize={10} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 3, height: 30 }}>
          <PressButton label={tabLabel[tab]} color={color} active onPress={() => setTab(tabs[(tabs.indexOf(tab) + 1) % tabs.length])} style={[styles.cpad, { flex: 1.3 }]} textSize={9} />
          {row}
          <PressButton label="⇧" color={colors.rec} active={shift} onPress={() => setShift(!shift)} style={[styles.cpad, { flex: 0.7 }]} textSize={11} />
        </View>
      </Panel>
    );
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
  cpad: { flex: 1, minHeight: 0, height: 30, borderRadius: 6 },
});
