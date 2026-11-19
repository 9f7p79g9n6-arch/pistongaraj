import { DefaultTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { LEGAL_VERSION } from '@piston/core';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { BusinessProvider, useBusiness } from '@/data/business-store';
import { TermsAcceptedContext } from '@/components/terms-gate';
import { AppProvider, repo, useApp } from '@/data/store';
import { usePushSetup } from '@/lib/notifications';
import { openAppLink } from '@/lib/open-link';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.card, text: colors.text, primary: colors.brand, border: colors.line },
};

function Routes() {
  const { ready, account } = useApp();
  // Kullanım koşulları onayı hesap başına kontrol edilir; başka hesaba geçince eski sonuç kullanılmaz
  const accountId = account?.userId ?? null;
  const [terms, setTerms] = useState<{ id: string; ok: boolean } | null>(null);
  const termsOk = accountId && terms?.id === accountId ? terms.ok : null;
  const setTermsOk = (ok: boolean) => { if (accountId) setTerms({ id: accountId, ok }); };
  useEffect(() => {
    let alive = true;
    if (!accountId) return;
    repo.hasConsent('terms', LEGAL_VERSION)
      .then((ok) => { if (alive) setTerms({ id: accountId, ok }); })
      // Bağlantı yoksa kullanıcı kilitlenmesin; onay bir sonraki açılışta yeniden sorulur
      .catch(() => { if (alive) setTerms({ id: accountId, ok: true }); });
    return () => { alive = false; };
  }, [accountId]);
  const biz = useBusiness();
  const signedIn = !!account;
  // Bildirime dokununca ilgili ekran açılır (koşullar onaylanmamışsa koruma onay ekranında tutar)
  usePushSetup(repo, signedIn, (url) => { setTimeout(() => openAppLink(url, biz.setMode), 0); });
  const allReady = ready && (!signedIn || (biz.ready && termsOk !== null));
  const restored = useRef(false);
  const pathname = usePathname();
  useEffect(() => {
    if (allReady) SplashScreen.hideAsync().catch(() => {});
    // Çıkış yapılınca sıfırlanır: yeniden girişte giriş ekranında seçilen mod (Araç sahibi / İşletme) uygulanır
    if (allReady && !signedIn) restored.current = false;
    // Uygulama en son işletme modunda kapatıldıysa ana ekran yerine OTOM SERVİS ile açılır
    // (belirli bir sayfa açılıyorsa, ör. bildirim bağlantısı, ona dokunulmaz)
    if (allReady && signedIn && !restored.current) {
      restored.current = true;
      if (biz.mode === 'business' && (pathname === '/' || pathname === '/sign-in')) setTimeout(() => router.replace('/servis'), 0);
    }
  }, [allReady, signedIn, biz.mode, pathname]);
  if (!allReady) return null;
  const needsTerms = signedIn && termsOk === false;
  return (
    <TermsAcceptedContext.Provider value={() => setTermsOk(true)}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      {/* Koşulları onaylamamış kullanıcı yalnızca onay ekranını ve hukuk metinlerini görür */}
      <Stack.Protected guard={needsTerms}>
        <Stack.Screen name="kosullar-onay" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsTerms}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="garage" />
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
        {/* OTOM SERVİS: işletme modu (kendi navigasyonu) ve müşteri tarafı ekranları */}
        <Stack.Screen name="servis" options={{ animation: 'fade' }} />
        <Stack.Screen name="servis-kayitlarim" />
        <Stack.Screen name="servis-kaydi/[id]" />
        <Stack.Screen name="rehber/[id]" />
        <Stack.Screen name="teklif/yeni" options={{ presentation: 'modal' }} />
        <Stack.Screen name="teklif/[id]" />
        <Stack.Screen name="yonetim" />
        <Stack.Screen name="profil" />
        <Stack.Screen name="bildirimler" />
        <Stack.Screen name="ayarlar" />
        <Stack.Screen name="yardim" />
        <Stack.Screen name="sosyal/yeni" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sosyal/[id]" />
        <Stack.Screen name="sosyal/kisi/[id]" />
        <Stack.Screen name="sosyal/gruplar" />
        <Stack.Screen name="sosyal/grup/[id]" />
      </Stack.Protected>
      <Stack.Screen name="legal/[doc]" />
    </Stack>
    </TermsAcceptedContext.Provider>
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
