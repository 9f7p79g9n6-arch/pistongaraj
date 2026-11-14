import { checkOdometerUpdate, formatNumber, parseNumberTR } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Field, Muted, Screen, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { useApp, useVehicle } from '@/data/store';

export default function Odometer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicle } = useVehicle(id);
  const { run } = useApp();
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!vehicle) return null;

  const save = async () => {
    const n = parseNumberTR(value);
    const check = checkOdometerUpdate(vehicle.odometerKm, n == null ? null : Math.round(n));
    setErr(check.error);
    if (check.error) return;
    if (check.warning && warn !== check.warning) {
      setWarn(check.warning);
      return; // ikinci basışta kaydeder
    }
    setBusy(true);
    try {
      await run((r) => r.updateVehicle(vehicle.id, { odometerKm: Math.round(n!) }));
      router.back();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Kilometre" back>
      <Stack gap={space.lg}>
        <Muted>Son kayıt: {formatNumber(vehicle.odometerKm)} km. Hatırlatmalar yeni değere göre hesaplanır.</Muted>
        <Field label="Güncel kilometre" value={value} onChangeText={(t) => { setValue(t); setWarn(null); }}
          placeholder={formatNumber(vehicle.odometerKm)} keyboardType="number-pad" autoFocus />
        <ErrorText>{err}</ErrorText>
        {warn && <Text v="smallStrong" color={colors.warn}>{warn} Eminsen tekrar Kaydet’e bas.</Text>}
        <Button title="Kaydet" variant="primary" onPress={save} loading={busy} />
      </Stack>
    </Screen>
  );
}
