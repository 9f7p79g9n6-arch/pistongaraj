/** Borcu kalan müşteriler: onaylı ya da tamamlanmış kayıtlarda ödenmemiş tutar. En çok borçlu önce. */
import { debtors, formatDate, formatKurus, formatPhoneTR } from '@piston/core';
import { router } from 'expo-router';
import { useMemo } from 'react';

import { Button, Card, Empty, Muted, Row, Screen, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { notify } from '@/lib/confirm';
import { openWhatsApp } from '@/lib/share-record';

export default function Debtors() {
  const { records, business } = useBusiness();
  const list = useMemo(() => debtors(records), [records]);
  const total = list.reduce((s, d) => s + d.debtKurus, 0);

  const remind = async (d: (typeof list)[number]) => {
    const lines = d.records.map((r) => `• ${formatDate(r.date)} · ${r.plate}: ${formatKurus(r.balanceKurus)}`);
    const text = [
      `Merhaba ${d.customerName}, ${business?.name ?? 'servisimiz'} olarak hatırlatma:`,
      '',
      ...lines,
      '',
      `Toplam kalan: ${formatKurus(d.debtKurus)}`,
      'Teşekkür ederiz.',
    ].join('\n');
    if (!(await openWhatsApp(d.customerPhone, text))) notify('WhatsApp açılamadı', 'Telefonunda WhatsApp yüklü mü?');
  };

  return (
    <Screen title="Borçlu müşteriler" back>
      <Card style={{ gap: 2 }}>
        <Muted small>Toplam alacak</Muted>
        <Text v="display" color={total > 0 ? colors.warn : colors.text}>{formatKurus(total)}</Text>
        <Muted small>{`${list.length} müşteri · tamamlanan kayıtlardan`}</Muted>
      </Card>
      <Stack gap={space.sm} style={{ marginTop: space.lg }}>
        {list.length === 0 ? (
          <Empty title="Borçlu müşteri yok" body="Tamamlanan kayıtların hepsi ödenmiş. Ödeme, kayıt sayfasındaki 'Ödeme al' ile girilir." />
        ) : list.map((d) => (
          <Card key={d.customerId} style={{ gap: 6 }} onPress={() => router.push(`/servis/musteri/${d.customerId}`)} accessibilityLabel={`${d.customerName}, borç ${formatKurus(d.debtKurus)}`}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text v="bodyStrong" style={{ flex: 1 }}>{d.customerName}</Text>
              <Text v="bodyStrong" color={colors.warn}>{formatKurus(d.debtKurus)}</Text>
            </Row>
            <Muted small>{`${formatPhoneTR(d.customerPhone)} · ${d.records.length} kayıt · en eski ${formatDate(d.oldestDate)}`}</Muted>
            <Row gap={space.sm}>
              <Button title="WhatsApp ile hatırlat" icon="forum" small onPress={() => remind(d)} />
            </Row>
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}
