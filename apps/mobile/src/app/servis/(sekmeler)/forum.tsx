/** Usta Forumu akışı: işletmeler arası soru, tartışma ve tecrübe paylaşımı. Kategoriye göre süzülür. */
import { FORUM_CATEGORIES, FORUM_CATEGORY_LABEL, type ForumCategory, type ForumPost } from '@piston/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';

import { PostCard } from '@/components/forum';
import { Button, Chip, Empty, ErrorText, Muted, Screen, Stack } from '@/components/ui';
import { space } from '@/constants/theme';
import { forumRepo } from '@/data/forum';
import { RepoError } from '@/data/repo';
import { env } from '@/lib/env';

export default function Forum() {
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [posts, setPosts] = useState<ForumPost[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (c: ForumCategory | null) => {
    try {
      setPosts(await forumRepo.feed(c));
      setErr(null);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Forum yüklenemedi.');
    }
  }, []);

  // Sekmeye her dönüşte (yeni konu açıldıktan, yanıt yazıldıktan sonra) yenilenir
  useFocusEffect(useCallback(() => { void load(category); }, [load, category]));

  const pick = (c: ForumCategory | null) => {
    setCategory(c);
    setPosts(null);
  };

  return (
    <Screen title="Usta Forumu" right={<Button title="Konu aç" icon="plus" small variant="primary" onPress={() => router.push('/servis/forum/yeni')} />}>
      <Muted small>
        Ustalar ve servisler arasında soru, tartışma ve tecrübe paylaşımı. Fotoğraf ya da video ekleyebilirsin.
        {env.isDemo ? ' Demo: paylaşımlar yalnızca bu cihazda görünür.' : ''}
      </Muted>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md, marginHorizontal: -space.lg }}
        contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
        <Chip label="Tümü" selected={category === null} onPress={() => pick(null)} />
        {FORUM_CATEGORIES.map((c) => <Chip key={c} label={FORUM_CATEGORY_LABEL[c]} selected={category === c} onPress={() => pick(c)} />)}
      </ScrollView>

      <Stack gap={space.md} style={{ marginTop: space.lg }}>
        <ErrorText>{err}</ErrorText>
        {err && <Button title="Tekrar dene" small onPress={() => load(category)} />}
        {posts === null && !err ? <Muted>Yükleniyor…</Muted> : null}
        {posts?.length === 0 && (
          <Empty title={category ? 'Bu kategoride konu yok' : 'Henüz konu yok'} body="İlk konuyu sen aç: arıza sor, çözümünü paylaş, fotoğraf ya da video ekle."
            action="Konu aç" onAction={() => router.push('/servis/forum/yeni')} />
        )}
        {posts?.map((p) => <PostCard key={p.id} post={p} onPress={() => router.push(`/servis/forum/${p.id}`)} />)}
      </Stack>
    </Screen>
  );
}
