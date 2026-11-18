/**
 * OTOM SERVİS: işletme modu. Kendi navigasyonu ve kırmızı vurgu rengi var; bireysel ekranlardan ayrıdır.
 * İşletmesi olmayan kullanıcı yalnızca "İşletme hesabı aç" ekranını görür.
 */
import { Stack } from 'expo-router';

import { AccentProvider } from '@/components/ui';
import { ACCENT_SERVIS, colors } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';

export default function ServisLayout() {
  const { businesses } = useBusiness();
  const has = businesses.length > 0;
  return (
    <AccentProvider value={ACCENT_SERVIS}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={has}>
          <Stack.Screen name="(sekmeler)" />
          <Stack.Screen name="yeni-kayit" />
          <Stack.Screen name="kayit/[id]" />
          <Stack.Screen name="musteri-ekle" options={{ presentation: 'modal' }} />
          <Stack.Screen name="musteri/[id]" />
          <Stack.Screen name="arac-ekle" options={{ presentation: 'modal' }} />
          <Stack.Screen name="arac/[id]" />
          <Stack.Screen name="profil" />
          <Stack.Screen name="borclular" />
          <Stack.Screen name="musteriler" />
          <Stack.Screen name="araclar" />
          <Stack.Screen name="forum/yeni" options={{ presentation: 'modal' }} />
          <Stack.Screen name="forum/[id]" />
          <Stack.Screen name="talepler" />
          <Stack.Screen name="talep/[id]" />
        </Stack.Protected>
        <Stack.Screen name="isletme-ac" />
      </Stack>
    </AccentProvider>
  );
}
