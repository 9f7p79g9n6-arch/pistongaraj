import { normalizePlate, parseNumberTR, validateModelYear, validatePlate } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Chip, ErrorText, Field, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';

export default function AddVehicle() {
  const biz = useBusiness();
  const params = useLocalSearchParams<{ musteri?: string }>();
  const [customerId, setCustomerId] = useState<string | null>(params.musteri ?? null);
  const [q, setQ] = useState('');
  const [plate, setPlate] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [engine, setEngine] = useState('');
  const [km, setKm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customer = biz.customers.find((c) => c.id === customerId);
  const existing = plate.trim() ? biz.vehicles.find((v) => v.plate === normalizePlate(plate)) : undefined;
  const matches = q.trim() ? biz.customers.filter((c) => c.fullName.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))).slice(0, 6) : [];

  const save = async () => {
    setErr(null);
    if (!customer) return setErr('Aracın sahibi olan müşteriyi seç.');
    const pe = validatePlate(plate) ?? (plate.trim() ? null : 'Plaka gerekli.');
    if (pe) return setErr(pe);
    if (!make.trim() || !model.trim()) return setErr('Marka ve model gerekli.');
    const y = year.trim() ? Number(year) : null;
    if (y != null) { const ye = validateModelYear(y); if (ye) return setErr(ye); }
    const k = km.trim() ? parseNumberTR(km) : null;
    if (km.trim() && (k == null || k < 0 || k > 2_000_000)) return setErr('Kilometreyi rakamla yaz.');
    setBusy(true);
    try {
      const v = await biz.run((r) => r.addVehicle({
        businessId: biz.business!.id, customerId: customer.id, plate, make, model, modelYear: y,
        engineLabel: engine.trim() || null, odometerKm: k == null ? null : Math.round(k),
      }));
      router.replace(`/servis/arac/${v.id}`);
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Araç eklenemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Araç ekle" back footer={<Button title="Aracı kaydet" variant="primary" onPress={save} loading={busy} disabled={!!existing} />}>
      <Section title="Araç sahibi">
        {customer ? (
          <Card style={{ gap: 2 }}>
            <Text v="bodyStrong">{customer.fullName}</Text>
            {!params.musteri && <Button title="Değiştir" small variant="ghost" onPress={() => setCustomerId(null)} />}
          </Card>
        ) : (
          <Stack gap={space.sm}>
            <Field label="Müşteri ara" value={q} onChangeText={setQ} placeholder="Ad soyad" />
            <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
              {matches.map((c) => <Chip key={c.id} label={c.fullName} onPress={() => setCustomerId(c.id)} />)}
            </Row>
            <Button title="Yeni müşteri ekle" small icon="plus" onPress={() => router.push('/servis/musteri-ekle')} />
          </Stack>
        )}
      </Section>
      <Section title="Araç">
        <Field label="Plaka" value={plate} onChangeText={setPlate} autoCapitalize="characters" placeholder="34 ABC 123" />
        {existing && (
          <Card highlight onPress={() => router.replace(`/servis/arac/${existing.id}`)}>
            <Text v="bodyStrong">Bu plaka zaten kayıtlı</Text>
            <Muted small>Araç sayfasını açmak için dokun.</Muted>
          </Card>
        )}
        <Row>
          <Field label="Marka" value={make} onChangeText={setMake} />
          <Field label="Model" value={model} onChangeText={setModel} />
        </Row>
        <Row>
          <Field label="Model yılı" value={year} onChangeText={setYear} keyboardType="number-pad" />
          <Field label="Kilometre" value={km} onChangeText={setKm} keyboardType="number-pad" />
        </Row>
        <Field label="Motor (isteğe bağlı)" value={engine} onChangeText={setEngine} placeholder="1.5 TDCi 120 HP" />
      </Section>
      <ErrorText>{err}</ErrorText>
    </Screen>
  );
}
