import * as AuthSession from 'expo-auth-session';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CLIENT_ID_RE,
  DRIVE_SCOPES,
  DriveAuthError,
  DriveFile,
  findStartFolder,
  GOOGLE_DISCOVERY,
  listFolder,
  useDriveAuth,
} from '../drive/drive';
import { useLibrary } from '../library/library';
import { useT } from '../state/settings';
import { colors } from '../ui/theme';

WebBrowser.maybeCompleteAuthSession();

// Sandboxed hosts (claude.ai pages) block requests to Google.
const SANDBOXED = typeof location !== 'undefined' && /claudeusercontent\.com$|claude\.ai$/.test(location.hostname);

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export default function DriveScreen() {
  const t = useT();
  const auth = useDriveAuth();
  const connected = !!auth.accessToken && Date.now() < auth.expiresAt;
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'mrdj', path: 'drive-auth' });
  const [draftId, setDraftId] = useState(auth.clientId);
  const idValid = CLIENT_ID_RE.test(draftId.trim());
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tracks = useLibrary((s) => s.tracks);
  const progress = useLibrary((s) => s.progress);
  const importFromDrive = useLibrary((s) => s.importFromDrive);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: auth.clientId || 'missing',
      scopes: DRIVE_SCOPES,
      responseType: AuthSession.ResponseType.Token,
      usePKCE: false,
      redirectUri,
      extraParams: { prompt: 'select_account' },
    },
    GOOGLE_DISCOVERY,
  );

  useEffect(() => {
    if (response?.type === 'success' && response.params.access_token) {
      auth.setToken(response.params.access_token, Number(response.params.expires_in ?? 3600));
    } else if (response?.type === 'error') {
      setError(response.params.error_description || response.params.error || t.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError('');
      try {
        await fn();
      } catch (e: any) {
        setError(e instanceof DriveAuthError ? t.driveExpired : String(e?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const open = useCallback(
    (folder: { id: string; name: string }, stack: { id: string; name: string }[]) =>
      run(async () => {
        setFiles(await listFolder(folder.id));
        setPath([...stack, folder]);
      }),
    [run],
  );

  useEffect(() => {
    if (connected && path.length === 0) run(async () => open(await findStartFolder(), []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const inLibrary = useMemo(() => new Set(tracks.map((x) => x.driveFileId).filter(Boolean)), [tracks]);
  const audio = files.filter((f) => !f.isFolder);
  const missing = audio.filter((f) => !inLibrary.has(f.id));

  const add = (list: DriveFile[]) => run(async () => void (await importFromDrive(list)));

  if (Platform.OS !== 'web' || SANDBOXED) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Google Drive' }} />
        <View style={styles.body}>
          <Text style={styles.help}>{t.driveIntro}</Text>
          <Text style={styles.error}>{SANDBOXED ? t.driveSandboxed : t.driveWebOnly}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: path.length ? path[path.length - 1].name : 'Google Drive' }} />
      {!connected ? (
        <View style={styles.body}>
          <Text style={styles.help}>{t.driveIntro}</Text>
          <Text style={styles.label}>{t.driveClientId}</Text>
          <TextInput
            value={draftId}
            onChangeText={setDraftId}
            onBlur={() => auth.setClientId(draftId)}
            placeholder="123456-abc.apps.googleusercontent.com"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          {!!draftId && !idValid && <Text style={styles.error}>{t.driveBadId}</Text>}
          <Text style={styles.help}>
            {t.driveClientIdHelp}
            {'\n'}
            <Text style={{ color: colors.text }} selectable>
              {typeof location !== 'undefined' ? location.origin : ''}
            </Text>
            {'\n'}
            {t.driveRedirect}{' '}
            <Text style={{ color: colors.text }} selectable>
              {redirectUri}
            </Text>
          </Text>
          <Pressable
            testID="drive-connect"
            disabled={!idValid || !request}
            onPress={() => {
              auth.setClientId(draftId);
              promptAsync();
            }}
            style={[styles.google, (!idValid || !request) && { opacity: 0.4 }]}
          >
            <Text style={styles.googleText}>{t.driveConnect}</Text>
          </Pressable>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.body}
          data={files}
          keyExtractor={(f) => f.id}
          ListHeaderComponent={
            <View style={{ gap: 8, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.help, { flex: 1 }]} numberOfLines={1}>
                  ✓ {t.connected} · {path.map((p) => p.name).join(' / ')}
                </Text>
                <Pressable onPress={auth.clear}>
                  <Text style={[styles.help, { color: colors.rec }]}>{t.disconnect}</Text>
                </Pressable>
              </View>
              {path.length > 1 && (
                <Pressable onPress={() => open(path[path.length - 2], path.slice(0, -2))}>
                  <Text style={[styles.help, { color: colors.accent }]}>‹ {path[path.length - 2].name}</Text>
                </Pressable>
              )}
              {missing.length > 0 && (
                <Pressable testID="drive-add-all" disabled={!!progress} onPress={() => add(missing)} style={styles.button}>
                  <Text style={styles.buttonText}>
                    ＋ {t.driveAddAll} ({missing.length})
                  </Text>
                </Pressable>
              )}
              {progress && (
                <Text style={styles.help} numberOfLines={1}>
                  {t.analyzing} {progress.done + 1}/{progress.total} · {progress.current}
                </Text>
              )}
              {busy && !progress && <ActivityIndicator color={colors.accent} />}
              {!!error && <Text style={styles.error}>{error}</Text>}
              {!busy && files.length === 0 && <Text style={styles.help}>{t.driveEmpty}</Text>}
            </View>
          }
          renderItem={({ item }) =>
            item.isFolder ? (
              <Pressable onPress={() => open(item, path)} style={styles.row}>
                <Text style={styles.icon}>📁</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>›</Text>
              </Pressable>
            ) : (
              <View style={styles.row}>
                <Text style={styles.icon}>♫</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta}>{mb(item.size)}</Text>
                </View>
                {inLibrary.has(item.id) ? (
                  <Text style={[styles.meta, { color: colors.play }]}>✓ {t.inLibrary}</Text>
                ) : (
                  <Pressable disabled={!!progress} onPress={() => add([item])} style={styles.add}>
                    <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>＋ {t.driveAdd}</Text>
                  </Pressable>
                )}
              </View>
            )
          }
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
  google: { backgroundColor: '#ffffff', borderRadius: 24, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  googleText: { color: '#1f1f1f', fontWeight: '800' },
  error: { color: colors.rec, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.panel3 },
  icon: { color: colors.dim, fontSize: 16, width: 22, textAlign: 'center' },
  title: { color: colors.text, fontWeight: '700', flexShrink: 1, flex: 1 },
  meta: { color: colors.dim, fontSize: 11 },
  add: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  buttonText: { color: colors.text, fontWeight: '800' },
});
