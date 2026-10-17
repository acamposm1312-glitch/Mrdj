import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEngine } from '../audio/engine';
import { saveAndShareRecording } from '../library/storage';
import { useMidi } from '../midi/midi';
import { useSettings, useT } from '../state/settings';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../ui/components/controls';
import { ScrollingWaveform } from '../ui/components/Waveform';
import { DeckView } from '../ui/DeckView';
import { LibraryPanel } from '../ui/LibraryPanel';
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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [layerL, setLayerL] = useState(false);
  const [layerR, setLayerR] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') useMidi.getState().init().catch(() => {});
  }, []);

  const left = fourDecks && layerL ? 2 : 0;
  const right = fourDecks && layerR ? 3 : 1;
  const W = width - insets.left - insets.right - 12;
  const landscape = width > height && width >= 640;
  const channels = fourDecks && landscape && W >= 1000 ? [2, 0, 1, 3] : [left, right];

  let deckW: number;
  let mixerW: number;
  if (landscape) {
    mixerW = Math.min(channels.length > 2 ? 470 : 330, W * 0.36);
    deckW = (W - mixerW - 12) / 2;
  } else {
    deckW = (W - 6) / 2;
    mixerW = W;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingLeft: insets.left + 6, paddingRight: insets.right + 6 }]}>
      <LinearGradient colors={['#14141f', '#08080d', '#050508']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <Text style={styles.logo}>
          Mr<Text style={{ color: colors.accent }}>Dj</Text>
        </Text>
        {fourDecks && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable onPress={() => setLayerL(!layerL)} style={[styles.hBtn, { borderColor: deckColors[left] }]}>
              <Text style={[styles.hBtnText, { color: deckColors[left] }]}>{layerL ? 'C' : 'A'}↔{layerL ? 'A' : 'C'}</Text>
            </Pressable>
            <Pressable onPress={() => setLayerR(!layerR)} style={[styles.hBtn, { borderColor: deckColors[right] }]}>
              <Text style={[styles.hBtnText, { color: deckColors[right] }]}>{layerR ? 'D' : 'B'}↔{layerR ? 'B' : 'D'}</Text>
            </Pressable>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Pressable testID="view3d" onPress={() => setView3d(!view3d)} style={[styles.hBtn, view3d && { borderColor: colors.accent, backgroundColor: `${colors.accent}33` }]}>
          <Text style={styles.hBtnText}>3D</Text>
        </Pressable>
        <RecButton />
        <Pressable testID="open-library" onPress={() => setLibraryOpen(true)} style={[styles.hBtn, { borderColor: colors.accent }]}>
          <Text style={styles.hBtnText}>♫ {t.library}</Text>
        </Pressable>
        <Pressable testID="open-settings" onPress={() => router.push('/settings')} style={styles.hBtn}>
          <Text style={styles.hBtnText}>⚙</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ gap: 6, paddingBottom: insets.bottom + 10 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 3 }}>
          {[left, right].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.waveLabel, { color: deckColors[i] }]}>{deckLetters[i]}</Text>
              <Screen style={{ flex: 1 }}>
                <ScrollingWaveform deck={engine.decks[i]} color={deckColors[i]} height={landscape ? Math.min(54, Math.max(36, height * 0.08)) : 46} />
              </Screen>
            </View>
          ))}
        </View>

        <View style={view3d ? styles.tilt : undefined}>
        {landscape ? (
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
