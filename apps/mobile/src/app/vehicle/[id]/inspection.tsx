/**
 * Muayene öncesi kontrol listesi. İşaretler bu cihazda, araca ve muayene tarihine göre saklanır;
 * yeni muayene tarihinde liste sıfırdan başlar.
 */
import { computeDue, formatDate, INSPECTION_CHECKLIST, INSPECTION_INFO_URL, type ChecklistItem } from '@piston/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Button, Card, Muted, Progress, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useApp, useVehicle } from '@/data/store';

export default function Inspection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicle, bundle } = useVehicle(id);
  const { today } = useApp();
  const rule = bundle.rules.find((r) => r.itemKey === 'inspection' && r.enabled);
  const due = rule && vehicle ? computeDue(rule, vehicle.odometerKm, today) : null;
  const key = `piston-inspection-${id}-${rule?.dueOn ?? 'genel'}`;
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    AsyncStorage.getItem(key).then((v) => setDone(v ? JSON.parse(v) : {})).catch(() => setDone({}));
  }, [key]);

  const toggle = (itemId: string) => {
    setDone((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const groups = useMemo(() => {
    const m = new Map<string, ChecklistItem[]>();
    for (const i of INSPECTION_CHECKLIST) m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return [...m.entries()];
  }, []);
  const count = INSPECTION_CHECKLIST.filter((i) => done[i.id]).length;

  if (!vehicle) return null;
  return (
    <Screen title="Muayene hazırlığı" back>
      <Card style={{ gap: space.sm }}>
        {rule?.dueOn ? (
          <>
            <Text v="bodyStrong">Muayene son tarihi: {formatDate(rule.dueOn)}</Text>
            <Muted small>{due && due.daysLeft != null ? (due.daysLeft < 0 ? `${-due.daysLeft} gün geçti` : `${due.daysLeft} gün kaldı`) : ''}</Muted>
          </>
        ) : (
          <Muted small>Muayene tarihini eklersen yaklaşınca hatırlatırız: Bakım → Hatırlatma ekle → Araç muayenesi.</Muted>
        )}
        <Progress ratio={count / INSPECTION_CHECKLIST.length} tone={count === INSPECTION_CHECKLIST.length ? 'ok' : 'warn'} />
        <Muted small>{count} / {INSPECTION_CHECKLIST.length} kontrol tamam</Muted>
      </Card>

      {groups.map(([group, items]) => (
        <Section key={group} title={group}>
          <Card style={{ paddingVertical: space.sm }}>
            {items.map((i) => (
              <Pressable key={i.id} onPress={() => toggle(i.id)} accessibilityRole="checkbox" accessibilityState={{ checked: !!done[i.id] }}
                style={({ pressed }) => [{ flexDirection: 'row', gap: space.md, paddingVertical: space.sm, alignItems: 'flex-start' }, pressed && { opacity: 0.7 }]}>
                <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: done[i.id] ? colors.success : colors.line, backgroundColor: done[i.id] ? colors.success : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {done[i.id] && <Icon name="check" size={16} color={colors.onBrand} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text v="bodyStrong" color={done[i.id] ? colors.textMuted : colors.text}>{i.title}</Text>
                  <Muted small>{i.how}</Muted>
                </View>
              </Pressable>
            ))}
          </Card>
        </Section>
      ))}

      <Stack style={{ marginTop: space.xl }}>
        <Button title="Muayene randevusu ve ücretler" variant="ghost" onPress={() => Linking.openURL(INSPECTION_INFO_URL).catch(() => {})} />
        <Muted small>Liste genel bir hazırlık rehberidir. Kesin muayene kriterleri için muayene istasyonunun güncel listesine bak.</Muted>
      </Stack>
    </Screen>
  );
}
