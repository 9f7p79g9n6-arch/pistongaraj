/**
 * Parçalar: araç sahibi aradığı parçayı yazar, şehrindeki doğrulanmış yedek parçacılar fiyat verir
 * (orijinal / muadil / çıkma, teslim süresi). Ödeme ve teslim uygulama dışında yapılır; sepet ve uygulama içi ödeme yok.
 */
import { type PublicBusiness, type QuoteRequest } from '@piston/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { SpecialCard } from '@/components/brand';
import { Icon } from '@/components/icons';
import { BusinessCard, RequestCard } from '@/components/market';
import { Button, Empty, ErrorText, Field, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';
import { loadCity, saveCity } from '@/lib/city';

export default function Parts() {
  const [city, setCity] = useState('');
  const [sellers, setSellers] = useState<PublicBusiness[] | null>(null);
  const [mine, setMine] = useState<QuoteRequest[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void loadCity().then(setCity); }, []);

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([marketRepo.listBusinesses(city.trim() || null, 'spare_parts', null), marketRepo.myRequests()]);
      setSellers(b);
      setMine(r.filter((x) => x.kind === 'part'));
      setErr(null);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Parçalar yüklenemedi.');
    }
  }, [city]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Screen title="Parçalar">
      {!marketRepo.available ? (
        <Empty title="Sunucu bağlantısı gerekiyor" body="Parça talepleri demo sürümde kullanılamaz." />
      ) : (
        <>
          <SpecialCard style={{ gap: space.md }}>
            <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
              <Icon name="parts" size={26} color="#FF6B74" />
              <Stack gap={4} style={{ flex: 1 }}>
                <Text v="section" color={colors.onSpecial}>Aradığın parçayı yaz, fiyatlar gelsin</Text>
                <Text v="small" color={colors.onSpecialMuted}>
                  Şehrindeki doğrulanmış yedek parçacılar orijinal, muadil ya da çıkma seçenekleriyle fiyat verir. Beğendiğin teklifi kabul edip parçacıyla görüşürsün.
                </Text>
              </Stack>
            </Row>
            <Button title="Parça iste" icon="send" variant="primary" onPress={() => router.push({ pathname: '/teklif/yeni', params: { tur: 'parca' } })} />
          </SpecialCard>
          <ErrorText>{err}</ErrorText>

          <Section title="Parça taleplerim">
            {mine.length === 0 ? (
              <Muted small>Henüz parça talebin yok.</Muted>
            ) : (
              <Stack gap={space.sm}>
                {mine.map((r) => <RequestCard key={r.id} r={{ ...r, offerCount: r.offers.length }} onPress={() => router.push(`/teklif/${r.id}`)} />)}
              </Stack>
            )}
          </Section>

          <Section title="Yedek parçacılar">
            <Field label="Şehir" value={city} onChangeText={setCity} onBlur={() => { void saveCity(city); void load(); }} placeholder="Örn. Konya" autoCapitalize="words" />
            {sellers === null ? <Muted>Yükleniyor…</Muted> : sellers.length === 0 ? (
              <Empty title="Doğrulanmış yedek parçacı bulunamadı" body="Bu şehirde henüz doğrulanmış yedek parçacı yok. Şehri boş bırakıp tümüne bakabilirsin." />
            ) : (
              <Stack gap={space.sm}>
                {sellers.map((b) => <BusinessCard key={b.id} b={b} onPress={() => router.push(`/rehber/${b.id}`)} />)}
              </Stack>
            )}
          </Section>
          <Muted small style={{ marginTop: space.lg }}>
            Uygulama içi sepet ve ödeme şu an yok: ödeme ve teslim parçacıyla aranızda yapılır.
          </Muted>
        </>
      )}
    </Screen>
  );
}
