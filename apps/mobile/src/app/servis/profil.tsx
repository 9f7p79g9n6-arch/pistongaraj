import { router } from 'expo-router';
import { useState } from 'react';

import { BusinessForm, toBusinessInput } from '@/components/business-form';
import { Button, Card, ErrorText, Field, Muted, Screen, Section, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';
import { notify } from '@/lib/confirm';

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
