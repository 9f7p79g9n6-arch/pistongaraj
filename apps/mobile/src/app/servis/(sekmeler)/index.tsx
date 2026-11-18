/** OTOM SERVİS ana paneli: önce iş yapan düğmeler, sonra sayılar, sonra son kayıtlar. Grafik yok. */
import { activePayments, BUSINESS_STATUS_LABEL, debtors, formatKurus, inPeriod, localDateOf, periodOf } from '@piston/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { BigAction, CountTile, NextStageCard, RecordCard } from '@/components/servis';
import { Button, Card, DemoBadge, Empty, ErrorText, Muted, Pill, Row, Screen, Section, Segmented, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { marketRepo } from '@/data/market';


type Span = 'today' | 'week' | 'month';
const SPANS: { value: Span; label: string }[] = [
  { value: 'today', label: 'Bugün' },
  { value: 'week', label: 'Bu hafta' },
  { value: 'month', label: 'Bu ay' },
];
/** Kutu başlıkları ve kayıt listesinde açılacak süzgeç */
const SPAN_LABEL: Record<Span, { title: string; adj: string; filter: string }> = {
  today: { title: 'Bugün', adj: 'Bugünkü', filter: 'bugun' },
  week: { title: 'Bu hafta', adj: 'Bu haftaki', filter: 'hafta' },
  month: { title: 'Bu ay', adj: 'Bu ayki', filter: 'ay' },
};

export default function Panel() {
  const { business, records, advanced, error, refresh, canFinance } = useBusiness();
  // Araç sahiplerinden gelen teklif talepleri: yeni (görülmemiş) ve teklif bekleyen sayısı
  const [quotes, setQuotes] = useState<{ fresh: number; open: number }>({ fresh: 0, open: 0 });
  useFocusEffect(useCallback(() => {
    if (!business || !marketRepo.available) return;
    let alive = true;
    marketRepo.businessRequests(business.id).then((l) => {
      if (alive) setQuotes({ fresh: l.filter((r) => !r.seen && r.status === 'open').length, open: l.filter((r) => r.status === 'open' && !r.myOffer).length });
    }).catch(() => {});
    return () => { alive = false; };
  }, [business]));

  const [span, setSpan] = useState<Span>('today');
  const c = useMemo(() => {
    const p = periodOf(span);
    const inSpan = (iso: string) => inPeriod(localDateOf(iso), p);
    const opened = records.filter((r) => inSpan(r.intakeAt));
    return {
      services: opened.length,
      customers: new Set(opened.map((r) => r.customerId)).size,
      open: records.filter((r) => r.status !== 'completed').length,
      objected: records.filter((r) => r.status === 'objected').length,
      collected: records.flatMap((r) => activePayments(r.payments)).filter((x) => inSpan(x.paidAt)).reduce((s, x) => s + x.amountKurus, 0),
    };
  }, [records, span]);
  const L = SPAN_LABEL[span];
  const debt = useMemo(() => debtors(records), [records]);
  const debtTotal = debt.reduce((s, d) => s + d.debtKurus, 0);

  if (!business) return <Screen title="OTOM SERVİS">{null}</Screen>;
  const toList = (filtre: string) => router.push({ pathname: '/servis/kayitlar', params: { filtre } });

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <Stack gap={2} style={{ flex: 1 }}>
          <Text v="label">OTOM SERVİS</Text>
          <Text v="title" numberOfLines={1}>{business.name}</Text>
        </Stack>
        <Stack gap={4} style={{ alignItems: 'flex-end' }}>
          <DemoBadge />
          {business.status !== 'active' && <Pill tone={business.status === 'suspended' ? 'bad' : 'warn'}>{BUSINESS_STATUS_LABEL[business.status]}</Pill>}
        </Stack>
      </Row>

      <ErrorText>{error}</ErrorText>
      {error ? <Button title="Tekrar dene" small onPress={refresh} /> : null}

      <Stack gap={space.md}>
        <BigAction primary icon="plus" title="YENİ SERVİS KAYDI" subtitle="Plaka yaz, işlemleri ekle, ücreti al" onPress={() => router.push('/servis/yeni-kayit')} />
        <BigAction icon="users" title="+ MÜŞTERİ EKLE" onPress={() => router.push('/servis/musteri-ekle')} />
      </Stack>

      {quotes.open > 0 && (
        <Card onPress={() => router.push('/servis/talepler')} highlight style={{ marginTop: space.md, gap: 4 }} accessibilityLabel="Teklif talepleri">
          <Text v="bodyStrong" color={colors.brandDark}>{quotes.fresh > 0 ? `${quotes.fresh} yeni teklif talebi` : `${quotes.open} talep teklifini bekliyor`}</Text>
          <Muted small>Araç sahipleri sorununu ya da aradığı parçayı yazdı. Fiyat ver, müşteri kazan.</Muted>
        </Card>
      )}

      <Section title={L.title}>
        <Segmented<Span> options={SPANS} value={span} onChange={setSpan} />
        <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
          <CountTile label={`${L.adj} servis`} value={c.services} onPress={() => toList(L.filter)} />
          <CountTile label={`${L.adj} müşteri`} value={c.customers} onPress={() => toList(L.filter)} />
          <CountTile label="Açık kayıt" value={c.open} tone="warn" onPress={() => toList('acik')} />
          <CountTile label="İtiraz edilen" value={c.objected} tone="bad" onPress={() => toList('itiraz')} />
        </Row>
        {canFinance && (
          <Row gap={space.sm}>
            <Card onPress={() => router.push('/servis/ciro')} style={{ flex: 1, gap: 2 }} accessibilityLabel={`${L.adj} tahsilat, OTOM CİRO`}>
              <Text v="number">{formatKurus(c.collected)}</Text>
              <Muted small>{`${L.adj} tahsilat`}</Muted>
            </Card>
            <Card onPress={() => router.push('/servis/borclular')} style={{ flex: 1, gap: 2 }} accessibilityLabel="Alacak, borçlu müşteriler">
              <Text v="number" color={debtTotal > 0 ? colors.warnText : colors.text}>{formatKurus(debtTotal)}</Text>
              <Muted small>{`Alacak · ${debt.length} müşteri`}</Muted>
            </Card>
          </Row>
        )}
      </Section>

      <Section title="Hızlı erişim">
        <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
          <Button title="Müşteri bul" icon="search" small onPress={() => router.push('/servis/musteriler')} />
          <Button title="Araç bul" icon="car" small onPress={() => router.push('/servis/araclar')} />
          <Button title="Servis geçmişi" icon="list" small onPress={() => toList('tumu')} />
          <Button title="Açık kayıtlar" icon="alert" small onPress={() => toList('acik')} />
          {canFinance && <Button title="OTOM CİRO" icon="doc" small onPress={() => router.push('/servis/ciro')} />}
          {canFinance && <Button title="Borçlu müşteriler" icon="users" small onPress={() => router.push('/servis/borclular')} />}
        </Row>
      </Section>

      <Section title="Son kayıtlar" action={records.length > 5 ? 'Tümü' : undefined} onAction={() => toList('tumu')}>
        {records.length === 0 ? (
          <Empty title="Henüz servis kaydı yok" body="İlk kaydı aç: plakayı yaz, yapılan işlemleri ekle; iş bitince “Ücret alındı” de." />
        ) : (
          <Stack gap={space.sm}>
            {records.slice(0, 5).map((r) => <RecordCard key={r.id} r={r} onPress={() => router.push(`/servis/kayit/${r.id}`)} />)}
          </Stack>
        )}
      </Section>

      <Section title="İş takibi">
        <NextStageCard title="Devam eden işler ve teslime hazır araçlar" stage="Aşama 3"
          body="İş emri durumları (arıza tespiti, parça bekleniyor, teslime hazır) eklendiğinde burada görünecek." />
      </Section>

      {advanced && (
        <Section title="Gelişmiş">
          <Muted small>Menü’deki gelişmiş bölümler sırayla açılacak.</Muted>
        </Section>
      )}
    </Screen>
  );
}
