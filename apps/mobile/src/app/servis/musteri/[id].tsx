import { customerDebtKurus, formatDate, formatKurus, formatPhoneTR } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { RecordCard } from '@/components/servis';
import { Button, Card, Divider, Empty, ListItem, Muted, Row, Screen, Section, Stack, Stat, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { customers, vehicles, records } = useBusiness();
  const c = customers.find((x) => x.id === id);
  if (!c) return <Screen title="Müşteri" back><Empty title="Müşteri bulunamadı" body="Kayıt silinmiş ya da bu işletmeye ait değil." /></Screen>;

  const vs = vehicles.filter((v) => v.customerId === c.id);
  const rs = records.filter((r) => r.customerId === c.id);
  const pending = rs.filter((r) => r.status !== 'completed').length;
  const last = rs[0];
  const debt = customerDebtKurus(rs, c.id);

  return (
    <Screen title={c.fullName} back>
      <Card style={{ gap: 4 }}>
        <Text v="bodyStrong">{formatPhoneTR(c.phone)}</Text>
        {c.email ? <Muted small>{c.email}</Muted> : <Muted small>E-posta yok. Müşteri kaydı uygulamada görmek için WhatsApp mesajındaki ya da PDF’teki kayıt kodunu girer.</Muted>}
        <Row gap={space.sm} style={{ marginTop: space.sm }}>
          <Button title="Ara" small icon="user" onPress={() => Linking.openURL(`tel:${c.phone}`)} />
        </Row>
      </Card>

      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Stat label="Toplam servis" value={String(rs.length)} />
        <Stat label="Son servis" value={last ? formatDate(last.intakeAt.slice(0, 10)) : '—'} />
        <Stat label="Açık kayıt" value={String(pending)} />
      </Row>
      {debt > 0 && (
        <Card onPress={() => router.push('/servis/borclular')} style={{ marginTop: space.md, gap: 2, borderColor: colors.warn }}>
          <Text v="bodyStrong" color={colors.warnText}>{`Kalan borç: ${formatKurus(debt)}`}</Text>
          <Muted small>Ödeme, ilgili servis kaydında “Ödeme al” ile girilir.</Muted>
        </Card>
      )}

      <Button title="Yeni servis kaydı" icon="plus" variant="primary" style={{ marginTop: space.lg }}
        onPress={() => router.push({ pathname: '/servis/yeni-kayit', params: vs.length === 1 ? { arac: vs[0]!.id } : { musteri: c.id } })} />

      <Section title="Araçları" action="Araç ekle" onAction={() => router.push({ pathname: '/servis/arac-ekle', params: { musteri: c.id } })}>
        <Card style={{ paddingVertical: 0 }}>
          {vs.length === 0 ? <Muted small style={{ paddingVertical: space.md }}>Kayıtlı araç yok.</Muted> : vs.map((v, i) => (
            <Stack key={v.id} gap={0}>
              {i > 0 && <Divider />}
              <ListItem icon="car" title={v.plate} subtitle={`${v.make} ${v.model}${v.modelYear ? ` · ${v.modelYear}` : ''}`} onPress={() => router.push(`/servis/arac/${v.id}`)} />
            </Stack>
          ))}
        </Card>
      </Section>

      <Section title="Servis ziyaretleri">
        {rs.length === 0 ? <Muted small>Henüz servis kaydı yok.</Muted> : (
          <Stack gap={space.sm}>{rs.map((r) => <RecordCard key={r.id} r={r} onPress={() => router.push(`/servis/kayit/${r.id}`)} />)}</Stack>
        )}
      </Section>
    </Screen>
  );
}
