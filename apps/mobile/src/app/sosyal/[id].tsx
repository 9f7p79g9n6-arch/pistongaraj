/**
 * Gönderi / soru: fotoğraf-video, beğeni, yorumlar (soruda yanıtlar) ve alttaki yorum kutusu.
 * Soruyu soran en iyi yanıtı işaretler. Kendi içeriğini silme; başkasınınkini şikâyet etme ve kişiyi engelleme (App Store kuralı).
 */
import { SOCIAL_LIMITS, validateSocialComment, type SocialComment } from '@piston/core';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { MediaGallery } from '@/components/forum';
import { Icon } from '@/components/icons';
import { LikeButton, SmallAction, SocialAuthorRow } from '@/components/social';
import { Button, Card, Empty, ErrorText, Muted, Pill, Row, Screen, Section, Stack, Text, s as ui } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { socialRepo, type SocialPostDetail } from '@/data/social';
import { confirm, notify } from '@/lib/confirm';

const msg = (e: unknown, fallback: string) => (e instanceof RepoError ? e.message : fallback);

export default function SocialPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<SocialPostDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [requestId, setRequestId] = useState(() => Crypto.randomUUID());
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setPost(await socialRepo.getPost(id));
      setLoadErr(null);
    } catch (e) {
      setLoadErr(msg(e, 'Gönderi yüklenemedi.'));
    }
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (loadErr) return <Screen title="Gönderi" back><Empty title="Açılamadı" body={loadErr} action="Geri dön" onAction={() => router.back()} /></Screen>;
  if (!post) return <Screen title="Gönderi" back><Muted>Yükleniyor…</Muted></Screen>;

  const isQ = post.kind === 'question';
  const noun = isQ ? 'yanıt' : 'yorum';

  const act = async (fn: () => Promise<void>, fallback: string) => {
    setErr(null);
    try {
      await fn();
    } catch (x) {
      setErr(msg(x, fallback));
    }
  };

  const send = async () => {
    const e = validateSocialComment(reply);
    if (e) return setErr(e);
    setSending(true);
    setErr(null);
    try {
      await socialRepo.addComment(post.id, reply, requestId);
      setReply('');
      setRequestId(Crypto.randomUUID());
      await load();
    } catch (x) {
      setErr(msg(x, 'Gönderilemedi. Tekrar dene.'));
    } finally {
      setSending(false);
    }
  };

  const report = (target: { postId?: string; commentId?: string }) => act(async () => {
    if (!(await confirm('Şikâyet et', 'Bu içerik uygunsuzsa şikâyet et. Birden çok kişi şikâyet edince içerik herkesten gizlenir ve incelenir.', 'Şikâyet et', true))) return;
    await socialRepo.report(target, null);
    notify('Şikâyetin alındı', 'Teşekkürler. İçerik incelenecek.');
    if (target.postId) router.back();
    else await load();
  }, 'Şikâyet gönderilemedi.');

  const block = (userId: string, name: string) => act(async () => {
    if (!(await confirm(`${name} engellensin mi?`, 'Bu kişinin paylaşımlarını görmezsin, o da seninkileri görmez. Aranızdaki takip kalkar.', 'Engelle', true))) return;
    await socialRepo.block(userId, true);
    if (userId === post.author.userId) router.back();
    else await load();
  }, 'Engellenemedi.');

  const footer = (
    <Stack gap={space.sm}>
      <ErrorText>{err}</ErrorText>
      <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
        <TextInput value={reply} onChangeText={setReply} placeholder={isQ ? 'Yanıtını yaz…' : 'Yorum yaz…'} placeholderTextColor={colors.iconMuted} multiline
          maxLength={SOCIAL_LIMITS.commentMax} accessibilityLabel={isQ ? 'Yanıt' : 'Yorum'}
          style={[ui.input, { flex: 1, maxHeight: 120, paddingVertical: 11 }]} />
        <Pressable onPress={send} disabled={sending} accessibilityRole="button" accessibilityLabel="Gönder"
          style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 12, backgroundColor: pressed ? colors.brandDark : colors.brand, alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.6 : 1 })}>
          <Icon name="send" size={19} color={colors.onBrand} />
        </Pressable>
      </Row>
    </Stack>
  );

  return (
    <Screen title={isQ ? 'Soru' : 'Gönderi'} back footer={footer}>
      <Card style={{ gap: space.md }}>
        <SocialAuthorRow author={post.author} at={post.createdAt} extra={post.group?.name ?? null} />
        {isQ && (
          <Row gap={6}>
            <Pill tone="info">Soru</Pill>
            {post.bestCommentId && <Pill tone="ok">Yanıtlandı</Pill>}
          </Row>
        )}
        {post.body ? <Text v={isQ ? 'section' : 'body'}>{post.body}</Text> : null}
        <MediaGallery media={post.media} />
        <Row gap={space.lg} style={{ flexWrap: 'wrap' }}>
          <LikeButton post={post} />
          {post.group && (
            <Pressable onPress={() => router.push(`/sosyal/grup/${post.group!.id}`)} accessibilityRole="link" accessibilityLabel={`${post.group.name} grubunu aç`}>
              <Text v="smallStrong" color={colors.info}>{`${post.group.name} grubu`}</Text>
            </Pressable>
          )}
        </Row>
        <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
          {post.mine ? (
            <SmallAction icon="trash" label="Sil" onPress={() => act(async () => {
              if (!(await confirm('Gönderiyi sil', 'Gönderi ve yorumları kaldırılır.', 'Sil', true))) return;
              await socialRepo.deletePost(post.id);
              router.back();
            }, 'Silinemedi.')} />
          ) : (
            <>
              <SmallAction icon="flag" label="Şikâyet et" onPress={() => report({ postId: post.id })} />
              <SmallAction icon="ban" label="Kişiyi engelle" onPress={() => block(post.author.userId, post.author.name)} />
            </>
          )}
        </View>
      </Card>

      <Section title={post.comments.length ? `${isQ ? 'Yanıtlar' : 'Yorumlar'} (${post.comments.length})` : isQ ? 'Yanıtlar' : 'Yorumlar'}>
        {post.comments.length === 0 ? (
          <Muted>{`Henüz ${noun} yok. İlk ${noun}ı sen yaz.`}</Muted>
        ) : (
          <Stack gap={space.md}>
            {post.comments.map((c) => (
              <CommentCard key={c.id} c={c} canMarkBest={isQ && post.mine}
                onBest={() => act(async () => { await socialRepo.setBestAnswer(post.id, c.best ? null : c.id); await load(); }, 'İşaretlenemedi.')}
                onDelete={() => act(async () => {
                  if (!(await confirm(`${isQ ? 'Yanıtı' : 'Yorumu'} sil`, 'Kalıcı olarak kaldırılır.', 'Sil', true))) return;
                  await socialRepo.deleteComment(c.id);
                  await load();
                }, 'Silinemedi.')}
                onReport={() => report({ commentId: c.id })}
                onBlock={() => block(c.author.userId, c.author.name)} />
            ))}
          </Stack>
        )}
      </Section>
    </Screen>
  );
}

function CommentCard({ c, canMarkBest, onBest, onDelete, onReport, onBlock }: {
  c: SocialComment; canMarkBest: boolean; onBest: () => void; onDelete: () => void; onReport: () => void; onBlock: () => void;
}) {
  return (
    <Card highlight={c.best} style={{ gap: space.sm }}>
      <SocialAuthorRow author={c.author} at={c.createdAt} right={c.best ? <Pill tone="ok">En iyi yanıt</Pill> : null} />
      <Text>{c.body}</Text>
      <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
        {canMarkBest && (c.best
          ? <SmallAction icon="x" label="En iyi yanıt işaretini kaldır" onPress={onBest} />
          : <Button title="En iyi yanıt" icon="check" small variant="outline" onPress={onBest} />)}
        {c.mine ? (
          <SmallAction icon="trash" label="Sil" onPress={onDelete} />
        ) : (
          <>
            <SmallAction icon="flag" label="Şikâyet et" onPress={onReport} />
            <SmallAction icon="ban" label="Engelle" onPress={onBlock} />
          </>
        )}
      </View>
    </Card>
  );
}
