import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEngine } from '../audio/engine';
import { saveAndShareRecording } from '../library/storage';
import { initMidi } from '../midi/midi';
import { useSettings, useT } from '../state/settings';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../ui/components/controls';
import { ScrollingWaveform } from '../ui/components/Waveform';
import { ClassicDeck } from '../ui/ClassicDeck';
import { DeckView } from '../ui/DeckView';
import { LibraryPanel } from '../ui/LibraryPanel';
import { useKeyboardShortcuts } from '../ui/keyboard';
import { MixerView } from '../ui/MixerView';
import { colors, deckColors, deckLetters } from '../ui/theme';

function RecButton() {
  const engine = useEngine();
  const t = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!engine.recording) return;
    const id = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [engine.recording]);
  const elapsed = engine.recording ? Math.floor((Date.now() - engine.recordStartedAt) / 1000) : 0;
  const toggle = async () => {
    if (!engine.recording) {
      engine.startRecording();
      return;
    }
    const res = await engine.stopRecording();
    if (!res) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    await saveAndShareRecording(`MrDj-${stamp}.${res.ext}`, res.data, res.mime);
  };
  return (
    <Pressable testID="rec" onPress={toggle} style={[styles.hBtn, engine.recording && { borderColor: colors.rec, backgroundColor: `${colors.rec}33` }]}>
      <View style={[styles.recDot, { opacity: engine.recording && elapsed % 2 ? 0.3 : 1 }]} />
      <Text style={styles.hBtnText}>
        {engine.recording ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : 'REC'}
      </Text>
    </Pressable>
  );
}

