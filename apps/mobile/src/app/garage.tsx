import { canAddVehicle, formatNumber } from '@piston/core';
import { router } from 'expo-router';

import { CarArt, TYPE_LABEL } from '@/components/vehicle';
import { Button, Card, IconButton, Muted, Pill, Row, Screen, Stack, Text } from '@/components/ui';
import { useApp } from '@/data/store';

export default function Garage() {
  const { vehicles, active, selectVehicle, account } = useApp();
  const canAdd = canAddVehicle(account?.plan ?? 'free', vehicles.length);
  const add = () => (canAdd ? router.push('/vehicle/new') : router.push('/premium'));

  return (
    <Screen title="Garajım" back right={<IconButton icon="plus" label="Araç ekle" onPress={add} />}>
      <Stack>
        {vehicles.map((v) => (
          <Card key={v.id} highlight={v.id === active?.id} onPress={() => { selectVehicle(v.id); router.back(); }}
            accessibilityLabel={`${v.make} ${v.model} seç`}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Stack gap={2} style={{ flex: 1 }}>
                <Text v="label">{TYPE_LABEL[v.vehicleType]}{v.plate ? ` · ${v.plate}` : ''}</Text>
                <Text v="section">{v.make} {v.model}</Text>
                <Muted small>{v.modelYear}{v.engineLabel ? ` · ${v.engineLabel}` : ''} · {formatNumber(v.odometerKm)} km</Muted>
              </Stack>
              {v.id === active?.id && <Pill tone="ok">Seçili</Pill>}
            </Row>
            <CarArt photoUrl={v.photoUrl} height={90} />
            <Button title="Detay" small variant="ghost" onPress={() => router.push(`/vehicle/${v.id}`)} />
          </Card>
        ))}
        <Button title={canAdd ? 'Araç ekle' : 'Araç sınırına ulaştın · Plus'} icon="plus" variant={canAdd ? 'primary' : 'secondary'} onPress={add} />
        <Muted small>Ücretsiz planda 2 araç. Plus ile sınırsız araç ve aile paylaşımı.</Muted>
      </Stack>
    </Screen>
  );
}
