import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { AppProvider, useApp } from '@/data/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, primary: colors.neon, border: colors.line },
};

function Routes() {
  const { ready, account } = useApp();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  const signedIn = !!account;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="garage" />
        <Stack.Screen name="premium" />
        <Stack.Screen name="lights" />
        <Stack.Screen name="vehicle/new" />
        <Stack.Screen name="vehicle/[id]/index" />
        <Stack.Screen name="vehicle/[id]/maintenance" />
        <Stack.Screen name="vehicle/[id]/fuel" />
        <Stack.Screen name="vehicle/[id]/rule" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vehicle/[id]/log" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vehicle/[id]/add-fuel" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vehicle/[id]/add-expense" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vehicle/[id]/odometer" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Screen name="legal/kvkk" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <AppProvider>
          <StatusBar style="light" />
          <Routes />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
