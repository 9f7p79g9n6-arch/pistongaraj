/** Kişi profili: ad, paylaşım / takipçi / takip sayısı, takip et, engelle, grupları ve paylaşımları. */
import { compactCountTR, type SocialPost, type SocialUser } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Avatar, SmallAction, SocialPostCard } from '@/components/social';
import { Button, Card, Chip, Empty, ErrorText, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { socialRepo } from '@/data/social';
import { confirm } from '@/lib/confirm';

const msg = (e: unknown, fallback: string) => (e instanceof RepoError ? e.message : fallback);

export default function SocialUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<SocialUser | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const u = await socialRepo.user(id);
      setUser(u);
      setPosts(u.blocked ? [] : await socialRepo.feed('all', { userId: id }));
      setLoadErr(null);
    } catch (e) {
      setLoadErr(msg(e, 'Profil yüklenemedi.'));
    }
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (loadErr) return <Screen title="Profil" back><Empty title="Açılamadı" body={loadErr} action="Geri dön" onAction={() => router.back()} /></Screen>;
  if (!user) return <Screen title="Profil" back><Muted>Yükleniyor…</Muted></Screen>;

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(msg(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const block = async (on: boolean) => {
    if (on && !(await confirm(`${user.name} engellensin mi?`, 'Bu kişinin paylaşımlarını görmezsin, o da seninkileri görmez. Aranızdaki takip kalkar.', 'Engelle', true))) return;
    await run(() => socialRepo.block(user.userId, on), 'Değiştirilemedi.');
  };

  return (
    <Screen title={user.me ? 'Profilim' : 'Profil'} back>
      <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
        <Avatar name={user.name} size={76} />
        <Text v="title">{user.name}</Text>
        <Row gap={space.xl}>
          <Count n={user.postCount} label="paylaşım" />
          <Count n={user.followerCount} label="takipçi" />
          <Count n={user.followingCount} label="takip" />
        </Row>
        {!user.me && !user.blocked && (
          <Button title={user.following ? 'Takibi bırak' : 'Takip et'} icon={user.following ? undefined : 'plus'}
            variant={user.following ? 'secondary' : 'primary'} loading={busy} style={{ alignSelf: 'stretch', marginTop: space.sm }}
            onPress={() => run(() => socialRepo.follow(user.userId, !user.following), 'Değiştirilemedi.')} />
        )}
        {user.me && !user.hasName && <Muted small>Paylaşımlarında adının görünmesi için profilinden adını yaz.</Muted>}
        <ErrorText>{err}</ErrorText>
      </Card>

      {user.blocked ? (
        <Card style={{ gap: space.sm }}>
          <Text v="bodyStrong">Bu kişiyi engelledin</Text>
          <Muted small>Paylaşımlarını görmüyorsun. Engeli kaldırırsan yeniden görürsün.</Muted>
          <Button title="Engeli kaldır" variant="outline" onPress={() => block(false)} loading={busy} />
        </Card>
      ) : (
        <>
          {user.groups.length > 0 && (
            <Section title="Grupları">
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                {user.groups.map((g) => <Chip key={g.id} label={g.name} onPress={() => router.push(`/sosyal/grup/${g.id}`)} />)}
              </Row>
            </Section>
          )}
          <Section title="Paylaşımları">
            {posts.length === 0 ? <Muted>Henüz paylaşım yok.</Muted> : (
              <Stack gap={space.md}>
                {posts.map((p) => <SocialPostCard key={p.id} post={p} onPress={() => router.push(`/sosyal/${p.id}`)} />)}
              </Stack>
            )}
          </Section>
          {!user.me && (
            <View style={{ flexDirection: 'row', gap: space.md, justifyContent: 'center' }}>
              <SmallAction icon="ban" label="Engelle" onPress={() => block(true)} />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text v="section">{compactCountTR(n)}</Text>
      <Text v="small" color={colors.textMuted}>{label}</Text>
    </View>
  );
}
