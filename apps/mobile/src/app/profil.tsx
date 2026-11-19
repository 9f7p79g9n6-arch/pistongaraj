import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SpecialCard } from '@/components/brand';
import { MyPhoneCard } from '@/components/my-phone';
import { Button, Card, Divider, ErrorText, Field, ListItem, Muted, Pill, Screen, Section, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { serviceRepo, useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { ServiceDemoRepo } from '@/data/service-demo-repo';
import { socialRepo } from '@/data/social';
import { repo, useApp } from '@/data/store';
import { confirm, notify } from '@/lib/confirm';
import { env } from '@/lib/env';
import { enablePush } from '@/lib/notifications';

export default function Profile() {
  const { account, vehicles } = useApp();
  const biz = useBusiness();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const push = async () => {
    setBusy('push');
    setErr(null);
    try {
      const res = await enablePush(repo);
      if (res.ok) notify('Bildirimler açıldı', 'Bakım zamanı yaklaşınca sana haber vereceğiz.');
      else setErr(res.reason);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Bildirimler açılamadı.');
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    const ok = await confirm(
      'Hesabını sil',
      'Araçların, bakım, yakıt ve masraf kayıtların ve yüklediğin belgeler kalıcı olarak silinir. Bu işlem geri alınamaz.',
      'Hesabı sil',
      true,
    );
    if (!ok) return;
    setBusy('delete');
    setErr(null);
    try {
      await repo.deleteAccount();
      // Demo: işletme verisi de bu cihazdan silinir. Gerçek sürümde işletme kayıtları işletmeye aittir (bkz. KVKK notu).
      if (serviceRepo instanceof ServiceDemoRepo) await serviceRepo.reset();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Hesap silinemedi.');
      setBusy(null);
    }
  };

  return (
    <Screen title="Profil" back>
      <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#FDECEE', alignItems: 'center', justifyContent: 'center' }}
          accessibilityElementsHidden importantForAccessibility="no">
          <Text v="display" color={colors.brand}>{(account?.displayName ?? account?.email ?? 'P').slice(0, 1).toLocaleUpperCase('tr')}</Text>
        </View>
        <Text v="title" numberOfLines={1} style={{ textAlign: 'center' }}>{account?.displayName ?? account?.email ?? 'Hesabım'}</Text>
        <Muted small>{`${vehicles.length} araç`}</Muted>
        <View style={{ flexDirection: 'row' }}>
          <Pill tone={account?.plan === 'plus' ? 'ok' : 'neutral'}>{account?.plan === 'plus' ? 'OTOM Plus üyesi' : 'Ücretsiz üyelik'}</Pill>
        </View>
      </Card>

      {account?.plan !== 'plus' && (
        <SpecialCard style={{ marginTop: space.md, gap: space.md }}>
          <View style={{ gap: 4 }}>
            <Text v="label" color={colors.onSpecialMuted}>PREMIUM</Text>
            <Text v="section" color={colors.onSpecial}>OTOM Plus</Text>
            <Text v="small" color={colors.onSpecialMuted}>Sınırsız araç, Araç Pasaportu, gelişmiş raporlar. Aşama 2’de açılıyor.</Text>
          </View>
          <Button title="Plus’ı incele" variant="primary" onPress={() => router.push('/premium')} />
        </SpecialCard>
      )}

      <Section title="Garaj">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="car" title="Araçlarım" subtitle={`${vehicles.length} araç`} onPress={() => router.push('/garage')} />
        </Card>
      </Section>

      <Section title="Servis">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="doc" title="Servis geçmişim"
            subtitle={biz.myPendingCount > 0 ? `${biz.myPendingCount} kayıt onayını bekliyor` : 'Servislerin senin için açtığı kayıtlar'}
            onPress={() => router.push('/servis-kayitlarim')} />
        </Card>
        <MyPhoneCard />
      </Section>

      <Section title="OTOM SERVİS">
        <Card style={{ paddingVertical: 0 }}>
          {biz.businesses.length > 0 ? (
            <ListItem icon="store" title="İşletme moduna geç" subtitle={biz.business?.name ?? ''}
              onPress={() => { biz.setMode('business'); router.replace('/servis'); }} />
          ) : (
            <ListItem icon="store" title="İşletme hesabı aç" subtitle="Servis, usta ve oto sanayi işletmeleri için. Şimdilik ücretsiz."
              onPress={() => { biz.setMode('business'); router.push('/servis/isletme-ac'); }} />
          )}
        </Card>
      </Section>

      <Section title="Bildirimler">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="bell" title="Bakım bildirimlerini aç" subtitle="Bakım ve belge tarihleri yaklaşınca haber verir"
            onPress={push} right={busy === 'push' ? <Muted small>Açılıyor…</Muted> : undefined} />
        </Card>
      </Section>

      {socialRepo.available && account && (
        <Section title="Ana Sayfa (topluluk)">
          <Card style={{ paddingVertical: 0 }}>
            <ListItem icon="user" title="Paylaşımlarım" subtitle="Takipçilerin, takip ettiklerin ve paylaşımların"
              onPress={() => router.push(`/sosyal/kisi/${account.userId}`)} />
            <Divider />
            <ListItem icon="users" title="Marka grupları" subtitle="Aracının markasının grubuna katıl" onPress={() => router.push('/sosyal/gruplar')} />
          </Card>
          <NameCard />
        </Section>
      )}

      {account?.isAdmin && (
        <Section title="Yönetim">
          <Card style={{ paddingVertical: 0 }}>
            <ListItem icon="shield" title="Yönetici paneli" subtitle="İşletme doğrulama, forum ve Ana Sayfa şikâyetleri" onPress={() => router.push('/yonetim')} />
          </Card>
        </Section>
      )}

      <Section title="Gizlilik ve güvenlik">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="doc" title="Kullanım koşulları" onPress={() => router.push('/legal/kosullar')} />
          <Divider />
          <ListItem icon="shield" title="Gizlilik politikası" onPress={() => router.push('/legal/gizlilik')} />
          <Divider />
          <ListItem icon="shield" title="KVKK aydınlatma metni" onPress={() => router.push('/legal/kvkk')} />
          <Divider />
          <ListItem icon="trash" title="Hesabımı sil" subtitle="Tüm verilerin kalıcı olarak silinir" danger onPress={deleteAccount} />
        </Card>
      </Section>

      <ErrorText>{err}</ErrorText>
      <Button title="Çıkış yap" icon="logout" variant="ghost" style={{ marginTop: space.xl }} loading={busy === 'out'}
        onPress={async () => { setBusy('out'); await repo.signOut(); }} />
      <Muted small style={{ marginTop: space.md, textAlign: 'center' }}>
        OTOM · Aşama 1{env.isDemo ? ' · Demo modu' : ''}
      </Muted>
    </Screen>
  );
}

/** Paylaşımlarda görünen ad */
function NameCard() {
  const { account, refresh } = useApp();
  const [name, setName] = useState(account?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await socialRepo.setMyName(name);
      await refresh();
      setDone(true);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: space.sm, marginTop: space.sm }}>
      <Field label="Adın (paylaşımlarında görünür)" value={name} onChangeText={(t) => { setName(t); setDone(false); }} maxLength={40}
        autoCapitalize="words" placeholder="Örn. Ahmet Y." />
      <ErrorText>{err}</ErrorText>
      {done && <Text v="small" color="#1E7D53">Kaydedildi.</Text>}
      <Button title="Adımı kaydet" small variant="outline" onPress={save} loading={busy} disabled={name.trim() === (account?.displayName ?? '').trim()} />
    </Card>
  );
}
