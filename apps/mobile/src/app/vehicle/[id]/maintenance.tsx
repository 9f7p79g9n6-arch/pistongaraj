import { computeDue, formatDate, formatKm, formatTL, sortByUrgency, STATUS_LABEL, type DueStatus } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { MaintenanceCard } from '@/components/vehicle';
import { Button, Card, Empty, IconButton, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useApp, useVehicle } from '@/data/store';

const GROUPS: DueStatus[] = ['overdue', 'due_soon', 'ok', 'unknown'];

export default function Maintenance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicle, bundle } = useVehicle(id);
  const { today } = useApp();

  const items = useMemo(
    () => (vehicle ? sortByUrgency(bundle.rules.map((rule) => ({ rule, due: computeDue(rule, vehicle.odometerKm, today) }))) : []),
    [vehicle, bundle.rules, today],
  );
  if (!vehicle) return null;
  const count = (s: DueStatus) => items.filter((i) => i.due.status === s).length;

  return (
    <Screen title="Bakım" back right={<IconButton icon="plus" label="Hatırlatma ekle" onPress={() => router.push(`/vehicle/${vehicle.id}/rule`)} />}>
      <Row gap={space.sm}>
        {(['overdue', 'due_soon', 'ok'] as const).map((s) => (
          <Card key={s} style={{ flex: 1, padding: space.md }}>
            <Muted small>{STATUS_LABEL[s]}</Muted>
            <Text v="number" color={count(s) === 0 ? colors.text : s === 'overdue' ? colors.danger : s === 'due_soon' ? colors.warn : colors.text}>{count(s)}</Text>
          </Card>
        ))}
      </Row>

      {items.length === 0 ? (
        <View style={{ marginTop: space.xl }}>
          <Empty title="Takip edilen kalem yok" body="Motor yağı, triger, muayene, sigorta gibi kalemleri ekle. Aralığı sen belirlersin; hangisi önce dolarsa haber veririz."
            action="İlk hatırlatmayı ekle" onAction={() => router.push(`/vehicle/${vehicle.id}/rule`)} />
        </View>
      ) : (
        GROUPS.filter((g) => count(g) > 0).map((g) => (
          <Section key={g} title={STATUS_LABEL[g]}>
            <Stack>
              {items.filter((i) => i.due.status === g).map((i) => (
                <MaintenanceCard key={i.rule.id} item={i} onPress={() => router.push(`/vehicle/${vehicle.id}/rule?ruleId=${i.rule.id}`)} />
              ))}
            </Stack>
          </Section>
        ))
      )}

      {bundle.rules.some((r) => r.itemKey === 'inspection') && (
        <Button title="Muayene hazırlık listesi" icon="shield" variant="ghost" style={{ marginTop: space.lg }} onPress={() => router.push(`/vehicle/${vehicle.id}/inspection`)} />
      )}

      <Section title="Geçmiş" action="İşlem ekle" onAction={() => router.push(`/vehicle/${vehicle.id}/log`)}>
        {bundle.events.length === 0 ? (
          <Muted small>Henüz yapılan işlem kaydı yok. Bir bakım yaptırdığında “İşlem ekle” ile kaydet; sayaç sıfırlanır.</Muted>
        ) : (
          <Card style={{ gap: space.md }}>
            {bundle.events.map((e) => (
              <View key={e.id} style={{ gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text v="smallStrong" style={{ flexShrink: 1 }}>{e.title}</Text>
                  {e.cost != null && <Text v="smallStrong">{formatTL(e.cost, 0)}</Text>}
                </Row>
                <Muted small>{[formatDate(e.performedOn), e.odometerKm != null ? formatKm(e.odometerKm) : null, e.performedBy, e.hasDocument ? 'Fatura ekli' : null].filter(Boolean).join(' · ')}</Muted>
              </View>
            ))}
          </Card>
        )}
      </Section>

      <Button title="Yapılan işlemi kaydet" variant="primary" icon="check" style={{ marginTop: space.xl }} onPress={() => router.push(`/vehicle/${vehicle.id}/log`)} />
      <Muted small style={{ marginTop: space.md }}>
        Aralıklar senin girdiğin değerlerdir; her kalemde kaynağı yazar. Kesin bilgi için aracının kullanım kılavuzuna ya da servise başvur.
      </Muted>
    </Screen>
  );
}
