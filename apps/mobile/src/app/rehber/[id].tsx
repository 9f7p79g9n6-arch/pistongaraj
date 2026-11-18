/** Rehberdeki işletmenin sayfası: bilgiler, iletişim, yol tarifi, onaylı yorumlar ve "Bu işletmeden teklif iste". */
import { formatPhoneTR, mapsSearchUrl, ratingText, timeAgoTR, type BusinessReview, type PublicBusiness } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { BusinessThumb, categoryLabel, Stars } from '@/components/market';
import { Button, Card, Empty, Muted, Pill, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';
import { openWhatsApp } from '@/lib/share-record';

export default function BusinessPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [b, setB] = useState<(PublicBusiness & { reviews: BusinessReview[] }) | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setB(await marketRepo.getBusiness(id));
      setErr(null);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'İşletme açılamadı.');
    }
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (err) return <Screen title="Servis" back><Empty title="Açılamadı" body={err} action="Tekrar dene" onAction={load} /></Screen>;
  if (!b) return <Screen title="Servis" back><Muted>Yükleniyor…</Muted></Screen>;

  const isParts = b.category === 'spare_parts';
  return (
    <Screen title={isParts ? 'Yedek parçacı' : 'Servis'} back>
      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <BusinessThumb path={b.logoPath} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text v="title">{b.name}</Text>
            <Muted small>{categoryLabel(b.category)}</Muted>
          </View>
          <Pill tone="ok">Doğrulandı</Pill>
        </Row>
        <Row gap={6}>
          {b.ratingCount > 0 && <Stars rating={b.ratingAvg ?? 0} size={16} />}
          <Muted small>{ratingText(b.ratingAvg, b.ratingCount)}</Muted>
        </Row>
        {b.description ? <Text>{b.description}</Text> : null}
        <View style={{ gap: 2 }}>
          <Muted small>{`${b.address}, ${b.district} / ${b.city}`}</Muted>
          {b.workingHours ? <Muted small>{`Çalışma saatleri: ${b.workingHours}`}</Muted> : null}
          <Muted small>{formatPhoneTR(b.phone)}</Muted>
        </View>
      </Card>

      <Stack gap={space.sm} style={{ marginTop: space.md }}>
        <Button title={isParts ? 'Bu yedek parçacıdan parça iste' : 'Bu servisten teklif iste'} icon="send" variant="primary"
          onPress={() => router.push({ pathname: '/teklif/yeni', params: { tur: isParts ? 'parca' : 'servis', isletme: b.id, isletmeAdi: b.name } })} />
        <Row gap={space.sm}>
          <Button title="Ara" icon="user" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${b.phone}`)} />
          <Button title="WhatsApp" icon="forum" style={{ flex: 1 }} onPress={() => openWhatsApp(b.phone, 'Merhaba, OTOM üzerinden ulaşıyorum.')} />
        </Row>
        <Button title="Yol tarifi" icon="car" variant="ghost" onPress={() => Linking.openURL(mapsSearchUrl(b))} />
      </Stack>

      <Section title={b.reviews.length ? `Yorumlar (${b.ratingCount})` : 'Yorumlar'}>
        {b.reviews.length === 0 ? (
          <Muted small>Henüz yorum yok. Yalnızca bu serviste işi tamamlanan müşteriler yorum yazabilir.</Muted>
        ) : (
          <Stack gap={space.sm}>
            {b.reviews.map((r) => (
              <Card key={r.id} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Stars rating={r.rating} />
                  <Muted small>{`Doğrulanmış müşteri · ${timeAgoTR(r.createdAt)}`}</Muted>
                </Row>
                {r.comment ? <Text v="small">{r.comment}</Text> : null}
              </Card>
            ))}
          </Stack>
        )}
      </Section>
    </Screen>
  );
}
