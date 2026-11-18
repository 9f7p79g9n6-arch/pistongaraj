/**
 * Ana Sayfa (sosyal merkez) bileşenleri: kişi simgesi, yazar satırı, gönderi kartı (beğen / yorum), küçük eylem düğmesi.
 */
import { compactCountTR, timeAgoTR, type SocialAuthor, type SocialPost } from '@piston/core';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { socialRepo } from '@/data/social';
import { notify } from '@/lib/confirm';
import { Icon, type IconName } from './icons';
import { Card, Muted, Pill, Row, Text } from './ui';

const LIKE_RED = '#E5484D';

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.tabBar, alignItems: 'center', justifyContent: 'center' }}
      importantForAccessibility="no" accessibilityElementsHidden>
      <Text v="bodyStrong" color={colors.onLogo} style={{ fontSize: size * 0.42 }}>{name.trim().slice(0, 1).toLocaleUpperCase('tr') || 'O'}</Text>
    </View>
  );
}

export function SocialAuthorRow({ author, at, extra, right }: { author: SocialAuthor; at: string; extra?: string | null; right?: React.ReactNode }) {
  return (
    <Row gap={space.sm}>
      <Pressable onPress={() => router.push(`/sosyal/kisi/${author.userId}`)} accessibilityRole="button" accessibilityLabel={`${author.name} profilini aç`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1, minWidth: 0 }}>
        <Avatar name={author.name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text v="smallStrong" numberOfLines={1}>{author.name}</Text>
          <Muted small>{[extra, timeAgoTR(at)].filter(Boolean).join(' · ')}</Muted>
        </View>
      </Pressable>
      {right}
    </Row>
  );
}

/** Beğen düğmesi: hemen değişir, sunucu yanıtıyla düzelir */
export function LikeButton({ post, onChange }: { post: SocialPost; onChange?: (liked: boolean, count: number) => void }) {
  const [liked, setLiked] = useState(post.liked);
  const [count, setCount] = useState(post.likeCount);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    const next = !liked;
    setLiked(next);
    setCount(Math.max(0, count + (next ? 1 : -1)));
    setBusy(true);
    try {
      const n = await socialRepo.like(post.id, next);
      setCount(n);
      onChange?.(next, n);
    } catch (e) {
      setLiked(!next);
      setCount(count);
      notify('Beğenilemedi', e instanceof RepoError ? e.message : 'Tekrar dene.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ selected: liked }}
      accessibilityLabel={liked ? `Beğeniyi geri al, ${count} beğeni` : `Beğen, ${count} beğeni`}
      hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
      <Icon name="heart" size={22} color={liked ? LIKE_RED : colors.text} fill={liked ? LIKE_RED : undefined} />
      <Text v="smallStrong">{compactCountTR(count)}</Text>
    </Pressable>
  );
}

export function SocialPostCard({ post, onPress }: { post: SocialPost; onPress: () => void }) {
  const first = post.media[0];
  const isQ = post.kind === 'question';
  return (
    <Card style={{ gap: space.md }}>
      <SocialAuthorRow author={post.author} at={post.createdAt} extra={post.group?.name ?? null} />
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${isQ ? 'Soru' : 'Gönderi'}: ${post.body || 'fotoğraf'}. Aç`} style={{ gap: space.sm }}>
        {isQ && (
          <Row gap={6}>
            <Pill tone="info">Soru</Pill>
            {post.bestCommentId && <Pill tone="ok">Yanıtlandı</Pill>}
          </Row>
        )}
        {post.body ? <Text v={isQ ? 'section' : 'body'} numberOfLines={isQ ? 4 : 6}>{post.body}</Text> : null}
        {first && (
          <View style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: 4 / 3, width: '100%', backgroundColor: colors.special }}>
            {first.kind === 'image' ? (
              <Image source={{ uri: first.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel="Gönderi fotoğrafı" />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }} accessibilityLabel="Video">
                <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="play" size={26} color="#FFFFFF" />
                </View>
                <Text v="small" color={colors.onSpecialMuted}>Video · izlemek için dokun</Text>
              </View>
            )}
            {post.media.length > 1 && (
              <View style={{ position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text v="label" color="#FFFFFF" style={{ fontWeight: '700' }}>{`+${post.media.length - 1} fotoğraf`}</Text>
              </View>
            )}
          </View>
        )}
      </Pressable>
      <Row gap={space.lg}>
        <LikeButton key={`${post.id}-${post.liked}-${post.likeCount}`} post={post} />
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${post.commentCount} ${isQ ? 'yanıt' : 'yorum'}, aç`} hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
          <Icon name="forum" size={21} />
          <Text v="smallStrong">{compactCountTR(post.commentCount)}</Text>
          <Muted small>{isQ ? 'yanıt' : 'yorum'}</Muted>
        </Pressable>
      </Row>
    </Card>
  );
}

export function SmallAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={15} color={colors.textMuted} />
      <Text v="small" color={colors.textMuted}>{label}</Text>
    </Pressable>
  );
}
