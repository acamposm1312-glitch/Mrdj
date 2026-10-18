import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isHarmonic } from '../audio/analysis';
import { getEngine, useEngine } from '../audio/engine';
import { DEMO_TRACKS, useLibrary } from '../library/library';
import type { Track } from '../library/types';
import { matchTrack } from '../spotify/spotify';
import { useSettings, useT } from '../state/settings';
import { router } from 'expo-router';
import { formatTime } from './components/JogWheel';
import { colors, deckColors, deckLetters, mono } from './theme';

interface Row {
  key: string;
  track?: Track;
  title: string;
  artist: string;
  spotifyId?: string;
}

export function LibraryPanel({ visible, onClose, decks }: { visible: boolean; onClose: () => void; decks: number[] }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const engine = useEngine();
  const { tracks, crates, progress, pickAndImport, removeTrack } = useLibrary();
  const fourDecks = useSettings((s) => s.fourDecks);
  const [query, setQuery] = useState('');
  const [crateId, setCrateId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const loadTargets = fourDecks ? [0, 1, 2, 3] : decks;
  // demos added in an app update show up as a one-tap import
  const missingDemos = useMemo(() => {
    const have = new Set(tracks.map((x) => x.fileName));
    return DEMO_TRACKS.filter((n) => !have.has(n)).length;
  }, [tracks]);

  // the camelot key of whatever is playing guides harmonic suggestions
  const playingKey = engine.decks.find((d) => d.playing && d.track)?.track?.camelot ?? '';

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list: Row[];
    const crate = crates.find((c) => c.id === crateId);
    if (crate) {
      list = crate.entries.map((e, i) => {
        const tr =
          (e.trackId && tracks.find((x) => x.id === e.trackId)) ||
          matchTrack({ id: e.spotifyId ?? '', name: e.title, artists: e.artist, durationMs: 0 }, tracks);
        return { key: `${crate.id}-${i}`, track: tr || undefined, title: e.title, artist: e.artist, spotifyId: e.spotifyId };
      });
    } else {
      list = tracks.map((tr) => ({ key: tr.id, track: tr, title: tr.title, artist: tr.artist }));
    }
    if (!q) return list;
    return list.filter((r) => {
      const tr = r.track;
      return (
        r.title.toLowerCase().includes(q) ||
        r.artist.toLowerCase().includes(q) ||
        (tr && (String(Math.round(tr.bpm)).startsWith(q) || tr.camelot.toLowerCase() === q || tr.key.toLowerCase() === q))
      );
    });
  }, [tracks, crates, crateId, query]);

  const load = async (deck: number, track: Track) => {
    setLoadError('');
    try {
      await getEngine().load(deck, track);
      onClose();
    } catch (e: any) {
      setLoadError(e?.message === 'drive-auth' ? t.driveExpired : String(e?.message ?? e));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.head}>
            <Text style={styles.h1}>{t.library}</Text>
            <Text style={styles.count}>{tracks.length}</Text>
            <View style={{ flex: 1 }} />
            <Pressable
              testID="library-drive"
              style={[styles.btn, { backgroundColor: '#ffffff' }]}
              onPress={() => {
                onClose();
                router.push('/drive');
              }}
            >
              <Text style={[styles.btnText, { color: '#1f1f1f' }]}>☁ Drive</Text>
            </Pressable>
            <Pressable testID="import" style={[styles.btn, { backgroundColor: colors.accent }]} onPress={() => pickAndImport()}>
              <Text style={styles.btnText}>＋ {t.import}</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={onClose}>
              <Text style={styles.btnText}>✕</Text>
            </Pressable>
          </View>

          {progress && (
            <View style={styles.progress}>
              <Text style={styles.progressText} numberOfLines={1}>
                {t.analyzing} {progress.done + 1}/{progress.total} · {progress.current}
              </Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }]} />
              </View>
            </View>
          )}

          {tracks.length > 0 && missingDemos > 0 && !progress && (
            <Pressable testID="import-more-demo" onPress={() => useLibrary.getState().importDemo()} style={[styles.btn, { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.accent }]}>
              <Text style={styles.btnText}>🎵 {t.moreDemos.replace('{n}', String(missingDemos))}</Text>
            </Pressable>
          )}

          {!!loadError && <Text style={{ color: colors.rec, fontSize: 12 }}>{loadError}</Text>}

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.search}
            placeholderTextColor={colors.faint}
            style={styles.search}
          />

          <View style={styles.chips}>
            {[{ id: null as string | null, name: t.allTracks }, ...crates.map((c) => ({ id: c.id, name: c.name }))].map((c) => (
              <Pressable
                key={c.id ?? 'all'}
                onPress={() => setCrateId(c.id)}
                style={[styles.chip, crateId === c.id && { borderColor: colors.accent, backgroundColor: `${colors.accent}33` }]}
              >
                <Text style={styles.chipText} numberOfLines={1}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <FlatList
            data={rows}
            keyExtractor={(r) => r.key}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', gap: 12 }}>
                <Text style={styles.empty}>{t.emptyLibrary}</Text>
                {!crateId && (
                  <Pressable testID="import-demo" disabled={!!progress} onPress={() => useLibrary.getState().importDemo()} style={[styles.btn, { backgroundColor: colors.accent }]}>
                    <Text style={styles.btnText}>🎵 {t.loadDemo}</Text>
                  </Pressable>
                )}
              </View>
            }
            renderItem={({ item }) => {
              const tr = item.track;
              const harmonic = !!tr && isHarmonic(playingKey, tr.camelot);
              return (
                <View style={[styles.row, !tr && { opacity: 0.55 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>
                      {tr?.driveFileId ? (tr.cached ? '☁✓ ' : '☁ ') : ''}
                      {item.title}
                    </Text>
                    <Text style={styles.artist} numberOfLines={1}>
                      {item.artist || ' '}
                      {!tr ? ` · ${t.missing}` : ''}
                    </Text>
                  </View>
                  {tr && (
                    <>
                      <Text style={[styles.meta, mono, { width: 44 }]}>{tr.analyzed ? tr.bpm.toFixed(1) : '…'}</Text>
                      <Text style={[styles.meta, { width: 30, color: harmonic ? colors.play : colors.dim }]}>{tr.camelot}</Text>
                      <Text style={[styles.meta, mono, { width: 40 }]}>{formatTime(tr.duration).slice(0, -2)}</Text>
                      {loadTargets.map((d) => (
                        <Pressable
                          key={d}
                          testID={`load-${d}-${tr.id}`}
                          onPress={() => load(d, tr)}
                          style={[styles.load, { borderColor: deckColors[d] }]}
                        >
                          <Text style={[styles.loadText, { color: deckColors[d] }]}>{deckLetters[d]}</Text>
                        </Pressable>
                      ))}
                      {!crateId &&
                        (confirm === tr.id ? (
                          <Pressable
                            onPress={() => {
                              setConfirm(null);
                              removeTrack(tr.id);
                            }}
                            style={[styles.load, { borderColor: colors.rec, width: 54 }]}
                          >
                            <Text style={[styles.loadText, { color: colors.rec, fontSize: 9 }]}>{t.delete}</Text>
                          </Pressable>
                        ) : (
                          <Pressable onPress={() => setConfirm(tr.id)} style={styles.del}>
                            <Text style={{ color: colors.faint }}>🗑</Text>
                          </Pressable>
                        ))}
                    </>
                  )}
                  {!tr && item.spotifyId && (
                    <Pressable onPress={() => useLibrary.getState().pickAndImport({ spotifyId: item.spotifyId })} style={[styles.load, { width: 90, borderColor: colors.accent }]}>
                      <Text style={[styles.loadText, { color: colors.accent, fontSize: 10 }]}>{t.linkFile}</Text>
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: {
    height: '78%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h1: { color: colors.text, fontSize: 20, fontWeight: '900' },
  count: { color: colors.dim, fontSize: 12, marginTop: 4 },
  btn: { backgroundColor: colors.panel3, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  progress: { gap: 4 },
  progressText: { color: colors.dim, fontSize: 11 },
  bar: { height: 4, backgroundColor: colors.panel3, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: colors.accent },
  search: {
    backgroundColor: colors.panel2,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 180 },
  chipText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  empty: { color: colors.dim, textAlign: 'center', marginTop: 40, paddingHorizontal: 30, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.panel3,
  },
  title: { color: colors.text, fontWeight: '700', fontSize: 13 },
  artist: { color: colors.dim, fontSize: 11 },
  meta: { color: colors.dim, fontSize: 11, textAlign: 'right' },
  load: { width: 30, height: 30, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  loadText: { fontWeight: '900', fontSize: 13 },
  del: { width: 26, alignItems: 'center' },
});
