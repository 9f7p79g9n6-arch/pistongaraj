/**
 * Teklif talebi: servis (sorun/iş) ya da parça. Araç garajdan seçilir; plaka paylaşılmaz (yalnızca marka, model, yıl, km).
 * Rehberden bir işletme seçildiyse talep yalnızca ona gider; yoksa şehirdeki ilgili kategorideki doğrulanmış işletmelere.
 */
import { formatNumber, SERVICE_DIRECTORY_CATEGORIES, validateQuoteRequest, type BusinessCategory, type QuoteKind } from '@piston/core';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { categoryLabel } from '@/components/market';
import { Button, Card, Chip, ErrorText, Field, Muted, Row, Screen, Segmented, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';
import { useApp } from '@/data/store';
import { loadCity, saveCity } from '@/lib/city';
import { CityPicker } from '@/components/place-picker';

export default function NewQuoteRequest() {
  const params = useLocalSearchParams<{ tur?: string; isletme?: string; isletmeAdi?: string }>();
  const { vehicles } = useApp();
  const [kind, setKind] = useState<QuoteKind>(params.tur === 'parca' ? 'part' : 'service');
  const [vehicleId, setVehicleId] = useState<string | null>(vehicles[0]?.id ?? null);
  const [category, setCategory] = useState<BusinessCategory>('mechanic');
  const [city, setCity] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestId] = useState(() => Crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const picked = params.isletme ? { id: params.isletme, name: params.isletmeAdi ?? 'Seçilen işletme' } : null;

  useEffect(() => { void loadCity().then((c) => setCity((v) => v || c)); }, []);

  const v = vehicles.find((x) => x.id === vehicleId) ?? null;
  const vehicleLabel = v ? `${v.make} ${v.model} ${v.modelYear}${v.engineLabel ? ` ${v.engineLabel}` : ''} · ${formatNumber(v.odometerKm)} km` : '';

  const send = async () => {
    const e = validateQuoteRequest({ kind, title, description, partName: kind === 'part' ? title : '', city, vehicleLabel });
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      await saveCity(city);
      const id = await marketRepo.createRequest({
        kind, category: kind === 'part' ? 'spare_parts' : category, city: city.trim(), vehicleLabel, title: title.trim(),
        description: description.trim(), partName: kind === 'part' ? title.trim() : '', businessIds: picked ? [picked.id] : [],
        clientRequestId: requestId,
      });
      router.replace(`/teklif/${id}`);
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Talep gönderilemedi. Tekrar dene.');
      setBusy(false);
    }
  };

  return (
    <Screen title={kind === 'part' ? 'Parça iste' : 'Servis teklifi iste'} back
      footer={<Button title="Talebi gönder" icon="send" variant="primary" onPress={send} loading={busy} />}>
      <Stack gap={space.lg}>
        {!picked && (
          <Segmented<QuoteKind> options={[{ value: 'service', label: 'Servis / onarım' }, { value: 'part', label: 'Parça' }]} value={kind} onChange={setKind} />
        )}
        {picked && (
          <Card style={{ gap: 2 }}>
            <Muted small>Talep yalnızca bu işletmeye gider</Muted>
            <Text v="bodyStrong">{picked.name}</Text>
          </Card>
        )}

        <Stack gap={space.sm}>
          <Text v="smallStrong">Araç</Text>
          {vehicles.length === 0 ? (
            <Card style={{ gap: space.sm }}>
              <Muted small>Teklif istemek için önce aracını Garajım’a ekle.</Muted>
              <Button title="Araç ekle" icon="plus" small onPress={() => router.push('/vehicle/new')} />
            </Card>
          ) : (
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {vehicles.map((x) => <Chip key={x.id} label={`${x.make} ${x.model} ${x.modelYear}`} selected={vehicleId === x.id} onPress={() => setVehicleId(x.id)} />)}
            </Row>
          )}
          {v && <Muted small>{`İşletmeler “${vehicleLabel}” bilgisini görür. Plakan paylaşılmaz.`}</Muted>}
        </Stack>

        {kind === 'service' && !picked && (
          <Stack gap={space.sm}>
            <Text v="smallStrong">Hangi alanda servis?</Text>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {SERVICE_DIRECTORY_CATEGORIES.map((c) => <Chip key={c} label={categoryLabel(c)} selected={category === c} onPress={() => setCategory(c)} />)}
            </Row>
          </Stack>
        )}

        <CityPicker value={city} onChange={setCity}
          hint={picked ? undefined : kind === 'part' ? 'Bu şehirdeki doğrulanmış yedek parçacılara gider.' : 'Bu şehirdeki doğrulanmış servislere gider (en fazla 20).'} />

        <Field label={kind === 'part' ? 'Aradığın parça' : 'Sorun ya da istediğin iş'} value={title} onChangeText={setTitle} maxLength={120}
          placeholder={kind === 'part' ? 'Örn. Ön balata takımı' : 'Örn. Frenden ses geliyor'} />
        <Field label="Açıklama (isteğe bağlı)" value={description} onChangeText={setDescription} multiline maxLength={1500}
          placeholder={kind === 'part' ? 'Varsa parça numarası, orijinal/muadil tercihin' : 'Belirtiler, ne zaman başladı, daha önce ne yapıldı'}
          style={{ minHeight: 100, textAlignVertical: 'top' }} />

        <ErrorText>{err}</ErrorText>
        <Muted small>
          Teklifler “{kind === 'part' ? 'Parçalar' : 'Servisler'} → Taleplerim”de görünür. Ödeme ve teslim işletmeyle aranızda yapılır; uygulama ödeme almaz.
          Telefonun yalnızca kabul ettiğin işletmeye görünür (Profil’de telefonun kayıtlıysa).
        </Muted>
      </Stack>
    </Screen>
  );
}
