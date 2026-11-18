/** Marka grupları: aracının markasının grubuna katıl; katıldığın grupların paylaşımları Ana Sayfa'da "Gruplarım"da görünür. */
import type { SocialGroup } from '@piston/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { Button, Card, ErrorText, Field, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { socialRepo } from '@/data/social';

export default function Groups() {
  const [groups, setGroups] = useState<SocialGroup[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await socialRepo.groups());
      setErr(null);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Gruplar yüklenemedi.');
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const toggle = async (g: SocialGroup) => {
    setBusy(g.id);
    try {
      await socialRepo.join(g.id, !g.joined);
      await load();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Değiştirilemedi.');
    } finally {
      setBusy(null);
    }
  };

  const term = q.trim().toLocaleLowerCase('tr');
  const list = (groups ?? []).filter((g) => !term || g.name.toLocaleLowerCase('tr').includes(term));
  const mine = list.filter((g) => g.joined);
  const others = list.filter((g) => !g.joined);

  const row = (g: SocialGroup) => (
    <Card key={g.id} onPress={() => router.push(`/sosyal/grup/${g.id}`)} accessibilityLabel={`${g.name} grubu, ${g.memberCount} üye`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Stack gap={2} style={{ flex: 1 }}>
          <Text v="bodyStrong">{g.name}</Text>
          <Muted small>{`${g.memberCount} üye · ${g.postCount} paylaşım`}</Muted>
        </Stack>
        <Button title={g.joined ? 'Ayrıl' : 'Katıl'} small variant={g.joined ? 'ghost' : 'outline'} loading={busy === g.id} onPress={() => toggle(g)} />
      </Row>
    </Card>
  );

  return (
    <Screen title="Marka grupları" back>
      <Field label="Marka ara" value={q} onChangeText={setQ} placeholder="Örn. Fiat" autoCorrect={false} />
      <ErrorText>{err}</ErrorText>
      {groups == null ? <Muted>Yükleniyor…</Muted> : (
        <>
          {mine.length > 0 && <Section title="Katıldığım gruplar"><Stack gap={space.sm}>{mine.map(row)}</Stack></Section>}
          <Section title={mine.length ? 'Diğer markalar' : 'Markalar'}>
            {others.length === 0 ? <Muted>Bu adla grup yok.</Muted> : <Stack gap={space.sm}>{others.map(row)}</Stack>}
          </Section>
        </>
      )}
    </Screen>
  );
}
