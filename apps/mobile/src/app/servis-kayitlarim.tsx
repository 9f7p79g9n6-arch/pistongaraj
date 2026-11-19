/** Müşteri tarafı: servislerin bu hesap için açtığı kayıtlar. Onay bekleyenler üstte. */
import { needsCustomerAction } from '@piston/core';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { ClaimCodeCard } from '@/components/claim-code';
import { CustomerEmailHint, RecordCard } from '@/components/servis';
import { Empty, Screen, Section, Stack } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';

export default function MyServiceRecords() {
  const { myRecords, refresh } = useBusiness();
  useEffect(() => { void refresh(); }, [refresh]);
  const pending = myRecords.filter((r) => needsCustomerAction(r.status));
  const others = myRecords.filter((r) => !needsCustomerAction(r.status));

  return (
    <Screen title="Servis kayıtlarım" back>
      <ClaimCodeCard onClaimed={(rid) => { void refresh(); if (rid) router.push(`/servis-kaydi/${rid}`); }} />
      {myRecords.length === 0 ? (
        <Stack gap={space.md}>
          <Empty title="Henüz servis kaydı yok" body="Aracına bakım yapan servis OTOM SERVİS kullanıyorsa kayıt burada görünür: servise giriş e-postanı verdiysen kendiliğinden, vermediysen servisin WhatsApp’tan ya da PDF’le gönderdiği kayıt kodunu yukarıya girince." />
          <CustomerEmailHint />
        </Stack>
      ) : (
        <>
          {pending.length > 0 && (
            <Section title="Onayını bekleyenler">
              <Stack gap={space.sm}>{pending.map((r) => <RecordCard key={r.id} r={r} showCustomer={false} onPress={() => router.push(`/servis-kaydi/${r.id}`)} />)}</Stack>
            </Section>
          )}
          {others.length > 0 && (
            <Section title="Geçmiş">
              <Stack gap={space.sm}>{others.map((r) => <RecordCard key={r.id} r={r} showCustomer={false} onPress={() => router.push(`/servis-kaydi/${r.id}`)} />)}</Stack>
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}
