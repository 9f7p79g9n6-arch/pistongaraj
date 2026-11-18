import {
  consumption,
  describeLeft,
  fineInfo,
  formatDate,
  formatKm,
  formatNumber,
  formatTL,
  monthLong,
  monthlyTotals,
  sortFines,
  STATUS_LABEL,
} from '@piston/core';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { Logo, QuickTile, SpecialCard } from '@/components/brand';
import { MonthlyBars } from '@/components/charts';
import { Icon, type IconName } from '@/components/icons';
import { CarArt, FUEL_LABEL, GEAR_LABEL, MaintenanceCard } from '@/components/vehicle';
import { Button, Card, Empty, ErrorText, IconButton, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { useApp } from '@/data/store';

export default function Garajim() {
  const { account, active, bundle, rulesByUrgency, today, error, vehicles, refresh } = useApp();
  const biz = useBusiness();
  const { myPendingCount } = biz;

  const stats = useMemo(() => {
    const months = monthlyTotals(today, 6, bundle.fuel, bundle.expenses, bundle.events);
    return { months, cons: consumption(bundle.fuel), thisMonth: months[months.length - 1]! };
  }, [today, bundle]);

  const firstName = account?.displayName?.trim().split(/\s+/)[0] ?? null;
  const header = (
    <Row style={{ justifyContent: 'space-between' }}>
      <IconButton icon="menu" label="Profil ve ayarlar" onPress={() => router.push('/profil')} />
      <Logo size={28} onGreen />
      {active ? (
        <IconButton icon="bell" label="Bildirimler" onPress={() => router.push(`/vehicle/${active.id}/maintenance`)}
          dot={rulesByUrgency.some((r) => r.due.status !== 'ok') || myPendingCount > 0} />
      ) : <View style={{ width: 42 }} />}
    </Row>
  );

  if (!active) {
    return (
      <Screen band={header}>
        <Greeting name={firstName} line="İlk aracını ekleyerek başla." />
        <ErrorText>{error}</ErrorText>
        {error ? <Button title="Tekrar dene" onPress={refresh} /> : null}
        <Empty title="Garajın boş" body="İlk aracını ekle. Bakım hatırlatmaları, yakıt ve masraf takibi araca göre çalışır."
          action="Araç ekle" onAction={() => router.push('/vehicle/new')} />
        <ServisPromo />
      </Screen>
    );
  }

  const top = rulesByUrgency.slice(0, 3);
  const next = rulesByUrgency[0] ?? null;
  const vid = active.id;
  const overdue = rulesByUrgency.some((r) => r.due.status === 'overdue');
  const openFines = sortFines(bundle.fines.filter((f) => !f.paidOn), today).map((fine) => ({ fine, info: fineInfo(fine, today) }));
  const urgentFine = openFines.find((f) => f.info.status === 'discount') ?? null;
  const insp = rulesByUrgency.find((r) => r.rule.itemKey === 'inspection');
  const inspectionSoon = insp && insp.due.daysLeft != null && insp.due.daysLeft >= 0 && insp.due.daysLeft <= 30 ? insp.due.daysLeft : null;

  return (
    <Screen band={header}>
      <Greeting name={firstName} line={overdue ? 'Aracının bakım zamanı geldi.' : 'Aracın güvende.'} />

      {/* Bakım hatırlatma kartı */}
      <SpecialCard>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text v="label" color={colors.onSpecialMuted}>YAKLAŞAN BAKIM</Text>
            <Text v="section" color={colors.onSpecial} numberOfLines={2}>{next ? next.rule.title : 'Hatırlatma eklenmedi'}</Text>
            <Text v="small" color={colors.onSpecialMuted}>
              {next ? `${STATUS_LABEL[next.due.status]} · ${describeLeft(next.due.kmLeft, next.due.daysLeft)}` : 'Motor yağı, muayene, sigorta gibi kalemleri ekle.'}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/garage')} accessibilityRole="button" accessibilityLabel="Araç değiştir"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Icon name="car" size={14} color={colors.onSpecial} />
            <Text v="small" color={colors.onSpecial} numberOfLines={1} style={{ maxWidth: 110 }}>{active.make} {active.model}</Text>
          </Pressable>
        </Row>
        <View style={{ marginVertical: space.sm }}>
          <CarArt photoUrl={active.photoUrl} height={92} />
        </View>
        <Button title={next ? 'Detayları Gör' : 'Hatırlatma ekle'} variant="primary"
          onPress={() => router.push(next ? `/vehicle/${vid}/maintenance` : `/vehicle/${vid}/rule`)} />
      </SpecialCard>

      {myPendingCount > 0 && (
        <Card onPress={() => router.push('/servis-kayitlarim')} highlight style={{ marginTop: space.md, gap: 4 }} accessibilityLabel="Onay bekleyen servis kaydı">
          <Text v="bodyStrong" color={colors.brandDark}>{myPendingCount === 1 ? 'Servisten yeni bir kayıt geldi' : `Servisten ${myPendingCount} yeni kayıt geldi`}</Text>
          <Muted small>Yapılan işlemleri ve tutarları incele; istersen onayla ya da itiraz et.</Muted>
        </Card>
      )}

      {urgentFine && (
        <Card onPress={() => router.push(`/vehicle/${vid}/fines`)} style={{ marginTop: space.md, gap: 4, borderColor: colors.warn }} accessibilityLabel="Ceza indirimi">
          <Text v="bodyStrong" color={colors.warnText}>
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

      <Section title="Hızlı erişim">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          <QuickTile icon="car" title="Araçlarım" subtitle={`${vehicles.length} araç`} onPress={() => router.push('/garage')} />
          <QuickTile icon="doc" title="Servis Kayıtları" subtitle="Servislerin açtığı kayıtlar" badge={myPendingCount}
            onPress={() => router.push('/servis-kayitlarim')} />
          <QuickTile icon="parts" title="Parça ve Ürünler" subtitle="Aracına uyan parçalar" onPress={() => router.push('/market')} />
          <QuickTile icon="search" title="Ekspertiz" subtitle="Alım öncesi kontrol" soon />
        </View>
        <Row gap={space.sm}>
          <Tool icon="alert" tint={colors.warnText} label="Gösterge ışığı" onPress={() => router.push('/lights')} />
          <Tool icon="shield" tint={colors.danger} label="Kaza asistanı" onPress={() => router.push('/accident')} />
          <Tool icon="doc" tint={colors.info} label="Cezalar" onPress={() => router.push(`/vehicle/${vid}/fines`)} />
        </Row>
      </Section>

      <Section title="Aracım" action="Detay" onAction={() => router.push(`/vehicle/${vid}`)}>
        <Card style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <Text v="section">{active.make} {active.model}</Text>
            <Muted small>{[String(active.modelYear), active.engineLabel, FUEL_LABEL[active.fuelType], GEAR_LABEL[active.transmission]].filter(Boolean).join(' · ')}</Muted>
          </View>
          <Row gap={space.sm}>
            <MiniStat label="Kilometre" value={formatNumber(active.odometerKm)} />
            <MiniStat label="Ort. tüketim" value={stats.cons.averagePer100 ? `${formatNumber(stats.cons.averagePer100, 1)} L` : '—'} />
            <MiniStat label={`${monthLong(stats.thisMonth.month)} gideri`} value={formatTL(stats.thisMonth.total, 0)} />
          </Row>
          <Button title="Kilometreyi güncelle" variant="secondary" small onPress={() => router.push(`/vehicle/${vid}/odometer`)} />
        </Card>
      </Section>

      <Section title="Sıradaki işler" action={rulesByUrgency.length ? 'Tümü' : undefined} onAction={() => router.push(`/vehicle/${vid}/maintenance`)}>
        {top.length ? (
          <Stack>{top.map((r) => <MaintenanceCard key={r.rule.id} item={r} showSource={false} onPress={() => router.push(`/vehicle/${vid}/maintenance`)} />)}</Stack>
        ) : (
          <Empty title="Henüz hatırlatma yok" body="Motor yağı, muayene, sigorta gibi kalemleri ekle. Aralığı sen belirlersin."
            action="Hatırlatma ekle" onAction={() => router.push(`/vehicle/${vid}/rule`)} />
        )}
      </Section>

      <ServisPromo />

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
    </Screen>
  );
}

function Greeting({ name, line }: { name: string | null; line: string }) {
  return (
    <View style={{ gap: 2, marginTop: space.lg, marginBottom: space.lg }}>
      <Text v="display" accessibilityRole="header">{name ? `Merhaba, ${name}` : 'Merhaba'}</Text>
      <Muted>{line}</Muted>
    </View>
  );
}

/** OTOM SERVİS tanıtımı: işletmesi olan kullanıcı doğrudan işletme moduna geçer. */
function ServisPromo() {
  const biz = useBusiness();
  const has = biz.businesses.length > 0;
  return (
    <SpecialCard style={{ marginTop: space.xl, gap: space.md }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(229,57,69,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="wrench" size={22} color="#FF6B74" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text v="label" color={colors.onSpecialMuted}>OTOM SERVİS</Text>
          <Text v="section" color={colors.onSpecial}>{has ? (biz.business?.name ?? 'İşletmen') : 'Servisin ya da usta mısın?'}</Text>
          <Text v="small" color={colors.onSpecialMuted}>
            {has ? 'Servis kayıtları, müşteriler, tahsilat ve ciro tek yerde.' : 'Servis kaydı aç, müşteriye WhatsApp’tan gönder, ciro ve borçları takip et. Şimdilik ücretsiz.'}
          </Text>
        </View>
      </Row>
      <Button title={has ? 'İşletme moduna geç' : 'İşletme hesabı aç'} variant="primary"
        onPress={() => {
          biz.setMode('business');
          if (has) router.replace('/servis');
          else router.push('/servis/isletme-ac');
        }} />
    </SpecialCard>
  );
}

function Tool({ icon, tint, label, onPress }: { icon: IconName; tint: string; label: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: space.md, paddingHorizontal: space.sm }} accessibilityLabel={label}>
      <Icon name={icon} size={22} color={tint} />
      <Text v="small" style={{ textAlign: 'center', fontWeight: '600' }}>{label}</Text>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 }}>
      <Muted small>{label}</Muted>
      <Text v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}
