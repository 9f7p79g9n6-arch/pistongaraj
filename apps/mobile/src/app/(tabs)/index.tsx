import { consumption, formatDate, formatKm, formatNumber, formatTL, monthLong, monthlyTotals } from '@piston/core';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { MonthlyBars } from '@/components/charts';
import { Icon } from '@/components/icons';
import { CarArt, FUEL_LABEL, GEAR_LABEL, MaintenanceCard, TYPE_LABEL } from '@/components/vehicle';
import { Button, Card, Empty, ErrorText, IconButton, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { useApp } from '@/data/store';

export default function Home() {
  const { active, bundle, rulesByUrgency, today, error, vehicles, refresh } = useApp();

  const stats = useMemo(() => {
    const months = monthlyTotals(today, 6, bundle.fuel, bundle.expenses, bundle.events);
    return { months, cons: consumption(bundle.fuel), thisMonth: months[months.length - 1]! };
  }, [today, bundle]);

  if (!active) {
    return (
      <Screen title="Garajım">
        <ErrorText>{error}</ErrorText>
        {error ? <Button title="Tekrar dene" onPress={refresh} /> : null}
        <Empty title="Garajın boş" body="İlk aracını ekle. Bakım hatırlatmaları, yakıt ve masraf takibi araca göre çalışır."
          action="Araç ekle" onAction={() => router.push('/vehicle/new')} />
      </Screen>
    );
  }

  const top = rulesByUrgency.slice(0, 3);
  const vid = active.id;

  return (
    <Screen
      right={<IconButton icon="bell" label="Bildirimler" onPress={() => router.push(`/vehicle/${vid}/maintenance`)} dot={rulesByUrgency.some((r) => r.due.status !== 'ok')} />}>
      <Pressable onPress={() => router.push('/garage')} accessibilityRole="button" accessibilityLabel="Araç değiştir"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, marginBottom: space.md }}>
        <Icon name="car" size={16} />
        <Text v="smallStrong">{active.make} {active.model}</Text>
        {vehicles.length > 1 && <Muted small>▾</Muted>}
      </Pressable>

      <Card style={{ gap: space.sm }} onPress={() => router.push(`/vehicle/${vid}`)} accessibilityLabel="Araç detayı">
        <Text v="label">{TYPE_LABEL[active.vehicleType]} · {active.modelYear}</Text>
        <Text v="title">{active.make} {active.model}</Text>
        <Muted small>{[active.engineLabel, FUEL_LABEL[active.fuelType], GEAR_LABEL[active.transmission]].filter(Boolean).join(' · ')}</Muted>
        <CarArt photoUrl={active.photoUrl} />
        <Row gap={space.sm}>
          <MiniStat label="Kilometre" value={formatNumber(active.odometerKm)} />
          <MiniStat label="Ort. tüketim" value={stats.cons.averagePer100 ? `${formatNumber(stats.cons.averagePer100, 1)} L` : '—'} />
          <MiniStat label={`${monthLong(stats.thisMonth.month)} gideri`} value={formatTL(stats.thisMonth.total, 0)} />
        </Row>
        <Button title="Kilometreyi güncelle" variant="ghost" small onPress={() => router.push(`/vehicle/${vid}/odometer`)} />
      </Card>

      <Card onPress={() => router.push('/lights')} style={{ marginTop: space.md }} accessibilityLabel="Gösterge ışığı tanıma">
        <Row>
          <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,181,71,0.14)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="alert" size={20} color={colors.warn} />
          </View>
          <View style={{ flex: 1 }}>
            <Text v="bodyStrong">Gösterge ışığı mı yandı?</Text>
            <Muted small>Fotoğrafını çek; ne anlama geldiğini ve sürüp süremeyeceğini söyleyelim.</Muted>
          </View>
          <Icon name="chev" size={16} color={colors.textMuted} />
        </Row>
      </Card>

      <Section title="Sıradaki işler" action={rulesByUrgency.length ? 'Tümü' : undefined} onAction={() => router.push(`/vehicle/${vid}/maintenance`)}>
        {top.length ? (
          <Stack>{top.map((r) => <MaintenanceCard key={r.rule.id} item={r} showSource={false} onPress={() => router.push(`/vehicle/${vid}/maintenance`)} />)}</Stack>
        ) : (
          <Empty title="Henüz hatırlatma yok" body="Motor yağı, muayene, sigorta gibi kalemleri ekle. Aralığı sen belirlersin."
            action="Hatırlatma ekle" onAction={() => router.push(`/vehicle/${vid}/rule`)} />
        )}
      </Section>

      <Section title="Aylık giderler" action="Detay" onAction={() => router.push(`/vehicle/${vid}/fuel`)}>
        <Card><MonthlyBars rows={stats.months} /></Card>
        <Row gap={space.sm}>
          <Button title="Yakıt ekle" icon="fuel" small style={{ flex: 1 }} onPress={() => router.push(`/vehicle/${vid}/add-fuel`)} />
          <Button title="Masraf ekle" icon="doc" small style={{ flex: 1 }} onPress={() => router.push(`/vehicle/${vid}/add-expense`)} />
        </Row>
      </Section>

      {bundle.events.length > 0 && (
        <Section title="Son bakım geçmişi">
          <Card style={{ gap: space.md }}>
            {bundle.events.slice(0, 3).map((e) => (
              <View key={e.id} style={{ gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text v="smallStrong" style={{ flexShrink: 1 }}>{e.title}</Text>
                  {e.cost != null && <Text v="smallStrong">{formatTL(e.cost, 0)}</Text>}
                </Row>
                <Muted small>{[formatDate(e.performedOn), e.odometerKm != null ? formatKm(e.odometerKm) : null, e.performedBy].filter(Boolean).join(' · ')}</Muted>
              </View>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Yakında">
        <Card style={{ gap: space.xs }}>
          <Text v="bodyStrong">PISTON AI, uyumlu parça ve usta teklifleri</Text>
          <Muted small>Hatırlatman geldiğinde aracına uyan parçayı ve yakınındaki ustaların tekliflerini buradan göreceksin.</Muted>
        </Card>
      </Section>
    </Screen>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(23,25,29,0.55)', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 }}>
      <Muted small>{label}</Muted>
      <Text v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}