export default function Console() {
  useKeepAwake();
  const engine = useEngine();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const fourDecks = useSettings((s) => s.fourDecks);
  const view3d = useSettings((s) => s.view3d);
  const setView3d = useSettings((s) => s.setView3d);
  const layout = useSettings((s) => s.layout);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [layerL, setLayerL] = useState(false);
  const [layerR, setLayerR] = useState(false);

  useEffect(() => {
    initMidi().catch(() => {});
  }, []);

  const left = fourDecks && layerL ? 2 : 0;
  const right = fourDecks && layerR ? 3 : 1;
  useKeyboardShortcuts(left, right);
  const W = width - insets.left - insets.right - 12;
  const landscape = width > height && width >= 640;
  // phones held sideways: fit the whole console on one screen
  const compact = landscape && height < 520;
  const channels = fourDecks && landscape && !compact && W >= 1000 ? [2, 0, 1, 3] : [left, right];
  const headerH = compact ? 34 : 44;
  const waveH = compact ? 22 : landscape ? Math.min(54, Math.max(36, height * 0.08)) : 46;
  // height left for the decks row when everything must fit on one screen
  const bodyH = height - insets.top - insets.bottom - headerH - (waveH * 2 + 3) - 14;

  let deckW: number;
  let mixerW: number;
  if (compact) {
    mixerW = Math.min(240, Math.max(224, W * 0.3));
    deckW = (W - mixerW - 8) / 2;
  } else if (landscape) {
    mixerW = Math.min(channels.length > 2 ? 470 : 330, W * 0.36);
    deckW = (W - mixerW - 12) / 2;
  } else {
    deckW = (W - 6) / 2;
    mixerW = W;
  }

  const layerButtons = fourDecks && (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      <Pressable onPress={() => setLayerL(!layerL)} style={[styles.hBtn, { borderColor: deckColors[left] }]}>
        <Text style={[styles.hBtnText, { color: deckColors[left] }]}>{layerL ? 'C' : 'A'}↔{layerL ? 'A' : 'C'}</Text>
      </Pressable>
      <Pressable onPress={() => setLayerR(!layerR)} style={[styles.hBtn, { borderColor: deckColors[right] }]}>
        <Text style={[styles.hBtnText, { color: deckColors[right] }]}>{layerR ? 'D' : 'B'}↔{layerR ? 'B' : 'D'}</Text>
      </Pressable>
    </View>
  );

  const waves = (h: number) => (
    <View style={{ gap: 2 }}>
      {[left, right].map((i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.waveLabel, { color: deckColors[i] }]}>{deckLetters[i]}</Text>
          <Screen style={{ flex: 1 }}>
            <ScrollingWaveform deck={engine.decks[i]} color={deckColors[i]} height={h} />
          </Screen>
        </View>
      ))}
    </View>
  );

  if (landscape && layout === 'classic') {
    // classic DJ-app layout: platters at the sides, mixer and app buttons in the middle
    const wh = compact ? 20 : Math.min(48, Math.max(30, height * 0.055));
    // the waveform screens add a few px of bezel each
    const h = height - insets.top - insets.bottom - (wh * 2 + 2) - 4 - 6 - 12;
    const mixW = compact ? Math.min(240, Math.max(224, W * 0.3)) : Math.min(channels.length > 2 ? 470 : 340, W * 0.3);
    const dW = (W - mixW - 8) / 2;
    const barH = compact ? 28 : 34;
    return (
      <View style={[styles.root, { paddingTop: insets.top + 2, paddingBottom: insets.bottom + 4, paddingLeft: insets.left + 6, paddingRight: insets.right + 6, gap: 4 }]}>
        <LinearGradient colors={['#14141f', '#08080d', '#050508']} style={StyleSheet.absoluteFill} />
        {waves(wh)}
        <View style={[styles.rowTop, { gap: 4, height: h }]}>
          <ClassicDeck index={left} otherIndex={right} width={dW} height={h} />
          <View style={{ width: mixW, gap: 4 }}>
            <View style={[styles.header, { height: barH, paddingVertical: 0, gap: 4, justifyContent: 'center' }]}>
              {!fourDecks && (
                <Text style={[styles.logo, { fontSize: compact ? 17 : 22, marginRight: 2 }]}>
                  Mr<Text style={{ color: colors.accent }}>Dj</Text>
                </Text>
              )}
              {layerButtons}
              <RecButton />
              <Pressable testID="open-library" onPress={() => setLibraryOpen(true)} style={[styles.hBtn, { borderColor: colors.accent, paddingHorizontal: 8 }]}>
                <Text style={styles.hBtnText}>♫</Text>
              </Pressable>
              <Pressable testID="open-settings" onPress={() => router.push('/settings')} style={[styles.hBtn, { paddingHorizontal: 8 }]}>
                <Text style={styles.hBtnText}>⚙</Text>
              </Pressable>
            </View>
            {compact ? (
              <MixerView channels={channels} width={mixW} compact height={h - barH - 4} sampler />
            ) : (
              <MixerView channels={channels} width={mixW} faderLen={Math.max(70, Math.min(260, h - barH - 470))} sampler />
            )}
          </View>
          <ClassicDeck index={right} otherIndex={left} width={dW} height={h} mirror />
        </View>
        <LibraryPanel visible={libraryOpen} onClose={() => setLibraryOpen(false)} decks={[left, right]} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingLeft: insets.left + 6, paddingRight: insets.right + 6 }]}>
      <LinearGradient colors={['#14141f', '#08080d', '#050508']} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, compact && { paddingVertical: 2, height: headerH }]}>
        <Text style={[styles.logo, compact && { fontSize: 18 }]}>
          Mr<Text style={{ color: colors.accent }}>Dj</Text>
        </Text>
        {layerButtons}
        <View style={{ flex: 1 }} />
        <Pressable testID="view3d" onPress={() => setView3d(!view3d)} style={[styles.hBtn, view3d && { borderColor: colors.accent, backgroundColor: `${colors.accent}33` }]}>
          <Text style={styles.hBtnText}>3D</Text>
        </Pressable>
        <RecButton />
        <Pressable testID="open-library" onPress={() => setLibraryOpen(true)} style={[styles.hBtn, { borderColor: colors.accent }]}>
          <Text style={styles.hBtnText}>♫{compact ? '' : ` ${t.library}`}</Text>
        </Pressable>
        <Pressable testID="open-settings" onPress={() => router.push('/settings')} style={styles.hBtn}>
          <Text style={styles.hBtnText}>⚙</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ gap: compact ? 4 : 6, paddingBottom: insets.bottom + (compact ? 2 : 10) }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!compact}
      >
        {waves(waveH)}

        <View style={view3d && !compact ? styles.tilt : undefined}>
        {compact ? (
          <View style={[styles.rowTop, { gap: 4 }]}>
            <DeckView index={left} otherIndex={right} width={deckW} compact height={bodyH} />
            <MixerView channels={channels} width={mixerW} compact height={bodyH} />
            <DeckView index={right} otherIndex={left} width={deckW} mirror compact height={bodyH} />
          </View>
        ) : landscape ? (
          <View style={styles.rowTop}>
            <DeckView index={left} otherIndex={right} width={deckW} maxJog={Math.max(120, height * 0.42)} />
            <MixerView channels={channels} width={mixerW} faderLen={Math.max(90, Math.min(150, height - 520))} />
            <DeckView index={right} otherIndex={left} width={deckW} mirror maxJog={Math.max(120, height * 0.42)} />
          </View>
        ) : (
          <>
            <View style={styles.rowTop}>
              <DeckView index={left} otherIndex={right} width={deckW} />
              <DeckView index={right} otherIndex={left} width={deckW} mirror />
            </View>
            <MixerView channels={channels} width={mixerW} />
          </>
        )}
        </View>
      </ScrollView>

      <LibraryPanel visible={libraryOpen} onClose={() => setLibraryOpen(false)} decks={[left, right]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  logo: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.5,
    marginRight: 6,
    textShadowColor: colors.accent,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  tilt: {
    transform: [{ perspective: 1600 }, { rotateX: '14deg' }, { scale: 0.88 }],
    transformOrigin: 'center top',
  },
  hBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel2,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 32,
  },
  hBtnText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.rec },
  waveLabel: { fontWeight: '900', fontSize: 12, width: 12 },
  rowTop: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', justifyContent: 'center' },
});
