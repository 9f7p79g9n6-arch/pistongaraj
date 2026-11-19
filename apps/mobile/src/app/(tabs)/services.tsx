/**
 * Servisler: OTOM SERVİS kullanan doğrulanmış servislerin rehberi ve araç sahibinin servis teklif talepleri.
 * Rehberde yalnızca yönetici tarafından doğrulanmış işletmeler görünür; sahte servis gösterilmez.
 */
import { SERVICE_DIRECTORY_CATEGORIES, type BusinessCategory, type PublicBusiness, type QuoteRequest } from '@piston/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { BusinessCard, categoryLabel, RequestCard } from '@/components/market';
import { Button, Chip, Empty, ErrorText, Field, Muted, Row, Screen, Section, Stack } from '@/components/ui';
import { space } from '@/constants/theme';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';
import { loadCity, saveCity } from '@/lib/city';
import { CityPicker } from '@/components/place-picker';

export default function Services() {
  const [city, setCity] = useState('');
  const [category, setCategory] = useState<BusinessCategory | null>(null);
  const [query, setQuery] = useState('');
  const [list, setList] = useState<PublicBusiness[] | null>(null);
  const [mine, setMine] = useState<QuoteRequest[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void loadCity().then(setCity); }, []);

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([
        marketRepo.listBusinesses(city.trim() || null, category, query.trim() || null),
        marketRepo.myRequests(),
      ]);
      setList(category ? b : b.filter((x) => x.category !== 'spare_parts'));
      setMine(r.filter((x) => x.kind === 'service'));
      setErr(null);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Servisler yüklenemedi.');
    }
  }, [city, category, query]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Screen title="Servisler" right={<Button title="Teklif iste" icon="plus" small variant="primary" onPress={() => router.push({ pathname: '/teklif/yeni', params: { tur: 'servis' } })} />}>
      <Muted small>OTOM SERVİS kullanan, doğrulanmış servisler. Sorununu yaz, birden çok servisten fiyat al.</Muted>

      {!marketRepo.available ? (
        <Empty title="Sunucu bağlantısı gerekiyor" body="Servis rehberi ve teklifler demo sürümde kullanılamaz." />
      ) : (
        <>
          <Row gap={space.sm} style={{ marginTop: space.md }}>
            <CityPicker value={city} emptyLabel="Tüm şehirler" onChange={(c) => { setCity(c); void saveCity(c); }} />
            <Field label="Ara" value={query} onChangeText={setQuery} placeholder="Servis adı, ilçe" />
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md, marginHorizontal: -space.lg }}
            contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
            <Chip label="Tümü" selected={category === null} onPress={() => setCategory(null)} />
            {SERVICE_DIRECTORY_CATEGORIES.map((c) => <Chip key={c} label={categoryLabel(c)} selected={category === c} onPress={() => setCategory(c)} />)}
          </ScrollView>
          <ErrorText>{err}</ErrorText>

          {mine.length > 0 && (
            <Section title="Taleplerim">
              <Stack gap={space.sm}>
                {mine.slice(0, 3).map((r) => (
                  <RequestCard key={r.id} r={{ ...r, offerCount: r.offers.length }} onPress={() => router.push(`/teklif/${r.id}`)} />
                ))}
              </Stack>
            </Section>
          )}

          <Section title={city.trim() ? `${city.trim()} servisleri` : 'Servisler'}>
            {list === null ? <Muted>Yükleniyor…</Muted> : list.length === 0 ? (
              <Empty title="Doğrulanmış servis bulunamadı"
                body={city.trim() ? 'Bu şehirde ya da bu alanda henüz doğrulanmış servis yok. Şehri boş bırakıp tüm servislere bakabilirsin.' : 'Henüz doğrulanmış servis yok.'} />
            ) : (
              <Stack gap={space.sm}>
                {list.map((b) => <BusinessCard key={b.id} b={b} onPress={() => router.push(`/rehber/${b.id}`)} />)}
              </Stack>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}
