import { consumption, fineInfo, formatDate, formatKm, formatNumber, formatTL, monthLong, monthlyTotals, sortFines } from '@piston/core';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { MonthlyBars } from '@/components/charts';
import { Icon } from '@/components/icons';
import { CarArt, FUEL_LABEL, GEAR_LABEL, MaintenanceCard, TYPE_LABEL } from '@/components/vehicle';
import { Button, Card, Empty, ErrorText, IconButton, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { useApp } from '@/data/store';

export default function Home() {
  const { active, bundle, rulesByUrgency, today, error, vehicles, refresh } = useApp();
  const { myPendingCount } = useBusiness();

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
  const openFines = sortFines(bundle.fines.filter((f) => !f.paidOn), today).map((fine) => ({ fine, info: fineInfo(fine, today) }));
  const urgentFine = openFines.find((f) => f.info.status === 'discount') ?? null;
  const insp = rulesByUrgency.find((r) => r.rule.itemKey === 'inspection');
  const inspectionSoon = insp && insp.due.daysLeft != null && insp.due.daysLeft >= 0 && insp.due.daysLeft <= 30 ? insp.due.daysLeft : null;

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

      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <QuickAction icon="alert" tint={colors.warn} label="Gösterge ışığı" onPress={() => router.push('/lights')} />
        <QuickAction icon="shield" tint={colors.danger} label="Kaza asistanı" onPress={() => router.push('/accident')} />
        <QuickAction icon="doc" tint={colors.info} label="Cezalar" onPress={() => router.push(`/vehicle/${vid}/fines`)} />
      </Row>

      {myPendingCount > 0 && (
        <Card onPress={() => router.push('/servis-kayitlarim')} highlight style={{ marginTop: space.md, gap: 4 }} accessibilityLabel="Onay bekleyen servis kaydı">
          <Text v="bodyStrong" color={colors.warn}>{myPendingCount === 1 ? 'Onayını bekleyen bir servis kaydı var' : `Onayını bekleyen ${myPendingCount} servis kaydı var`}</Text>
          <Muted small>Yapılan işlemleri ve tutarları incele; onayla ya da itiraz et.</Muted>
        </Card>
      )}

      {urgentFine && (
        <Card onPress={() => router.push(`/vehicle/${vid}/fines`)} highlight style={{ marginTop: space.md, gap: 4 }} accessibilityLabel="Ceza indirimi">
          <Text v="bodyStrong" color={colors.warn}>
            {urgentFine.info.daysLeftForDiscount === 0 ? 'Ceza indiriminin bugün son günü' : `Ceza indirimine ${urgentFine.info.daysLeftForDiscount} gün kaldı`}
          </Text>
          <Muted small>{formatTL(urgentFine.info.discountedAmount)} ile ödeyebilirsin (normali {formatTL(urgentFine.fine.amount)}). Son gün {formatDate(urgentFine.info.discountUntil)}.</Muted>
        </Card>
      )}

      {inspectionSoon && (
        <Card onPress={() => router.push(`/vehicle/${vid}/inspection`)} style={{ marginTop: space.md, gap: 4 }} accessibilityLabel="Muayene hazırlığı">
          <Text v="bodyStrong">Muayeneye {inspectionSoon} gün kaldı</Text>
          <Muted small>Muayeneden kaldıran kalemleri önceden kontrol et: far, lastik, silecek, ekipman.</Muted>
        </Card>
      )}

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

function QuickAction({ icon, tint, label, onPress }: { icon: 'alert' | 'shield' | 'doc'; tint: string; label: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: space.md, paddingHorizontal: space.sm }} accessibilityLabel={label}>
      <Icon name={icon} size={22} color={tint} />
      <Text v="smallStrong" style={{ textAlign: 'center' }}>{label}</Text>
    </Card>
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
