import {
  normalizePlate,
  parseNumberTR,
  validateModelYear,
  validatePlate,
  validateVin,
  type FuelType,
  type Transmission,
  type VehicleType,
} from '@piston/core';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/icons';
import { CarArt, FUEL_LABEL, GEAR_LABEL } from '@/components/vehicle';
import { Button, Card, Chip, ErrorText, Field, Muted, Row, Screen, Segmented, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { useApp } from '@/data/store';

// Katalog tabloları dolana kadar en yaygın markalar hızlı seçim olarak sunulur; serbest yazım da mümkün.
const POPULAR = ['Renault', 'Fiat', 'Volkswagen', 'Ford', 'Toyota', 'Hyundai', 'Peugeot', 'Opel', 'Dacia', 'Honda', 'BMW', 'Mercedes-Benz', 'Togg'];

export default function NewVehicle() {
  const { run, selectVehicle } = useApp();
  const [type, setType] = useState<VehicleType>('car');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [engine, setEngine] = useState('');
  const [fuel, setFuel] = useState<FuelType>('gasoline');
  const [gear, setGear] = useState<Transmission>('manual');
  const [km, setKm] = useState('');
  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.7 });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  };

  const save = async () => {
    const e: Record<string, string> = {};
    const yearN = parseNumberTR(year);
    const kmN = parseNumberTR(km);
    if (!make.trim()) e.make = 'Markayı yaz ya da seç.';
    if (!model.trim()) e.model = 'Modeli yaz.';
    const ye = validateModelYear(yearN);
    if (ye) e.year = ye;
    if (kmN == null || kmN < 0 || kmN > 2_000_000 || !Number.isInteger(kmN)) e.km = 'Kilometreyi tam sayı olarak gir. Örn. 86.300';
    const pe = validatePlate(plate);
    if (pe) e.plate = pe;
    const ve = validateVin(vin);
    if (ve) e.vin = ve;
    setErrors(e);
    setFormErr(null);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      const v = await run((r) => r.addVehicle({
        vehicleType: type, make: make.trim(), model: model.trim(), modelYear: yearN!, engineLabel: engine.trim() || null,
        fuelType: fuel, transmission: gear, odometerKm: kmN!, plate: plate.trim() ? normalizePlate(plate) : null,
        vin: vin.trim() || null, photoUri: photo,
      }));
      selectVehicle(v.id);
      router.replace(`/vehicle/${v.id}/maintenance`);
    } catch (err) {
      setFormErr(err instanceof RepoError ? err.message : 'Araç kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Araç ekle" back footer={<Button title="Garaja ekle" variant="primary" onPress={save} loading={busy} />}>
      <Stack gap={space.lg}>
        <Segmented<VehicleType> value={type} onChange={setType} options={[
          { value: 'car', label: 'Otomobil' }, { value: 'commercial', label: 'Ticari' },
        ]} />

        <Stack gap={space.sm}>
          <Field label="Marka" value={make} onChangeText={setMake} placeholder="Örn. Ford" error={errors.make} autoCapitalize="words" />
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {POPULAR.map((b) => <Chip key={b} label={b} selected={make === b} onPress={() => setMake(b)} />)}
          </Row>
        </Stack>

        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Field label="Model" value={model} onChangeText={setModel} placeholder="Örn. Focus" error={errors.model} />
          <Field label="Model yılı" value={year} onChangeText={setYear} placeholder="2019" keyboardType="number-pad" maxLength={4} error={errors.year} />
        </Row>
        <Field label="Motor (isteğe bağlı)" value={engine} onChangeText={setEngine} placeholder="Örn. 1.5 TDCi 120 PS" />

        <Stack gap={space.sm}>
          <Text v="smallStrong" color={colors.textMuted}>Yakıt</Text>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {(Object.keys(FUEL_LABEL) as FuelType[]).map((f) => <Chip key={f} label={FUEL_LABEL[f]} selected={fuel === f} onPress={() => setFuel(f)} />)}
          </Row>
        </Stack>
        <Stack gap={space.sm}>
          <Text v="smallStrong" color={colors.textMuted}>Şanzıman</Text>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {(Object.keys(GEAR_LABEL) as Transmission[]).map((g) => <Chip key={g} label={GEAR_LABEL[g]} selected={gear === g} onPress={() => setGear(g)} />)}
          </Row>
        </Stack>

        <Field label="Güncel kilometre" value={km} onChangeText={setKm} placeholder="86.300" keyboardType="number-pad" error={errors.km} />
        <Field label="Plaka (isteğe bağlı)" value={plate} onChangeText={setPlate} placeholder="34 ABC 123" autoCapitalize="characters" error={errors.plate} />
        <Field label="Şasi numarası (isteğe bağlı)" value={vin} onChangeText={setVin} placeholder="17 karakter" autoCapitalize="characters"
          maxLength={20} error={errors.vin} hint="Şifrelenerek saklanır. Yalnızca parça uyumluluğu için kullanılır." autoCorrect={false} />

        <Card onPress={pickPhoto} accessibilityLabel="Araç fotoğrafı ekle">
          {photo ? <CarArt photoUrl={photo} /> : (
            <Row>
              <Icon name="camera" />
              <View style={{ flex: 1 }}>
                <Text v="bodyStrong">Araç fotoğrafı ekle</Text>
                <Muted small>İsteğe bağlı · galeriden seç</Muted>
              </View>
            </Row>
          )}
        </Card>

        <ErrorText>{formErr}</ErrorText>
        <Muted small>Kaydettikten sonra bakım aralıklarını sen belirlersin. Doğrulanmamış üretici aralıklarını kesin bilgi gibi göstermeyiz.</Muted>
      </Stack>
    </Screen>
  );
}
