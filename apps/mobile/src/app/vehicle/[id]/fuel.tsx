import { consumption, EXPENSE_LABEL, formatDate, formatNumber, formatTL, monthLong, monthlyTotals, yearlyEstimate } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ConsumptionLine, MonthlyBars } from '@/components/charts';
import { Icon } from '@/components/icons';
import { Button, Card, Empty, IconButton, Muted, Pill, Row, Screen, Section, Segmented, Stat, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useApp, useVehicle } from '@/data/store';
import { confirm } from '@/lib/confirm';

export default function FuelAndExpenses() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicle, bundle } = useVehicle(id);
  const { today, run } = useApp();
  const [tab, setTab] = useState<'fuel' | 'expense'>('fuel');

  const s = useMemo(() => {
    const months = monthlyTotals(today, 6, bundle.fuel, bundle.expenses, bundle.events);
    const year = monthlyTotals(today, 12, bundle.fuel, bundle.expenses, bundle.events);
    return { cons: consumption(bundle.fuel), months, yearly: yearlyEstimate(year), current: months[months.length - 1]! };
  }, [bundle, today]);

  if (!vehicle) return null;
  const unit = vehicle.fuelType === 'electric' ? 'kWh' : 'L';

  const delFuel = async (fid: string) => {
    if (await confirm('Kaydı sil', 'Bu yakıt kaydı silinsin mi?', 'Sil', true)) await run((r) => r.deleteFuel(fid));
  };
  const delExp = async (eid: string) => {
    if (await confirm('Kaydı sil', 'Bu masraf kaydı silinsin mi?', 'Sil', true)) await run((r) => r.deleteExpense(eid));
  };

  return (
    <Screen title="Yakıt ve masraf" back
      right={<IconButton icon="plus" label={tab === 'fuel' ? 'Yakıt ekle' : 'Masraf ekle'} accent
        onPress={() => router.push(`/vehicle/${vehicle.id}/${tab === 'fuel' ? 'add-fuel' : 'add-expense'}`)} />}>
      <Row gap={space.sm}>
        <Stat label="100 km ortalama" value={s.cons.averagePer100 ? `${formatNumber(s.cons.averagePer100, 2)} ${unit}` : '—'} note="tam depodan tam depoya" />
        <Stat label="Km başına yakıt" value={s.cons.costPerKm ? formatTL(s.cons.costPerKm) : '—'} note={s.cons.measuredKm ? `${formatNumber(s.cons.measuredKm)} km ölçüldü` : 'ölçüm yok'} />
      </Row>
      <Row gap={space.sm} style={{ marginTop: space.sm }}>
        <Stat label={`${monthLong(s.current.month)} gideri`} value={formatTL(s.current.total, 0)} />
        <Stat label="Yıllık tahmin" value={s.yearly ? formatTL(s.yearly, 0) : '—'} note="girilen aylardan" />
      </Row>

      <Section title="Aylık giderler">
        <Card><MonthlyBars rows={s.months} /></Card>
      </Section>
      <Section title={`Tüketim (${unit}/100 km)`}>
        <Card><ConsumptionLine points={s.cons.points} unit={unit} /></Card>
      </Section>

      <View style={{ marginTop: space.xl }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'fuel', label: `Yakıt (${bundle.fuel.length})` }, { value: 'expense', label: `Masraf (${bundle.expenses.length})` }]} />
      </View>

      <View style={{ marginTop: space.md }}>
        {tab === 'fuel' ? (
          bundle.fuel.length === 0 ? (
            <Empty title="Yakıt kaydı yok" body="Her dolumda litre, fiyat ve kilometreyi gir. Tüketim iki tam dolum arasında hesaplanır."
              action="Yakıt ekle" onAction={() => router.push(`/vehicle/${vehicle.id}/add-fuel`)} />
          ) : (
            <Card style={{ paddingVertical: space.sm }}>
              {bundle.fuel.map((f) => (
                <Row key={f.id} style={{ paddingVertical: space.sm }}>
                  <Icon name="fuel" size={18} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text v="smallStrong">{formatNumber(f.quantity, 1)} {f.unit} · {formatTL(f.totalAmount)}</Text>
                    <Muted small>{formatDate(f.filledOn)} · {formatNumber(f.odometerKm)} km · {formatTL(f.unitPrice)}/{f.unit}</Muted>
                  </View>
                  <Pill tone={f.isFullTank ? 'neutral' : 'info'}>{f.isFullTank ? 'Tam' : 'Kısmi'}</Pill>
                  <IconButton icon="trash" label="Kaydı sil" onPress={() => delFuel(f.id)} />
                </Row>
              ))}
            </Card>
          )
        ) : bundle.expenses.length === 0 ? (
          <Empty title="Masraf kaydı yok" body="Sigorta, muayene, otopark, köprü-otoyol, yıkama gibi giderleri ekle."
            action="Masraf ekle" onAction={() => router.push(`/vehicle/${vehicle.id}/add-expense`)} />
        ) : (
          <Card style={{ paddingVertical: space.sm }}>
            {bundle.expenses.map((e) => (
              <Row key={e.id} style={{ paddingVertical: space.sm }}>
                <Icon name="doc" size={18} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text v="smallStrong">{EXPENSE_LABEL[e.category]} · {formatTL(e.amount)}</Text>
                  <Muted small>{formatDate(e.spentOn)}{e.note ? ` · ${e.note}` : ''}</Muted>
                </View>
                <IconButton icon="trash" label="Kaydı sil" onPress={() => delExp(e.id)} />
              </Row>
            ))}
          </Card>
        )}
      </View>

      <Row gap={space.sm} style={{ marginTop: space.lg }}>
        <Button title="Yakıt ekle" icon="fuel" variant="primary" style={{ flex: 1 }} onPress={() => router.push(`/vehicle/${vehicle.id}/add-fuel`)} />
        <Button title="Masraf ekle" icon="doc" style={{ flex: 1 }} onPress={() => router.push(`/vehicle/${vehicle.id}/add-expense`)} />
      </Row>
      <Muted small style={{ marginTop: space.md }}>Kısmi dolumlar bir sonraki tam dolumda hesaba katılır. Bakım işlemlerinin tutarı “Bakım” olarak sayılır.</Muted>
    </Screen>
  );
}
