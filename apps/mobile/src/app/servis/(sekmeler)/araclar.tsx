import { formatKm } from '@piston/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { Button, Card, Divider, Empty, Field, ListItem, Muted, Screen } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';

/** Plaka araması yalnızca bu işletmenin kendi kayıtlarında yapılır; dış kaynaklardan araç sahibi sorgulanmaz. */
export default function Vehicles() {
  const { vehicles, customers } = useBusiness();
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.replace(/\s/g, '').toLocaleUpperCase('tr').replace(/İ/g, 'I');
    return vehicles.filter((v) => !needle || v.plate.replace(/\s/g, '').includes(needle)
      || `${v.make} ${v.model}`.toLocaleUpperCase('tr').includes(q.trim().toLocaleUpperCase('tr')));
  }, [vehicles, q]);

  return (
    <Screen title="Araçlar" right={<Button title="Ekle" icon="plus" small variant="primary" onPress={() => router.push('/servis/arac-ekle')} />}>
      <Field label="Plaka ile bul" value={q} onChangeText={setQ} autoCapitalize="characters" placeholder="34 ABC 123" />
      <Muted small style={{ marginTop: space.xs }}>Yalnızca işletmenin kendi kayıtlarında arar.</Muted>
      <Card style={{ paddingVertical: 0, marginTop: space.lg }}>
        {list.length === 0 ? (
          <Empty title="Araç bulunamadı" body={vehicles.length === 0 ? 'Araçlar servis kaydı açarken ya da müşteri sayfasından eklenir.' : 'Bu plakayla kayıtlı araç yok. Yeni servis kaydı açarak ekleyebilirsin.'}
            action="Yeni servis kaydı" onAction={() => router.push({ pathname: '/servis/yeni-kayit', params: { plaka: q } })} />
        ) : list.map((v, i) => (
          <ItemWrap key={v.id} first={i === 0}>
            <ListItem icon="car" title={v.plate}
              subtitle={[`${v.make} ${v.model}`, customers.find((c) => c.id === v.customerId)?.fullName, v.lastOdometerKm != null ? formatKm(v.lastOdometerKm) : null].filter(Boolean).join(' · ')}
              onPress={() => router.push(`/servis/arac/${v.id}`)} />
          </ItemWrap>
        ))}
      </Card>
    </Screen>
  );
}

function ItemWrap({ first, children }: { first: boolean; children: React.ReactNode }) {
  return <>{!first && <Divider />}{children}</>;
}
