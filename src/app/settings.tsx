import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEngine } from '../audio/engine';
import { pairBluetoothMidi, useMidi } from '../midi/midi';
import { buildTargets } from '../midi/targets';
import { Lang, useSettings, useT } from '../state/settings';
import { colors } from '../ui/theme';

function Segmented<T extends string | boolean>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map(([v, label]) => (
        <Pressable key={String(v)} onPress={() => onChange(v)} style={[styles.segItem, value === v && styles.segActive]}>
          <Text style={[styles.segText, value === v && { color: colors.text }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function Settings() {
  const t = useT();
  const engine = useEngine();
  const { lang, setLang, fourDecks, setFourDecks } = useSettings();
  const midi = useMidi();
  const targets = useMemo(() => (midi.supported ? buildTargets() : []), [midi.supported]);
  const mappedIds = new Set(Object.values(midi.mappings));

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: t.settings }} />

      <Text style={styles.h2}>{t.language}</Text>
      <Segmented<Lang> value={lang} onChange={setLang} options={[['es', 'Español'], ['en', 'English']]} />

      <Text style={styles.h2}>{t.decks}</Text>
      <Segmented<boolean> value={fourDecks} onChange={setFourDecks} options={[[false, t.twoDecks], [true, t.fourDecks]]} />

      <Text style={styles.h2}>{t.xfCurve}</Text>
      <Segmented value={engine.xfCurve} onChange={(v) => engine.setXfCurve(v)} options={[['smooth', t.smooth], ['sharp', t.sharp]]} />

      <Text style={styles.h2}>{t.headphones}</Text>
      <Segmented<boolean> value={engine.splitCue} onChange={(v) => engine.setSplitCue(v)} options={[[false, t.off], [true, t.splitCue]]} />
      <Text style={styles.help}>{t.splitCueHelp}</Text>

      <Text style={styles.h2}>{t.spotify}</Text>
      <Text style={styles.help}>{t.spotifyIntro}</Text>
      <Pressable testID="open-spotify" style={[styles.button, { backgroundColor: '#1DB954' }]} onPress={() => router.push('/spotify')}>
        <Text style={[styles.buttonText, { color: '#04140a' }]}>{t.playlists} →</Text>
      </Pressable>

      <Text style={styles.h2}>{t.midi}</Text>
      {!midi.supported ? (
        <Text style={styles.help}>{t.midiUnavailable}</Text>
      ) : (
        <>
          <Text style={styles.help}>
            {t.midiDevices}: {midi.devices.length ? midi.devices.join(', ') : t.none}
          </Text>
          <Text style={styles.help}>{t.midiLearnHelp}</Text>
          <View style={styles.midiGrid}>
            {targets.map((tg) => (
              <Pressable
                key={tg.id}
                onPress={() => midi.learn(midi.learning === tg.id ? null : tg.id)}
                style={[
                  styles.midiItem,
                  mappedIds.has(tg.id) && { borderColor: colors.play },
                  midi.learning === tg.id && { borderColor: colors.cue, backgroundColor: `${colors.cue}33` },
                ]}
              >
                <Text style={styles.midiText}>{tg.label}</Text>
              </Pressable>
            ))}
          </View>
          {midi.bluetoothPairing && (
            <Pressable style={styles.button} onPress={() => pairBluetoothMidi()}>
              <Text style={styles.buttonText}>{t.midiBluetooth}</Text>
            </Pressable>
          )}
          <Pressable style={styles.button} onPress={midi.clear}>
            <Text style={styles.buttonText}>Reset MIDI</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.h2}>{t.about}</Text>
      <Text style={styles.help}>
        MrDj · {t.version} {Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8, maxWidth: 720, width: '100%', alignSelf: 'center' },
  h2: { color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 14 },
  help: { color: colors.dim, fontSize: 12, lineHeight: 18 },
  seg: { flexDirection: 'row', backgroundColor: colors.panel2, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segActive: { backgroundColor: colors.accent },
  segText: { color: colors.dim, fontWeight: '700', fontSize: 13 },
  button: { backgroundColor: colors.panel3, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: colors.text, fontWeight: '800' },
  midiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  midiItem: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  midiText: { color: colors.text, fontSize: 11 },
});
