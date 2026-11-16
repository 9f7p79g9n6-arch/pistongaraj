import { DefaultTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { BusinessProvider, useBusiness } from '@/data/business-store';
import { AppProvider, useApp } from '@/data/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.card, text: colors.text, primary: colors.brand, border: colors.line },
};

function Routes() {
  const { ready, account } = useApp();
  const biz = useBusiness();
  const signedIn = !!account;
  const allReady = ready && (!signedIn || biz.ready);
  const restored = useRef(false);
  const pathname = usePathname();
  useEffect(() => {
    if (allReady) SplashScreen.hideAsync().catch(() => {});
    // Çıkış yapılınca sıfırlanır: yeniden girişte giriş ekranında seçilen mod (Araç sahibi / İşletme) uygulanır
    if (allReady && !signedIn) restored.current = false;
    // Uygulama en son işletme modunda kapatıldıysa ana ekran yerine PISTON SERVİS ile açılır
    // (belirli bir sayfa açılıyorsa, ör. bildirim bağlantısı, ona dokunulmaz)
    if (allReady && signedIn && !restored.current) {
      restored.current = true;
      if (biz.mode === 'business' && (pathname === '/' || pathname === '/sign-in')) setTimeout(() => router.replace('/servis'), 0);
    }
  }, [allReady, signedIn, biz.mode, pathname]);
  if (!allReady) return null;
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
        <Stack.Screen name="accident" />
        <Stack.Screen name="vehicle/[id]/fines" />
        <Stack.Screen name="vehicle/[id]/inspection" />
        <Stack.Screen name="vehicle/new" />
        <Stack.Screen name="vehicle/[id]/index" />
        <Stack.Screen name="vehicle/[id]/maintenance" />
        <Stack.Screen name="vehicle/[id]/fuel" />
        <Stack.Screen name="vehicle/[id]/rule" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vehicle/[id]/log" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vehicle/[id]/add-fuel" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vehicle/[id]/add-expense" options={{ presentation: 'modal' }} />
        <Stack.Screen name="vehicle/[id]/odometer" options={{ presentation: 'modal' }} />
        {/* PISTON SERVİS: işletme modu (kendi navigasyonu) ve müşteri tarafı ekranları */}
        <Stack.Screen name="servis" options={{ animation: 'fade' }} />
        <Stack.Screen name="servis-kayitlarim" />
        <Stack.Screen name="servis-kaydi/[id]" />
        <Stack.Screen name="forum" />
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
          <BusinessProvider>
            <StatusBar style="dark" />
            <Routes />
          </BusinessProvider>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
