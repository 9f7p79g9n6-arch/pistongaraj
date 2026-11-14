import { formatNumber, formatTL, fuelTotal, parseDateTR, parseNumberTR, toDateTR, validateFuelEntry } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, ErrorText, Field, Muted, Row, Screen, Stack, Text, Toggle } from '@/components/ui';
import { space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { useApp, useVehicle } from '@/data/store';

export default function AddFuel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicle, bundle } = useVehicle(id);
  const { run, today } = useApp();
  const last = bundle.fuel[0]; // km'ye göre azalan sırada
  const [date, setDate] = useState(toDateTR(today));
  const [km, setKm] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState(last ? formatNumber(last.unitPrice, 2) : '');
  const [full, setFull] = useState(true);
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!vehicle) return null;

  const unit = vehicle.fuelType === 'electric' ? 'kWh' : 'L';
  const q = parseNumberTR(qty);
  const p = parseNumberTR(price);
  const total = q && p ? fuelTotal(q, p) : null;

  const save = async () => {
    const d = parseDateTR(date);
    const k = parseNumberTR(km);
    const e: string[] = [];
    if (!d) e.push('Tarihi GG.AA.YYYY biçiminde gir.');
    else if (d > today) e.push('İleri tarihli kayıt girilemez.');
    if (d) e.push(...validateFuelEntry({ odometerKm: k, quantity: q, unitPrice: p, filledOn: d }, bundle.fuel, unit));
    setErrs(e);
    if (e.length) return;
    setBusy(true);
    try {
      await run((r) => r.addFuel({
        vehicleId: vehicle.id, filledOn: d!, odometerKm: Math.round(k!), quantity: q!, unit, unitPrice: p!,
        totalAmount: total!, isFullTank: full, fuelType: vehicle.fuelType,
      }));
      router.back();
    } catch (err) {
      setErrs([err instanceof RepoError ? err.message : 'Kaydedilemedi.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Yakıt kaydı" back footer={<Button title="Kaydet" variant="primary" onPress={save} loading={busy} />}>
      <Stack gap={space.lg}>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Field label="Tarih" value={date} onChangeText={setDate} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />
          <Field label="Kilometre" value={km} onChangeText={setKm} keyboardType="number-pad"
            placeholder={last ? `> ${formatNumber(last.odometerKm)}` : formatNumber(vehicle.odometerKm)} />
        </Row>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Field label={`Miktar (${unit})`} value={qty} onChangeText={setQty} placeholder="45,0" keyboardType="decimal-pad" />
          <Field label={`Birim fiyat (₺/${unit})`} value={price} onChangeText={setPrice} placeholder="63,50" keyboardType="decimal-pad" />
        </Row>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>Tutar</Muted>
            <Text v="number">{total != null ? formatTL(total) : '—'}</Text>
          </Row>
        </Card>
        <Toggle label="Depo tamamen doldu" hint="Doğru tüketim hesabı için gerekli. Kısmi dolum bir sonraki tam dolumda hesaba katılır." value={full} onChange={setFull} />
        {errs.map((e) => <ErrorText key={e}>{e}</ErrorText>)}
        <Muted small>Fiş fotoğrafından otomatik doldurma Aşama 2’de geliyor.</Muted>
      </Stack>
    </Screen>
  );
}
