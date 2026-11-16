/** PISTON SERVİS ana paneli: önce iş yapan düğmeler, sonra sayılar, sonra son kayıtlar. Grafik yok. */
import { activePayments, BUSINESS_STATUS_LABEL, debtors, formatKurus, needsCustomerAction } from '@piston/core';
import { router } from 'expo-router';
import { useMemo } from 'react';

import { BigAction, CountTile, NextStageCard, RecordCard } from '@/components/servis';
import { Button, Card, DemoBadge, Empty, ErrorText, Muted, Pill, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function Panel() {
  const { business, records, advanced, error, refresh, canFinance } = useBusiness();

  const c = useMemo(() => {
    const today = records.filter((r) => isToday(r.intakeAt));
    return {
      today: today.length,
      todayCustomers: new Set(today.map((r) => r.customerId)).size,
      pending: records.filter((r) => needsCustomerAction(r.status)).length,
      objected: records.filter((r) => r.status === 'objected').length,
      approved: records.filter((r) => r.status === 'approved').length,
      todayCollected: records.flatMap((r) => activePayments(r.payments)).filter((p) => isToday(p.paidAt)).reduce((s, p) => s + p.amountKurus, 0),
    };
  }, [records]);
  const debt = useMemo(() => debtors(records), [records]);
  const debtTotal = debt.reduce((s, d) => s + d.debtKurus, 0);

  if (!business) return <Screen title="PISTON SERVİS">{null}</Screen>;
  const toList = (filtre: string) => router.push({ pathname: '/servis/kayitlar', params: { filtre } });

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <Stack gap={2} style={{ flex: 1 }}>
          <Text v="label">PISTON SERVİS</Text>
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
        <BigAction primary icon="plus" title="YENİ SERVİS KAYDI" subtitle="Plaka yaz, işlemleri ekle, müşteriye gönder" onPress={() => router.push('/servis/yeni-kayit')} />
        <BigAction icon="users" title="+ MÜŞTERİ EKLE" onPress={() => router.push('/servis/musteri-ekle')} />
      </Stack>

      <Section title="Bugün">
        <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
          <CountTile label="Bugünkü servis" value={c.today} onPress={() => toList('bugun')} />
          <CountTile label="Bugünkü müşteri" value={c.todayCustomers} />
          <CountTile label="Onay bekleyen" value={c.pending} tone="warn" onPress={() => toList('bekleyen')} />
          <CountTile label="İtiraz edilen" value={c.objected} tone="bad" onPress={() => toList('itiraz')} />
        </Row>
        {canFinance && (
          <Row gap={space.sm}>
            <Card onPress={() => router.push('/servis/ciro')} style={{ flex: 1, gap: 2 }} accessibilityLabel="Bugünkü tahsilat, PISTON CİRO">
              <Text v="number">{formatKurus(c.todayCollected)}</Text>
              <Muted small>Bugünkü tahsilat</Muted>
            </Card>
            <Card onPress={() => router.push('/servis/borclular')} style={{ flex: 1, gap: 2 }} accessibilityLabel="Alacak, borçlu müşteriler">
              <Text v="number" color={debtTotal > 0 ? colors.warn : colors.text}>{formatKurus(debtTotal)}</Text>
              <Muted small>{`Alacak · ${debt.length} müşteri`}</Muted>
            </Card>
          </Row>
        )}
        {c.approved > 0 && (
          <Card onPress={() => toList('onayli')} style={{ gap: 2 }}>
            <Text v="bodyStrong">{`${c.approved} kayıt müşteri tarafından onaylandı`}</Text>
            <Muted small>Teslimden sonra kaydı tamamlayabilirsin.</Muted>
          </Card>
        )}
      </Section>

      <Section title="Hızlı erişim">
        <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
          <Button title="Müşteri bul" icon="search" small onPress={() => router.push('/servis/musteriler')} />
          <Button title="Araç bul" icon="car" small onPress={() => router.push('/servis/araclar')} />
          <Button title="Servis geçmişi" icon="list" small onPress={() => toList('tumu')} />
          <Button title="Onay bekleyenler" icon="alert" small onPress={() => toList('bekleyen')} />
          {canFinance && <Button title="PISTON CİRO" icon="doc" small onPress={() => router.push('/servis/ciro')} />}
          {canFinance && <Button title="Borçlu müşteriler" icon="users" small onPress={() => router.push('/servis/borclular')} />}
        </Row>
      </Section>

      <Section title="Son kayıtlar" action={records.length > 5 ? 'Tümü' : undefined} onAction={() => toList('tumu')}>
        {records.length === 0 ? (
          <Empty title="Henüz servis kaydı yok" body="İlk kaydı aç: plakayı yaz, yapılan işlemleri ekle, müşteriye onaya gönder." />
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
