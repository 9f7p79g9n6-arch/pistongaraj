/**
 * Usta Forumu bileşenleri: konu kartı, yazar satırı, fotoğraf galerisi, video oynatıcı ve eklenecek dosya önizlemesi.
 */
import { FORUM_CATEGORY_LABEL, timeAgoTR, type ForumAuthor, type ForumMedia, type ForumPost } from '@piston/core';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space } from '@/constants/theme';
import type { PendingForumMedia } from '@/data/forum-repo';
import { Icon } from './icons';
import { Card, Muted, Pill, Row, Text } from './ui';

const fmtSec = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

export function AuthorRow({ author, at, right }: { author: ForumAuthor; at: string; right?: React.ReactNode }) {
  return (
    <Row gap={space.sm}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FDECEE', alignItems: 'center', justifyContent: 'center' }}
        importantForAccessibility="no" accessibilityElementsHidden>
        <Text v="bodyStrong" color={colors.brand}>{author.businessName.slice(0, 1).toLocaleUpperCase('tr')}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text v="smallStrong" numberOfLines={1}>{author.businessName}</Text>
        <Muted small>{[author.city, author.verified ? null : 'doğrulanmamış işletme', timeAgoTR(at)].filter(Boolean).join(' · ')}</Muted>
      </View>
      {right}
    </Row>
  );
}

export function PostCard({ post, onPress }: { post: ForumPost; onPress: () => void }) {
  const first = post.media[0];
  return (
    <Card onPress={onPress} style={{ gap: space.md }} accessibilityLabel={`${post.title}, ${post.author.businessName}, ${post.commentCount} yanıt`}>
      <AuthorRow author={post.author} at={post.createdAt} />
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Pill tone="neutral">{FORUM_CATEGORY_LABEL[post.category]}</Pill>
        {post.solved && <Pill tone="ok">Çözüldü</Pill>}
        {post.sample && <Pill tone="info">Örnek</Pill>}
      </Row>
      <View style={{ gap: 4 }}>
        <Text v="section">{post.title}</Text>
        {post.body ? <Text v="body" color={colors.textMuted} numberOfLines={3}>{post.body}</Text> : null}
      </View>
      {first && (
        <View style={{ borderRadius: 14, overflow: 'hidden', height: 170, backgroundColor: colors.special }}>
          {first.kind === 'image' ? (
            <Image source={{ uri: first.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel="Konu fotoğrafı" />
          ) : (
            <VideoTile durationSec={first.durationSec} />
          )}
          {post.media.length > 1 && (
            <View style={{ position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text v="label" color="#FFFFFF" style={{ fontWeight: '700' }}>{`+${post.media.length - 1} fotoğraf`}</Text>
            </View>
          )}
        </View>
      )}
      <Row gap={6}>
        <Icon name="forum" size={16} color={colors.iconMuted} />
        <Muted small>{post.commentCount === 0 ? 'Henüz yanıt yok' : `${post.commentCount} yanıt · son hareket ${timeAgoTR(post.lastActivityAt)}`}</Muted>
      </Row>
    </Card>
  );
}

function VideoTile({ durationSec }: { durationSec: number | null }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }} accessibilityLabel="Video">
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="play" size={24} color="#FFFFFF" />
      </View>
      <Text v="small" color={colors.onSpecialMuted}>{durationSec != null ? `Video · ${fmtSec(durationSec)}` : 'Video'}</Text>
    </View>
  );
}

/** Gönderi ve yanıttaki ekler: fotoğraflar 2 sütun (tek fotoğraf tam genişlik), video oynatıcı. Fotoğrafa dokununca büyür. */
export function MediaGallery({ media }: { media: ForumMedia[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (media.length === 0) return null;
  const video = media.find((m) => m.kind === 'video');
  if (video) return <VideoPlayer url={video.url} />;
  const single = media.length === 1;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {media.map((m, i) => (
          <Pressable key={m.id} onPress={() => setOpen(m.url)} accessibilityRole="imagebutton" accessibilityLabel={`Fotoğraf ${i + 1}, büyütmek için dokun`}
            style={{ width: single ? '100%' : '48.5%', aspectRatio: single ? 4 / 3 : 1, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface }}>
            <Image source={{ uri: m.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </Pressable>
        ))}
      </View>
      <Modal visible={!!open} animationType="fade" transparent={false} onRequestClose={() => setOpen(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <Pressable onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel="Kapat"
            style={{ alignSelf: 'flex-end', margin: space.md, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={20} color="#FFFFFF" />
          </Pressable>
          {open && <Image source={{ uri: open }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel="Büyütülmüş fotoğraf" />}
        </SafeAreaView>
      </Modal>
    </>
  );
}

export function VideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  return (
    <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: '#000', aspectRatio: 16 / 9, width: '100%' }}>
      <VideoView player={player} style={{ width: '100%', height: '100%' }} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />
    </View>
  );
}

/** Paylaşmadan önce seçilen ekler; dokununca kaldırılır */
export function PendingMediaRow({ media, onRemove }: { media: PendingForumMedia[]; onRemove: (uri: string) => void }) {
  if (media.length === 0) return null;
  return (
    <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
      {media.map((m) => (
        <Pressable key={m.uri} onPress={() => onRemove(m.uri)} accessibilityRole="button" accessibilityLabel={m.kind === 'video' ? 'Videoyu kaldır' : 'Fotoğrafı kaldır'}
          style={{ width: 76, height: 76, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.special }}>
          {m.kind === 'image' ? (
            <Image source={{ uri: m.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Icon name="video" size={20} color="#FFFFFF" />
              <Text v="label" color={colors.onSpecialMuted}>{fmtSec(m.durationSec) || 'Video'}</Text>
            </View>
          )}
          <View style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={12} color="#FFFFFF" />
          </View>
        </Pressable>
      ))}
    </Row>
  );
}

/** Ek ekleme düğmeleri: fotoğraf (çek / galeri) ve video (çek / galeri). Kurallara göre pasifleşir. */
export function AttachButtons({ media, onPick, busy, compact }: {
  media: PendingForumMedia[]; onPick: (source: 'camera' | 'library', kind: 'image' | 'video') => void; busy?: boolean; compact?: boolean;
}) {
  const hasVideo = media.some((m) => m.kind === 'video');
  const images = media.filter((m) => m.kind === 'image').length;
  const canImage = !hasVideo && images < 4;
  const canVideo = media.length === 0;
  return (
    <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
      <AttachBtn busy={busy} compact={compact} icon="camera" label="Fotoğraf çek" onPress={() => onPick('camera', 'image')} disabled={!canImage} />
      <AttachBtn busy={busy} compact={compact} icon="plus" label="Galeriden fotoğraf" onPress={() => onPick('library', 'image')} disabled={!canImage} />
      <AttachBtn busy={busy} compact={compact} icon="video" label="Video çek" onPress={() => onPick('camera', 'video')} disabled={!canVideo} />
      <AttachBtn busy={busy} compact={compact} icon="video" label="Galeriden video" onPress={() => onPick('library', 'video')} disabled={!canVideo} />
    </Row>
  );
}


function AttachBtn({ icon, label, onPress, disabled, busy, compact }: {
  icon: 'camera' | 'video' | 'plus'; label: string; onPress: () => void; disabled: boolean; busy?: boolean; compact?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityState={{ disabled: disabled || !!busy }} accessibilityLabel={label}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11,
        backgroundColor: colors.surface, opacity: disabled || busy ? 0.45 : pressed ? 0.7 : 1,
      }]}>
      <Icon name={icon} size={16} />
      {!compact && <Text v="smallStrong">{label}</Text>}
    </Pressable>
  );
}
