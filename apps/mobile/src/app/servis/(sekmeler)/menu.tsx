import { BUSINESS_CATEGORIES, BUSINESS_STATUS_LABEL, formatPhoneTR } from '@piston/core';
import { router } from 'expo-router';
import { useState } from 'react';

import { BusinessThumb } from '@/components/market';
import { NextStageCard } from '@/components/servis';
import { Button, Card, Divider, ErrorText, Field, ListItem, Muted, Pill, Row, Screen, Section, Stack, Text, Toggle } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { env } from '@/lib/env';

const ADVANCED: { title: string; stage: string; body: string }[] = [
  { title: 'İş emirleri', stage: 'Aşama 3', body: 'Araç kabulden teslime kadar iş durumları; her değişiklik saatiyle kaydedilir.' },
  { title: 'Randevular', stage: 'Aşama 3', body: 'Günlük ve haftalık takvim, randevu durumları.' },
  { title: 'Personel', stage: 'Aşama 3', body: 'Çalışan ekleme, görev atama, yetkiye göre işlem.' },
  { title: 'Stok', stage: 'Aşama 4', body: 'Parça, stok kodu, barkod, minimum stok uyarısı, stok hareketleri.' },
];

export default function Menu() {
  const biz = useBusiness();
  const b = biz.business;
  if (!b) return <Screen title="Menü">{null}</Screen>;
  const category = BUSINESS_CATEGORIES.find((c) => c.value === b.category)?.label;

  return (
    <Screen title="Menü">
      <Card style={{ gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <BusinessThumb url={b.logoUrl} size={40} />
          <Text v="section" style={{ flex: 1 }} numberOfLines={1}>{b.name}</Text>
          <Pill tone={b.status === 'active' ? 'ok' : b.status === 'suspended' ? 'bad' : 'warn'}>{BUSINESS_STATUS_LABEL[b.status]}</Pill>
        </Row>
        <Muted small>{[category, `${b.district} / ${b.city}`, formatPhoneTR(b.phone)].join(' · ')}</Muted>
        {b.status === 'pending_verification' && (
          <Muted small>İşletmen doğrulanana kadar müşteriler kayıtlarında “İşletme henüz doğrulanmadı” notunu görür.</Muted>
        )}
      </Card>

      <Section title="Kayıtlar">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="users" title="Müşteriler" subtitle={`${biz.customers.length} müşteri · ara, ekle, borç durumu`} onPress={() => router.push('/servis/musteriler')} />
          <Divider />
          <ListItem icon="car" title="Araçlar" subtitle={`${biz.vehicles.length} araç · plaka ile bul`} onPress={() => router.push('/servis/araclar')} />
          <Divider />
          <ListItem icon="send" title="Teklif talepleri" subtitle="Araç sahiplerinden gelen servis ve parça talepleri" onPress={() => router.push('/servis/talepler')} />
        </Card>
      </Section>

      <Section title="İşletme">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="store" title="İşletme bilgileri" subtitle="Ad, adres, iletişim, vergi bilgileri" onPress={() => router.push('/servis/profil')} />
          {biz.businesses.length > 1 && biz.businesses.filter((x) => x.id !== b.id).map((x) => (
            <Stack key={x.id} gap={0}>
              <Divider />
              <ListItem icon="swap" title={`${x.name} işletmesine geç`} onPress={() => biz.selectBusiness(x.id)} />
            </Stack>
          ))}
          {biz.businesses.length < 3 && (
            <>
              <Divider />
              <ListItem icon="plus" title="Başka işletme ekle" onPress={() => router.push('/servis/isletme-ac')} />
            </>
          )}
        </Card>
      </Section>

      {biz.canFinance && (
        <Section title="Finans">
          <Card style={{ paddingVertical: 0 }}>
            <ListItem icon="doc" title="OTOM CİRO" subtitle="Ciro, gider, net kazanç, tahsilat; PDF ve Excel" onPress={() => router.push('/servis/ciro')} />
            <Divider />
            <ListItem icon="users" title="Borçlu müşteriler" subtitle="Ödenmemiş tutarlar ve hatırlatma" onPress={() => router.push('/servis/borclular')} />
          </Card>
        </Section>
      )}

      <Section title="Kullanım">
        <Card>
          <Toggle label="Gelişmiş mod" hint="İş emri, personel, stok, rapor gibi bölümleri gösterir. Kullanmak zorunlu değil."
            value={biz.advanced} onChange={biz.setAdvanced} />
        </Card>
      </Section>

      {biz.advanced && (
        <Section title="Gelişmiş bölümler">
          <Stack gap={space.sm}>
            {ADVANCED.map((a) => <NextStageCard key={a.title} {...a} />)}
          </Stack>
        </Section>
      )}

      <Section title="Kişisel veriler">
        <Card style={{ gap: 4 }}>
          <Muted small>
            Müşteri adı, telefonu ve plakası işletmenin kendi müşteri kaydıdır; bu verilerin sorumlusu işletmedir. Müşterini, bilgilerinin
            OTOM SERVİS’te tutulduğu ve kaydı uygulamadan görebileceği konusunda bilgilendir. Aydınlatma metni taslağı hukuki incelemeden sonra eklenecek.
          </Muted>
        </Card>
      </Section>

      {b.role === 'owner' && <DeleteBusiness />}

      <Button title="Bireysel moda dön" icon="swap" variant="ghost" style={{ marginTop: space.xl }}
        onPress={() => { biz.setMode('personal'); router.replace('/(tabs)'); }} />
      <Muted small style={{ marginTop: space.md, textAlign: 'center' }}>
        OTOM SERVİS · Aşama 1{env.isDemo ? ' · Demo modu: veriler yalnızca bu cihazda' : ''}
      </Muted>
    </Screen>
  );
}

/** İşletmeyi silme (yalnızca sahip). İşletme adı yazılarak onaylanır; yanlışlıkla silinmesin diye iki adımlı. */
function DeleteBusiness() {
  const biz = useBusiness();
  const b = biz.business!;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const others = biz.businesses.filter((x) => x.id !== b.id).length;

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await biz.run((x) => x.deleteBusiness(b.id, name));
      if (others === 0) {
        biz.setMode('personal');
        router.replace('/(tabs)');
      }
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'İşletme silinemedi. Tekrar dene.');
      setBusy(false);
    }
  };

  return (
    <Section title="Tehlikeli bölge">
      {!open ? (
        <Button title="İşletmeyi sil" icon="trash" variant="ghost" onPress={() => { setOpen(true); setName(''); setErr(null); }} />
      ) : (
        <Card style={{ gap: space.md, borderColor: colors.danger }}>
          <Text v="bodyStrong" color={colors.danger}>{`“${b.name}” silinsin mi?`}</Text>
          <Muted small>
            İşletme; müşterileri, araçları, servis kayıtları, ödemeleri, giderleri ve forum paylaşımlarıyla birlikte uygulamadan kalkar.
            Müşteriler de bu işletmenin kayıtlarını artık görmez. Mali kayıtlar yasal saklama için sunucuda kapalı olarak tutulur.
            Bu işlem uygulamadan geri alınamaz.
          </Muted>
          <Field label="Onaylamak için işletme adını yaz" value={name} onChangeText={setName} placeholder={b.name} autoCapitalize="none" />
          <ErrorText>{err}</ErrorText>
          <Row gap={space.sm}>
            <Button title="Vazgeç" style={{ flex: 1 }} onPress={() => setOpen(false)} />
            <Button title="Kalıcı olarak sil" variant="danger" style={{ flex: 1 }} onPress={remove} loading={busy}
              disabled={name.trim().toLocaleLowerCase('tr') !== b.name.trim().toLocaleLowerCase('tr')} />
          </Row>
        </Card>
      )}
    </Section>
  );
}
