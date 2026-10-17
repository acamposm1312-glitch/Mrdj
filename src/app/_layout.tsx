import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { connectCuePersistence } from '../library/library';
import { colors } from '../ui/theme';

export default function RootLayout() {
  useEffect(() => {
    connectCuePersistence();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.panel },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="spotify" />
          <Stack.Screen name="spotify-auth" options={{ headerShown: false }} />
          <Stack.Screen name="drive" />
          <Stack.Screen name="drive-auth" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
