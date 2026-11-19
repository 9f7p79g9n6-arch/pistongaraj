/**
 * Ana Sayfa: OTOM'un sosyal merkezi. Araç fotoğrafı/videosu paylaşma, beğeni, yorum, takip, marka grupları ve sorular.
 * Sol üstteki ☰ profil ve ayarları açar. (Hikâye ve özel mesaj 2. aşamada.)
 */
import { SOCIAL_SCOPE_LABEL, type SocialFeedScope, type SocialPost } from '@piston/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Logo } from '@/components/brand';
import { Icon } from '@/components/icons';
import { NotificationBell } from '@/components/notification-bell';
import { Avatar, SocialPostCard } from '@/components/social';
import { Button, Card, Empty, ErrorText, IconButton, Muted, Row, Screen, Segmented, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { socialRepo } from '@/data/social';
import { useApp } from '@/data/store';

const SCOPES: SocialFeedScope[] = ['all', 'following', 'groups', 'questions'];

const EMPTY: Record<SocialFeedScope, [string, string]> = {
  all: ['Henüz paylaşım yok', 'İlk paylaşımı sen yap: aracının fotoğrafını ya da videosunu paylaş.'],
  following: ['Takip ettiğin kimse yok', 'Beğendiğin paylaşımların sahibine dokun ve takip et. Paylaşımları burada görünür.'],
  groups: ['Bir gruba katıl', 'Aracının markasının grubuna katıl; o gruptaki paylaşımlar burada görünür.'],
  questions: ['Henüz soru yok', 'Aracınla ilgili merak ettiğini sor; diğer araç sahipleri ve ustalar yanıtlasın.'],
};

export default function Home() {
  const { account } = useApp();
  const [scope, setScope] = useState<SocialFeedScope>('all');
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scopeRef = useRef(scope);

  const load = useCallback(async (s: SocialFeedScope) => {
    scopeRef.current = s;
    setErr(null);
    try {
      const list = await socialRepo.feed(s);
      if (scopeRef.current !== s) return;
      setPosts(list);
      setMore(list.length >= 20);
    } catch (e) {
      if (scopeRef.current === s) setErr(e instanceof RepoError ? e.message : 'Paylaşımlar yüklenemedi.');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(scopeRef.current); }, [load]));

  const change = (s: SocialFeedScope) => {
    setScope(s);
    setPosts(null);
    void load(s);
  };

  const loadMore = async () => {
    if (!posts?.length) return;
    setLoadingMore(true);
    try {
      const list = await socialRepo.feed(scope, { before: posts[posts.length - 1]!.createdAt });
      setPosts([...posts, ...list]);
      setMore(list.length >= 20);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Yüklenemedi.');
    } finally {
      setLoadingMore(false);
    }
  };

  const header = (
    <Row style={{ justifyContent: 'space-between' }}>
      <IconButton icon="menu" label="Profil ve ayarlar" onPress={() => router.push('/profil')} />
      <Logo size={28} onGreen />
      <Row gap={space.xs}>
        <IconButton icon="users" label="Marka grupları" onPress={() => router.push('/sosyal/gruplar')} />
        <NotificationBell />
      </Row>
    </Row>
  );

  if (!socialRepo.available) {
    return (
      <Screen band={header}>
        <Empty title="Ana Sayfa yakında" body="Paylaşım, beğeni, yorum ve marka grupları sunucu bağlantısıyla çalışır. Demo sürümde kapalıdır." />
      </Screen>
    );
  }

  const name = account?.displayName?.trim() || 'Sen';
  return (
    <Screen band={header}>
      <Card style={{ gap: space.md }}>
        <Row gap={space.sm}>
          <Avatar name={name} />
          <Pressable onPress={() => router.push('/sosyal/yeni')} accessibilityRole="button" accessibilityLabel="Yeni paylaşım"
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11 }}>
            <Muted>Aracını paylaş…</Muted>
          </Pressable>
        </Row>
        <Row gap={space.sm}>
          <Button title="Fotoğraf / video" icon="camera" small variant="outline" style={{ flex: 1 }} onPress={() => router.push('/sosyal/yeni')} />
          <Button title="Soru sor" icon="question" small variant="outline" style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/sosyal/yeni', params: { tur: 'soru' } })} />
        </Row>
      </Card>

      <Segmented options={SCOPES.map((s) => ({ value: s, label: SOCIAL_SCOPE_LABEL[s] }))} value={scope} onChange={change} />

      <ErrorText>{err}</ErrorText>
      {err && !posts ? <Button title="Tekrar dene" onPress={() => load(scope)} /> : null}

      {posts == null ? (
        err ? null : <Muted>Yükleniyor…</Muted>
      ) : posts.length === 0 ? (
        <Empty title={EMPTY[scope][0]} body={EMPTY[scope][1]}
          action={scope === 'groups' ? 'Gruplara göz at' : scope === 'questions' ? 'Soru sor' : 'Paylaş'}
          onAction={() => (scope === 'groups' ? router.push('/sosyal/gruplar')
            : router.push(scope === 'questions' ? { pathname: '/sosyal/yeni', params: { tur: 'soru' } } : '/sosyal/yeni'))} />
      ) : (
        <Stack gap={space.md}>
          {posts.map((p) => <SocialPostCard key={p.id} post={p} onPress={() => router.push(`/sosyal/${p.id}`)} />)}
          {more && <Button title="Daha fazla göster" variant="ghost" onPress={loadMore} loading={loadingMore} />}
        </Stack>
      )}

      <View style={{ alignItems: 'center', paddingTop: space.sm }}>
        <Row gap={6}>
          <Icon name="shield" size={14} color={colors.iconMuted} />
          <Text v="small" color={colors.textMuted}>Uygunsuz içeriği şikâyet et; kişileri engelleyebilirsin.</Text>
        </Row>
      </View>
    </Screen>
  );
}
