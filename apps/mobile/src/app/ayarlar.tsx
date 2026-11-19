/**
 * Ayarlar: telefona bildirim tercihleri, hesap (telefon, silme), hukuk metinleri, yardım ve destek.
 */
import { SUPPORT_EMAIL } from '@piston/core';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';

import { MyPhoneCard } from '@/components/my-phone';
import { Card, Divider, ErrorText, ListItem, Muted, Screen, Section, Toggle } from '@/components/ui';
import { space } from '@/constants/theme';
import { serviceRepo } from '@/data/business-store';
import { RepoError, type NotifyPrefs } from '@/data/repo';
import { ServiceDemoRepo } from '@/data/service-demo-repo';
import { repo } from '@/data/store';
import { confirm, notify } from '@/lib/confirm';
import { env } from '@/lib/env';
import { enablePush } from '@/lib/notifications';

const PREFS: { key: keyof NotifyPrefs; label: string; hint: string }[] = [
  { key: 'reminders', label: 'Bakım ve ceza hatırlatmaları', hint: 'Bakım, muayene, sigorta ve ceza indirimi tarihleri' },
  { key: 'service', label: 'Servis kayıtları', hint: 'Servisin açtığı kayıtlar, değişiklikler ve onaylar' },
  { key: 'quotes', label: 'Teklifler', hint: 'Fiyat teklifi istekleri, gelen ve kabul edilen teklifler' },
  { key: 'social', label: 'Topluluk', hint: 'Yorumlar, takipçiler ve forum yanıtları' },
];

export default function Settings() {
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    repo.getNotifyPrefs().then(setPrefs).catch(() => setErr('Bildirim ayarları yüklenemedi.'));
  }, []));

  const toggle = async (key: keyof NotifyPrefs, value: boolean) => {
    if (!prefs) return;
    const prev = prefs;
    setPrefs({ ...prefs, [key]: value });
    setErr(null);
    try {
      await repo.setNotifyPrefs({ [key]: value });
    } catch (e) {
      setPrefs(prev);
      setErr(e instanceof RepoError ? e.message : 'Kaydedilemedi.');
    }
  };

  const push = async () => {
    setBusy('push');
    setErr(null);
    try {
      const res = await enablePush(repo);
      if (res.ok) notify('Bildirimler açıldı', 'Seçtiğin konularda telefonuna bildirim gelecek.');
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
      'Araçların, bakım, yakıt, masraf ve ceza kayıtların, paylaşımların ve yüklediğin belgeler kalıcı olarak silinir. Bu işlem geri alınamaz.',
      'Hesabı sil',
      true,
    );
    if (!ok) return;
    setBusy('delete');
    setErr(null);
    try {
      await repo.deleteAccount();
      // Demo: işletme verisi de bu cihazdan silinir. Gerçek sürümde işletmenin tuttuğu kayıtlar işletmeye aittir (KVKK metni).
      if (serviceRepo instanceof ServiceDemoRepo) await serviceRepo.reset();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Hesap silinemedi.');
      setBusy(null);
    }
  };

  const mail = () => {
    const subject = encodeURIComponent(`OTOM destek (sürüm ${Constants.expoConfig?.version ?? ''})`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => notify('E-posta açılamadı', `Bize ${SUPPORT_EMAIL} adresinden yazabilirsin.`));
  };

  return (
    <Screen title="Ayarlar" back>
      <ErrorText>{err}</ErrorText>
      <Section title="Bildirimler">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="bell" title="Telefona bildirimleri aç" subtitle="İzin ister; istediğin zaman telefon ayarlarından kapatabilirsin"
            onPress={push} right={busy === 'push' ? <Muted small>Açılıyor…</Muted> : undefined} />
        </Card>
        <Card style={{ marginTop: space.sm, gap: 0 }}>
          {prefs == null ? <Muted small>Yükleniyor…</Muted> : PREFS.map((p, i) => (
            <View key={p.key}>
              {i > 0 && <Divider />}
              <Toggle label={p.label} hint={p.hint} value={prefs[p.key]} onChange={(v) => toggle(p.key, v)} />
            </View>
          ))}
        </Card>
        <Muted small style={{ marginTop: space.xs }}>Kapattığın konular telefona gelmez; uygulamadaki Bildirimler listesinde yine görünür.</Muted>
      </Section>

      <Section title="Hesap">
        <MyPhoneCard />
        <Card style={{ paddingVertical: 0, marginTop: space.sm }}>
          <ListItem icon="trash" title="Hesabımı sil" subtitle="Tüm verilerin kalıcı olarak silinir" danger onPress={deleteAccount}
            right={busy === 'delete' ? <Muted small>Siliniyor…</Muted> : undefined} />
        </Card>
      </Section>

      <Section title="Yardım ve destek">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="question" title="Sık sorulan sorular" onPress={() => router.push('/yardim')} />
          <Divider />
          <ListItem icon="send" title="Destek ile iletişim" subtitle={SUPPORT_EMAIL} onPress={mail} />
        </Card>
      </Section>

      <Section title="Gizlilik ve hukuk">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="doc" title="Kullanım koşulları" onPress={() => router.push('/legal/kosullar')} />
          <Divider />
          <ListItem icon="shield" title="Gizlilik politikası" onPress={() => router.push('/legal/gizlilik')} />
          <Divider />
          <ListItem icon="shield" title="KVKK aydınlatma metni" onPress={() => router.push('/legal/kvkk')} />
        </Card>
      </Section>

      <Muted small style={{ marginTop: space.lg, textAlign: 'center' }}>
        {`OTOM ${Constants.expoConfig?.version ?? ''}${env.isDemo ? ' · Demo modu' : ''}`}
      </Muted>
    </Screen>
  );
}
