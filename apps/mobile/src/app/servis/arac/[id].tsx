import { formatDate, formatKm } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { formatDateTime, RecordCard } from '@/components/servis';
import { Button, Card, Divider, Empty, ListItem, Muted, Row, Screen, Section, Stack, Stat, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';

export default function VehicleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, customers, records } = useBusiness();
  const v = vehicles.find((x) => x.id === id);
  const rs = useMemo(() => records.filter((r) => r.vehicleId === id), [records, id]);
  const parts = useMemo(() => rs.flatMap((r) => r.items.filter((i) => i.partQty > 0).map((i) => ({ r, i }))), [rs]);

  if (!v) return <Screen title="Araç" back><Empty title="Araç bulunamadı" body="Bu araç bu işletmenin kayıtlarında yok." /></Screen>;
  const owner = customers.find((c) => c.id === v.customerId);
  const last = rs[0];

  return (
    <Screen title={v.plate} back>
      <Card style={{ gap: 4 }}>
        <Text v="title">{`${v.make} ${v.model}`}</Text>
        <Muted small>{[v.modelYear, v.engineLabel].filter(Boolean).join(' · ') || 'Model yılı ve motor girilmemiş'}</Muted>
        {owner && (
          <ListItem icon="user" title={owner.fullName} subtitle="Araç sahibi (işletme kaydı)" onPress={() => router.push(`/servis/musteri/${owner.id}`)} />
        )}
      </Card>

      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Stat label="Son kilometre" value={v.lastOdometerKm != null ? formatKm(v.lastOdometerKm) : '—'} />
        <Stat label="Son servis" value={last ? formatDate(last.intakeAt.slice(0, 10)) : '—'} />
      </Row>

      <Button title="Yeni servis kaydı" icon="plus" variant="primary" style={{ marginTop: space.lg }}
        onPress={() => router.push({ pathname: '/servis/yeni-kayit', params: { arac: v.id } })} />

      <Section title="Kilometre geçmişi">
        {rs.length === 0 ? <Muted small>Kayıt yok.</Muted> : (
          <Card style={{ gap: 6 }}>
            {rs.map((r, i) => (
              <Stack key={r.id} gap={6}>
                {i > 0 && <Divider />}
                <Row style={{ justifyContent: 'space-between' }}>
                  <Muted small>{formatDateTime(r.intakeAt)}</Muted>
                  <Text v="smallStrong">{formatKm(r.odometerKm)}</Text>
                </Row>
              </Stack>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Değişen parçalar">
        {parts.length === 0 ? <Muted small>Parça değişimi kaydı yok.</Muted> : (
          <Card style={{ gap: 6 }}>
            {parts.map(({ r, i }, idx) => (
              <Row key={`${r.id}-${idx}`} style={{ justifyContent: 'space-between' }}>
                <Text v="small" style={{ flex: 1 }}>{`${i.partName} × ${i.partQty}`}</Text>
                <Muted small>{formatDate(r.intakeAt.slice(0, 10))}</Muted>
              </Row>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Servis geçmişi">
        {rs.length === 0 ? <Muted small>Henüz servis kaydı yok.</Muted> : (
          <Stack gap={space.sm}>{rs.map((r) => <RecordCard key={r.id} r={r} onPress={() => router.push(`/servis/kayit/${r.id}`)} />)}</Stack>
        )}
      </Section>
    </Screen>
  );
}
