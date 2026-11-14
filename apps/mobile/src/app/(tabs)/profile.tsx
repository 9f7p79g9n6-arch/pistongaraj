import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Divider, ErrorText, ListItem, Muted, Pill, Row, Screen, Section, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { repo, useApp } from '@/data/store';
import { confirm, notify } from '@/lib/confirm';
import { env } from '@/lib/env';
import { enablePush } from '@/lib/notifications';

export default function Profile() {
  const { account, vehicles } = useApp();
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
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Hesap silinemedi.');
      setBusy(null);
    }
  };

  return (
    <Screen title="Profil">
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.md} style={{ flex: 1 }}>
            <Text v="title">{(account?.displayName ?? account?.email ?? 'P').slice(0, 1).toUpperCase()}</Text>
            <Card style={{ padding: 0, flex: 1, backgroundColor: 'transparent' }}>
              <Text v="bodyStrong" numberOfLines={1}>{account?.displayName ?? account?.email ?? 'Hesabım'}</Text>
              <Muted small>{vehicles.length} araç</Muted>
            </Card>
          </Row>
          <Pill tone={account?.plan === 'plus' ? 'ok' : 'neutral'}>{account?.plan === 'plus' ? 'Plus' : 'Ücretsiz'}</Pill>
        </Row>
      </Card>

      {account?.plan !== 'plus' && (
        <Card onPress={() => router.push('/premium')} style={{ marginTop: space.md, gap: 4 }} highlight>
          <Text v="bodyStrong">PISTON Plus</Text>
          <Muted small>Sınırsız araç, Araç Pasaportu, gelişmiş raporlar. Aşama 2’de açılıyor.</Muted>
        </Card>
      )}

      <Section title="Garaj">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="car" title="Araçlarım" subtitle={`${vehicles.length} araç`} onPress={() => router.push('/garage')} />
        </Card>
      </Section>

      <Section title="Bildirimler">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="bell" title="Bakım bildirimlerini aç" subtitle="Bakım ve belge tarihleri yaklaşınca haber verir"
            onPress={push} right={busy === 'push' ? <Muted small>Açılıyor…</Muted> : undefined} />
        </Card>
      </Section>

      <Section title="Gizlilik ve güvenlik">
        <Card style={{ paddingVertical: 0 }}>
          <ListItem icon="shield" title="KVKK aydınlatma metni" onPress={() => router.push('/legal/kvkk')} />
          <Divider />
          <ListItem icon="trash" title="Hesabımı sil" subtitle="Tüm verilerin kalıcı olarak silinir" danger onPress={deleteAccount} />
        </Card>
      </Section>

      <ErrorText>{err}</ErrorText>
      <Button title="Çıkış yap" icon="logout" variant="ghost" style={{ marginTop: space.xl }} loading={busy === 'out'}
        onPress={async () => { setBusy('out'); await repo.signOut(); }} />
      <Muted small style={{ marginTop: space.md, textAlign: 'center' }}>
        PISTON GARAGE · Aşama 1{env.isDemo ? ' · Demo modu' : ''}
      </Muted>
    </Screen>
  );
}
