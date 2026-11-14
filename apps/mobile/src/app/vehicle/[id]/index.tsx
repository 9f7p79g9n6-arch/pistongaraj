import { formatNumber } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { CarArt, FUEL_LABEL, GEAR_LABEL, TYPE_LABEL } from '@/components/vehicle';
import { Button, Card, Divider, Empty, ErrorText, ListItem, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { useApp, useVehicle } from '@/data/store';
import { confirm } from '@/lib/confirm';

export default function VehicleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicle: v, bundle } = useVehicle(id);
  const { run } = useApp();
  const [err, setErr] = useState<string | null>(null);

  if (!v) return <Screen title="Araç" back><Empty title="Araç bulunamadı" body="Silinmiş ya da arşivlenmiş olabilir." /></Screen>;

  const archive = async () => {
    if (!(await confirm('Aracı garajdan kaldır', `${v.make} ${v.model} arşivlenir. Kayıtları silinmez.`, 'Kaldır', true))) return;
    try {
      await run((r) => r.archiveVehicle(v.id));
      router.replace('/');
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Araç kaldırılamadı.');
    }
  };

  const rows: [string, string][] = [
    ['Tür', TYPE_LABEL[v.vehicleType]],
    ['Model yılı', String(v.modelYear)],
    ['Motor', v.engineLabel ?? '—'],
    ['Yakıt', FUEL_LABEL[v.fuelType]],
    ['Şanzıman', GEAR_LABEL[v.transmission]],
    ['Kilometre', `${formatNumber(v.odometerKm)} km`],
    ['Plaka', v.plate ?? 'Eklenmedi'],
    ['Şasi no', v.vinMasked ?? 'Eklenmedi'],
  ];

  return (
    <Screen title={`${v.make} ${v.model}`} back>
      <CarArt photoUrl={v.photoUrl} />
      <Card style={{ gap: space.sm, marginTop: space.md }}>
        {rows.map(([k, val]) => (
          <Row key={k} style={{ justifyContent: 'space-between' }}>
            <Muted>{k}</Muted>
            <Text v="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>{val}</Text>
          </Row>
        ))}
      </Card>

      <Section title="Kayıtlar">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="wrench" title="Bakım ve hatırlatmalar" subtitle={`${bundle.rules.length} takip kalemi · ${bundle.events.length} işlem`} onPress={() => router.push(`/vehicle/${v.id}/maintenance`)} />
          <Divider />
          <ListItem icon="fuel" title="Yakıt ve masraf" subtitle={`${bundle.fuel.length} yakıt · ${bundle.expenses.length} masraf kaydı`} onPress={() => router.push(`/vehicle/${v.id}/fuel`)} />
          <Divider />
          <ListItem icon="doc" title="Trafik cezaları" subtitle={`${bundle.fines.filter((f) => !f.paidOn).length} ödenmemiş`} onPress={() => router.push(`/vehicle/${v.id}/fines`)} />
          <Divider />
          <ListItem icon="shield" title="Muayene hazırlığı" subtitle="Muayeneden önce kontrol listesi" onPress={() => router.push(`/vehicle/${v.id}/inspection`)} />
          <Divider />
          <ListItem icon="car" title="Kilometreyi güncelle" subtitle={`${formatNumber(v.odometerKm)} km`} onPress={() => router.push(`/vehicle/${v.id}/odometer`)} />
        </Card>
      </Section>

      <Section title="Araç Pasaportu">
        <Card style={{ gap: space.xs }}>
          <Text v="bodyStrong">Satışta geçmişini paylaş</Text>
          <Muted small>Belgeli bakım geçmişini alıcıya tek bağlantıyla göstermek Plus ile Aşama 2’de açılıyor. Şimdiden faturalı kayıt ekledikçe pasaportun dolar.</Muted>
        </Card>
      </Section>

      <Stack style={{ marginTop: space.xl }}>
        <ErrorText>{err}</ErrorText>
        <Button title="Aracı garajdan kaldır" variant="ghost" icon="trash" onPress={archive} />
      </Stack>
    </Screen>
  );
}
