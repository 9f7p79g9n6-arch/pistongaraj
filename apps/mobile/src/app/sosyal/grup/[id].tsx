/** Marka grubu: katıl / ayrıl, gruba paylaşım ya da soru, grubun paylaşımları. */
import type { SocialGroup, SocialPost } from '@piston/core';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { SocialPostCard } from '@/components/social';
import { Button, Card, Empty, ErrorText, Muted, Row, Screen, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { socialRepo } from '@/data/social';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<SocialGroup | null>(null);
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [gs, ps] = await Promise.all([socialRepo.groups(), socialRepo.feed('all', { groupId: id })]);
      setGroup(gs.find((g) => g.id === id) ?? null);
      setPosts(ps);
      setErr(null);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Grup yüklenemedi.');
    }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggle = async () => {
    if (!group) return;
    setBusy(true);
    try {
      await socialRepo.join(group.id, !group.joined);
      await load();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={group?.name ?? 'Grup'} back>
      <ErrorText>{err}</ErrorText>
      {group && (
        <Card style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stack gap={2} style={{ flex: 1 }}>
              <Text v="section">{`${group.name} grubu`}</Text>
              <Muted small>{`${group.memberCount} üye · ${group.postCount} paylaşım`}</Muted>
            </Stack>
            <Button title={group.joined ? 'Ayrıl' : 'Katıl'} small variant={group.joined ? 'ghost' : 'primary'} loading={busy} onPress={toggle} />
          </Row>
          <Row gap={space.sm}>
            <Button title="Paylaş" icon="camera" small variant="outline" style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/sosyal/yeni', params: { grup: group.id } })} />
            <Button title="Soru sor" icon="question" small variant="outline" style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/sosyal/yeni', params: { grup: group.id, tur: 'soru' } })} />
          </Row>
        </Card>
      )}
      {posts == null ? (err ? null : <Muted>Yükleniyor…</Muted>) : posts.length === 0 ? (
        <Empty title="Bu grupta henüz paylaşım yok" body="İlk paylaşımı ya da soruyu sen yap." />
      ) : (
        <Stack gap={space.md}>
          {posts.map((p) => <SocialPostCard key={p.id} post={p} onPress={() => router.push(`/sosyal/${p.id}`)} />)}
        </Stack>
      )}
    </Screen>
  );
}
