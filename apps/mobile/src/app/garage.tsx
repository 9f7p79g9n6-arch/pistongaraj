import { canAddVehicle, formatNumber } from '@piston/core';
import { router } from 'expo-router';

import { CarArt, TYPE_LABEL } from '@/components/vehicle';
import { Button, Card, IconButton, Muted, Pill, Row, Screen, Stack, Text } from '@/components/ui';
import { useApp } from '@/data/store';
import { space } from '@/constants/theme';

export default function Garage() {
  const { vehicles, active, selectVehicle, account } = useApp();
  const canAdd = canAddVehicle(account?.plan ?? 'free', vehicles.length);
  const add = () => (canAdd ? router.push('/vehicle/new') : router.push('/premium'));

  return (
    <Screen title="Garajım" back right={<IconButton icon="plus" label="Araç ekle" onPress={add} />}>
      <Stack>
        {vehicles.map((v) => (
          <Card key={v.id} highlight={v.id === active?.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Stack gap={2} style={{ flex: 1 }}>
                <Text v="label">{TYPE_LABEL[v.vehicleType]}{v.plate ? ` · ${v.plate}` : ''}</Text>
                <Text v="section">{v.make} {v.model}</Text>
                <Muted small>{v.modelYear}{v.engineLabel ? ` · ${v.engineLabel}` : ''} · {formatNumber(v.odometerKm)} km</Muted>
              </Stack>
              {v.id === active?.id && <Pill tone="ok">Seçili</Pill>}
            </Row>
            <CarArt photoUrl={v.photoUrl} height={90} />
            <Row gap={space.sm}>
              {v.id !== active?.id && (
                <Button title="Bu aracı seç" small variant="outline" style={{ flex: 1 }} onPress={() => { selectVehicle(v.id); router.back(); }} />
              )}
              <Button title="Detay" small variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/vehicle/${v.id}`)} />
            </Row>
          </Card>
        ))}
        <Button title={canAdd ? 'Araç ekle' : 'Araç sınırına ulaştın · Plus'} icon="plus" variant={canAdd ? 'primary' : 'secondary'} onPress={add} />
        <Muted small>Ücretsiz planda 2 araç. Plus ile sınırsız araç ve aile paylaşımı.</Muted>
      </Stack>
    </Screen>
  );
}
