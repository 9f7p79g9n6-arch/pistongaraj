import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { BusinessForm, toBusinessInput } from '@/components/business-form';
import { Icon } from '@/components/icons';
import { Button, Card, Divider, ErrorText, Field, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';
import { notify } from '@/lib/confirm';
import { openDirections } from '@/lib/directions';
import { pickServicePhoto } from '@/lib/photo';

export default function BusinessProfile() {
  const biz = useBusiness();
  const b = biz.business;
  if (!b) return <Screen title="İşletme bilgileri" back>{null}</Screen>;
  return (
    <Screen title="İşletme bilgileri" back>
      {marketRepo.available && <PublicProfileCard key={`p-${b.id}`} />}
      <Section title="Kayıt bilgileri">
        <BusinessForm
          key={b.id}
          initial={toBusinessInput(b)}
          submitLabel="Kaydet"
          onSubmit={async (input) => {
            await biz.run((r) => r.updateBusiness(b.id, input));
            notify('Kaydedildi');
            router.back();
          }}
        />
      </Section>
    </Screen>
  );
}

/** Rehberde (araç sahiplerinin "Servisler" ve "Parçalar" ekranlarında) görünen tanıtım ve çalışma saatleri */
function PublicProfileCard() {
  const biz = useBusiness();
  const b = biz.business!;
  const [description, setDescription] = useState(b.description ?? '');
  const [hours, setHours] = useState(b.workingHours ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await marketRepo.updatePublicProfile(b.id, description, hours);
      await biz.refresh();
      setDone(true);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space.md }}>
      <Text v="bodyStrong">Rehberde görünen bilgiler</Text>
      <BusinessPhoto />
      <Divider />
      <BusinessLocation />
      <Divider />
      <Muted small>
        {b.status === 'active'
          ? 'İşletmen doğrulandı: araç sahipleri seni Servisler ya da Parçalar rehberinde görür.'
          : 'İşletmen doğrulanınca araç sahiplerinin rehberinde görünürsün. Bu bilgileri şimdiden doldurabilirsin.'}
      </Muted>
      <Field label="Tanıtım (isteğe bağlı)" value={description} onChangeText={(t) => { setDescription(t); setDone(false); }} multiline maxLength={500}
        placeholder="Örn. 20 yıllık tecrübe, Fiat ve Renault uzmanı, garantili işçilik" />
      <Field label="Çalışma saatleri (isteğe bağlı)" value={hours} onChangeText={(t) => { setHours(t); setDone(false); }} maxLength={120}
        placeholder="Örn. Hafta içi 08:30–19:00, Cumartesi 09:00–14:00" />
      <ErrorText>{err}</ErrorText>
      {done && <Text v="small" color="#1E7D53">Kaydedildi.</Text>}
      <Button title="Rehber bilgilerini kaydet" variant="outline" onPress={save} loading={busy} />
    </Card>
  );
}

/**
 * Dükkân konumu: sahip ya da yönetici dükkândayken telefonun konumunu bir kez kaydeder.
 * Araç sahipleri işletme sayfasında adrese ya da "Yol tarifi al"a dokununca harita doğrudan bu noktaya rota açar.
 */
function BusinessLocation() {
  const biz = useBusiness();
  const b = biz.business!;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canManage = b.role === 'owner' || b.role === 'manager';
  const saved = b.latitude != null && b.longitude != null;

  const save = async (clear: boolean) => {
    setErr(null);
    setBusy(true);
    try {
      let loc: { latitude: number; longitude: number } | null = null;
      if (!clear) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          setErr('Konum izni verilmedi. Telefonun Ayarlar > OTOM > Konum bölümünden "Uygulamayı Kullanırken" seçebilirsin.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        loc = { latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) };
        if (loc.latitude < 34 || loc.latitude > 44 || loc.longitude < 24 || loc.longitude > 47) {
          setErr('Bulunan konum Türkiye dışında görünüyor. Dükkândayken tekrar dene.');
          return;
        }
      }
      await marketRepo.setBusinessLocation(b.id, loc);
      await biz.refresh();
      if (loc) notify('Konum kaydedildi', 'Araç sahipleri artık yol tarifiyle doğrudan dükkânına gelebilir.');
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Konum alınamadı. Konum servislerinin açık olduğundan emin olup tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={space.sm}>
      <Text v="smallStrong">Dükkân konumu</Text>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Icon name="pin" size={18} color={saved ? '#1E7D53' : colors.iconMuted} />
        <Muted small style={{ flex: 1 }}>
          {saved
            ? 'Konumun kayıtlı. Araç sahipleri adresine dokununca harita doğrudan dükkânına yol tarifi açar.'
            : 'Dükkândayken konumunu kaydet; araç sahipleri adresine dokununca harita doğrudan dükkânına yol tarifi açsın. Kaydetmezsen yol tarifi yazdığın adrese göre aranır.'}
        </Muted>
      </Row>
      {canManage ? (
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Button title={saved ? 'Konumu güncelle' : 'Şu an dükkândayım, konumu kaydet'} icon="pin" small onPress={() => save(false)} loading={busy} />
          {saved ? <Button title="Haritada gör" small variant="ghost" onPress={() => void openDirections(b)} disabled={busy} /> : null}
          {saved ? <Button title="Kaldır" small variant="ghost" onPress={() => save(true)} disabled={busy} /> : null}
        </Row>
      ) : <Muted small>Konumu işletme sahibi kaydedebilir.</Muted>}
      <ErrorText>{err}</ErrorText>
    </Stack>
  );
}

/** İşletme fotoğrafı (logo ya da dükkân): rehberde, işletme sayfasında ve menüde görünür. Yalnızca sahip değiştirir. */
function BusinessPhoto() {
  const biz = useBusiness();
  const b = biz.business!;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isOwner = b.role === 'owner';

  const change = async (source: 'camera' | 'library' | null) => {
    setErr(null);
    let uri: string | null = null;
    if (source) {
      const res = await pickServicePhoto(source);
      if (!res.ok) {
        if (res.reason === 'denied') setErr('Kamera izni verilmedi. Ayarlardan izin verebilirsin.');
        else if (res.reason === 'failed') setErr('Fotoğraf seçilemedi. Tekrar dene.');
        return;
      }
      uri = res.uri;
    }
    setBusy(true);
    try {
      await marketRepo.setBusinessPhoto(b.id, uri);
      await biz.refresh();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Fotoğraf kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={space.sm}>
      <Text v="smallStrong">İşletme fotoğrafı</Text>
      <Row gap={space.md}>
        <View style={{ width: 84, height: 84, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          {b.logoUrl ? <Image source={{ uri: b.logoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel="İşletme fotoğrafı" />
            : <Icon name="store" size={30} color={colors.iconMuted} />}
        </View>
        <Stack gap={space.xs} style={{ flex: 1 }}>
          <Muted small>Logonu ya da dükkânının fotoğrafını ekle. Araç sahipleri rehberde bu fotoğrafı görür.</Muted>
          {isOwner ? (
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              <Button title="Fotoğraf çek" icon="camera" small onPress={() => change('camera')} loading={busy} />
              <Button title="Galeriden" small onPress={() => change('library')} disabled={busy} />
              {b.logoUrl ? <Button title="Kaldır" small variant="ghost" onPress={() => change(null)} disabled={busy} /> : null}
            </Row>
          ) : <Muted small>Fotoğrafı işletme sahibi değiştirebilir.</Muted>}
        </Stack>
      </Row>
      <ErrorText>{err}</ErrorText>
    </Stack>
  );
}
