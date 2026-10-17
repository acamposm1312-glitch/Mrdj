import * as AuthSession from 'expo-auth-session';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getEngine } from '../audio/engine';
import { useLibrary } from '../library/library';
import {
  getLikedTracks,
  getPlaylists,
  getPlaylistTracks,
  matchTrack,
  SPOTIFY_DISCOVERY,
  SPOTIFY_SCOPES,
  SpotifyPlaylist,
  SpotifyTrack,
  useSpotifyAuth,
} from '../spotify/spotify';
import { useSettings, useT } from '../state/settings';
import { colors, deckColors, deckLetters } from '../ui/theme';

WebBrowser.maybeCompleteAuthSession();

const LIKED = '__liked__';
const CLIENT_ID_RE = /^[0-9a-f]{32}$/i;
// Sandboxed hosts (claude.ai pages) block requests to Spotify and change the redirect URL.
const SANDBOXED = typeof location !== 'undefined' && /claudeusercontent\.com$|claude\.ai$/.test(location.hostname);

export default function SpotifyScreen() {
  const t = useT();
  const { spotifyClientId, setSpotifyClientId, fourDecks } = useSettings();
  const auth = useSpotifyAuth();
  const connected = !!auth.refreshToken || (!!auth.accessToken && Date.now() < auth.expiresAt);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'mrdj', path: 'spotify-auth' });
  const [draftId, setDraftId] = useState(spotifyClientId);
  const idValid = CLIENT_ID_RE.test(draftId.trim());
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const [items, setItems] = useState<SpotifyTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tracks = useLibrary((s) => s.tracks);
  const saveCrate = useLibrary((s) => s.saveCrate);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: spotifyClientId || 'missing',
      scopes: SPOTIFY_SCOPES,
      usePKCE: true,
      redirectUri,
    },
    SPOTIFY_DISCOVERY,
  );

  useEffect(() => {
    if (response?.type !== 'success' || !request?.codeVerifier) return;
    AuthSession.exchangeCodeAsync(
      {
        clientId: spotifyClientId,
        code: response.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier },
      },
      SPOTIFY_DISCOVERY,
    )
      .then((tok) =>
        auth.setTokens({ accessToken: tok.accessToken, refreshToken: tok.refreshToken, expiresIn: tok.expiresIn ?? 3600 }),
      )
      .catch((e) => setError(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (connected && spotifyClientId) run(async () => setPlaylists(await getPlaylists(spotifyClientId)));
  }, [connected, spotifyClientId, run]);

  const openList = (id: string, name: string) =>
    run(async () => {
      setOpen({ id, name });
      setItems([]);
      setItems(id === LIKED ? await getLikedTracks(spotifyClientId) : await getPlaylistTracks(spotifyClientId, id));
    });

  const matched = useMemo(() => items.map((it) => ({ it, track: matchTrack(it, tracks) })), [items, tracks]);
  const found = matched.filter((m) => m.track).length;

  const saveAsCrate = () => {
    if (!open) return;
    saveCrate({
      id: `sp-${open.id}`,
      name: open.name,
      source: 'spotify',
      entries: matched.map(({ it, track }) => ({ title: it.name, artist: it.artists, spotifyId: it.id, trackId: track?.id })),
    });
  };

  const decks = fourDecks ? [0, 1, 2, 3] : [0, 1];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: open ? open.name : 'Spotify' }} />
      {!connected ? (
        <View style={styles.body}>
          <Text style={styles.help}>{t.spotifyIntro}</Text>
          <Text style={styles.label}>{t.spotifyClientId}</Text>
          <TextInput
            value={draftId}
            onChangeText={setDraftId}
            onBlur={() => setSpotifyClientId(draftId)}
            placeholder="a1b2c3…"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={styles.help}>
            {t.spotifyClientIdHelp} <Text style={{ color: colors.text }} selectable>{redirectUri}</Text>
          </Text>
          {!!draftId && !idValid && <Text style={styles.error}>{t.spotifyBadId}</Text>}
          {SANDBOXED && <Text style={styles.error}>{t.spotifySandboxed}</Text>}
          <Pressable
            disabled={!idValid || !request || SANDBOXED}
            onPress={() => {
              setSpotifyClientId(draftId);
              promptAsync();
            }}
            style={[styles.green, (!idValid || !request || SANDBOXED) && { opacity: 0.4 }]}
          >
            <Text style={styles.greenText}>{t.connect}</Text>
          </Pressable>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      ) : !open ? (
        <FlatList
          contentContainerStyle={styles.body}
          data={[{ id: LIKED, name: t.likedSongs, total: 0 } as SpotifyPlaylist, ...playlists]}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.help, { flex: 1 }]}>✓ {t.connected}</Text>
              <Pressable onPress={auth.clear}>
                <Text style={[styles.help, { color: colors.rec }]}>{t.disconnect}</Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={
            <>
              {busy && <ActivityIndicator color={colors.accent} />}
              {!!error && <Text style={styles.error}>{error}</Text>}
            </>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => openList(item.id, item.name)} style={styles.row}>
              <Text style={styles.title} numberOfLines={1}>
                {item.name}
              </Text>
              {item.total > 0 && <Text style={styles.meta}>{item.total}</Text>}
              <Text style={styles.meta}>›</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.body}
          data={matched}
          keyExtractor={(m, i) => `${m.it.id}-${i}`}
          ListHeaderComponent={
            <View style={{ gap: 8, marginBottom: 8 }}>
              <Pressable onPress={() => setOpen(null)}>
                <Text style={[styles.help, { color: colors.accent }]}>‹ {t.playlists}</Text>
              </Pressable>
              <Text style={styles.help}>
                {t.inLibrary}: {found}/{matched.length}
              </Text>
              <Pressable onPress={saveAsCrate} style={styles.button}>
                <Text style={styles.buttonText}>{t.saveAsCrate}</Text>
              </Pressable>
              {busy && <ActivityIndicator color={colors.accent} />}
              {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item: { it, track } }) => (
            <View style={[styles.row, !track && { opacity: 0.7 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {it.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {it.artists} · {track ? `✓ ${t.inLibrary}` : t.missing}
                </Text>
              </View>
              {track ? (
                decks.map((d) => (
                  <Pressable key={d} onPress={() => getEngine().load(d, track)} style={[styles.load, { borderColor: deckColors[d] }]}>
                    <Text style={{ color: deckColors[d], fontWeight: '900' }}>{deckLetters[d]}</Text>
                  </Pressable>
                ))
              ) : (
                <Pressable onPress={() => useLibrary.getState().pickAndImport({ spotifyId: it.id })} style={[styles.load, { width: 96, borderColor: colors.accent }]}>
                  <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 11 }}>{t.linkFile}</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 8, maxWidth: 760, width: '100%', alignSelf: 'center' },
  help: { color: colors.dim, fontSize: 12, lineHeight: 18 },
  label: { color: colors.text, fontWeight: '700', marginTop: 8 },
  input: { backgroundColor: colors.panel2, color: colors.text, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border },
  green: { backgroundColor: '#1DB954', borderRadius: 24, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  greenText: { color: '#04140a', fontWeight: '900' },
  error: { color: colors.rec, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.panel3 },
  title: { color: colors.text, fontWeight: '700', flexShrink: 1 },
  meta: { color: colors.dim, fontSize: 11 },
  load: { width: 32, height: 32, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  button: { backgroundColor: colors.panel3, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: colors.text, fontWeight: '800' },
});
