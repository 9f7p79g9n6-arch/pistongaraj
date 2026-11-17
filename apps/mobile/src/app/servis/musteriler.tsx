import { formatPhoneTR } from '@piston/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { Button, Card, Divider, Empty, Field, ListItem, Pill, Screen } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';

export default function Customers() {
  const { customers, vehicles, records } = useBusiness();
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    const digits = q.replace(/\D/g, '');
    return customers.filter((c) => !needle
      || c.fullName.toLocaleLowerCase('tr').includes(needle)
      || (digits.length >= 3 && c.phone.includes(digits.replace(/^0/, ''))));
  }, [customers, q]);

  return (
    <Screen title="Müşteriler" back right={<Button title="Ekle" icon="plus" small variant="primary" onPress={() => router.push('/servis/musteri-ekle')} />}>
      <Field label="Ad veya telefon ile ara" value={q} onChangeText={setQ} />
      <Card style={{ paddingVertical: 0, marginTop: space.lg }}>
        {list.length === 0 ? (
          <Empty title="Müşteri yok" body={customers.length === 0 ? 'İlk müşterini ekle ya da yeni servis kaydında oluştur.' : 'Aramaya uyan müşteri yok.'} />
        ) : list.map((c, i) => {
          const vs = vehicles.filter((v) => v.customerId === c.id);
          const pending = records.filter((r) => r.customerId === c.id && r.status !== 'completed').length;
          return (
            <ListItemWrap key={c.id} first={i === 0}>
              <ListItem icon="user" title={c.fullName}
                subtitle={[formatPhoneTR(c.phone), vs.map((v) => v.plate).join(', ')].filter(Boolean).join(' · ')}
                right={pending > 0 ? <Pill tone="warn">{`${pending} açık`}</Pill> : undefined}
                onPress={() => router.push(`/servis/musteri/${c.id}`)} />
            </ListItemWrap>
          );
        })}
      </Card>
    </Screen>
  );
}

function ListItemWrap({ first, children }: { first: boolean; children: React.ReactNode }) {
  return <>{!first && <Divider />}{children}</>;
}
