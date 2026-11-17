import { BUSINESS_CATEGORIES, BUSINESS_STATUS_LABEL, formatPhoneTR } from '@piston/core';
import { router } from 'expo-router';

import { NextStageCard } from '@/components/servis';
import { Button, Card, Divider, ListItem, Muted, Pill, Row, Screen, Section, Stack, Text, Toggle } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
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
            <ListItem icon="doc" title="PISTON CİRO" subtitle="Ciro, gider, net kazanç, tahsilat; PDF ve Excel" onPress={() => router.push('/servis/ciro')} />
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
            PISTON SERVİS’te tutulduğu ve kaydı uygulamadan görebileceği konusunda bilgilendir. Aydınlatma metni taslağı hukuki incelemeden sonra eklenecek.
          </Muted>
        </Card>
      </Section>

      <Button title="Bireysel moda dön" icon="swap" variant="ghost" style={{ marginTop: space.xl }}
        onPress={() => { biz.setMode('personal'); router.replace('/(tabs)'); }} />
      <Muted small style={{ marginTop: space.md, textAlign: 'center' }}>
        PISTON SERVİS · Aşama 1{env.isDemo ? ' · Demo modu: veriler yalnızca bu cihazda' : ''}
      </Muted>
    </Screen>
  );
}
