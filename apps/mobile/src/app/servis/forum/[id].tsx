/**
 * Forum konusu: konu, fotoğraf/video, yanıtlar ve alttaki yanıt kutusu.
 * Kendi içeriğini silme ve "çözüldü" işareti; başkasının içeriğini şikâyet etme ve işletmeyi engelleme (App Store kuralı).
 */
import { FORUM_CATEGORY_LABEL, FORUM_LIMITS, validateForumComment, validateForumMedia, type ForumComment } from '@piston/core';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AttachButtons, AuthorRow, MediaGallery, PendingMediaRow } from '@/components/forum';
import { Icon, type IconName } from '@/components/icons';
import { Button, Card, Empty, ErrorText, Muted, Pill, Row, Screen, Section, Stack, Text, s as ui } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { forumRepo } from '@/data/forum';
import type { ForumPostDetail, PendingForumMedia } from '@/data/forum-repo';
import { RepoError } from '@/data/repo';
import { confirm, notify } from '@/lib/confirm';
import { pickForumMedia } from '@/lib/forum-media';

const msg = (e: unknown, fallback: string) => (e instanceof RepoError ? e.message : fallback);

export default function ForumPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business } = useBusiness();
  const [post, setPost] = useState<ForumPostDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [media, setMedia] = useState<PendingForumMedia[]>([]);
  const [requestId, setRequestId] = useState(() => Crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setPost(await forumRepo.getPost(id));
      setLoadErr(null);
    } catch (e) {
      setLoadErr(msg(e, 'Konu yüklenemedi.'));
    }
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (loadErr) return <Screen title="Konu" back><Empty title="Konu açılamadı" body={loadErr} action="Foruma dön" onAction={() => router.back()} /></Screen>;
  if (!post) return <Screen title="Konu" back><Muted>Yükleniyor…</Muted></Screen>;

  const attach = async (source: 'camera' | 'library', kind: 'image' | 'video') => {
    setErr(null);
    setPicking(true);
    const res = await pickForumMedia(source, kind, FORUM_LIMITS.maxImages - media.filter((m) => m.kind === 'image').length);
    setPicking(false);
    if (!res.ok) {
      if (res.reason === 'denied') setErr('Kamera izni verilmedi. Ayarlardan izin verebilirsin.');
      else if (res.reason === 'failed') setErr('Dosya eklenemedi. Tekrar dene.');
      return;
    }
    const next = [...media, ...res.media];
    const e = validateForumMedia(next);
    if (e) return setErr(e);
    setMedia(next);
  };

  const send = async () => {
    if (!business) return;
    const e = validateForumComment({ body: reply, media });
    if (e) return setErr(e);
    setSending(true);
    setErr(null);
    try {
      await forumRepo.addComment({ businessId: business.id, postId: post.id, body: reply, media, clientRequestId: requestId });
      setReply('');
      setMedia([]);
      setAttachOpen(false);
      setRequestId(Crypto.randomUUID());
      await load();
    } catch (x) {
      setErr(msg(x, 'Yanıt gönderilemedi. Tekrar dene.'));
    } finally {
      setSending(false);
    }
  };

  const act = async (fn: () => Promise<void>, fallback: string) => {
    setErr(null);
    try {
      await fn();
    } catch (x) {
      setErr(msg(x, fallback));
    }
  };

  const deletePost = () => act(async () => {
    if (!(await confirm('Konuyu sil', 'Konu ve yanıtları forumdan kaldırılır.', 'Sil', true))) return;
    await forumRepo.deletePost(post.id);
    router.back();
  }, 'Konu silinemedi.');

  const toggleSolved = () => act(async () => {
    await forumRepo.setSolved(post.id, !post.solved);
    await load();
  }, 'Değiştirilemedi.');

  const report = (target: { postId?: string; commentId?: string }) => act(async () => {
    if (!business) return;
    if (!(await confirm('Şikâyet et', 'Bu içerik uygunsuzsa şikâyet et. Birden çok işletme şikâyet edince içerik herkesten gizlenir ve incelenir.', 'Şikâyet et', true))) return;
    await forumRepo.report(business.id, target, null);
    notify('Şikâyetin alındı', 'Teşekkürler. İçerik incelenecek.');
    if (target.postId) router.back();
    else await load();
  }, 'Şikâyet gönderilemedi.');

  const block = (businessId: string, name: string) => act(async () => {
    if (!(await confirm(`${name} engellensin mi?`, 'Bu işletmenin konu ve yanıtlarını artık görmezsin.', 'Engelle', true))) return;
    await forumRepo.block(businessId, true);
    if (businessId === post.author.businessId) router.back();
    else await load();
  }, 'Engellenemedi.');

  const footer = (
    <Stack gap={space.sm}>
      <PendingMediaRow media={media} onRemove={(uri) => setMedia(media.filter((m) => m.uri !== uri))} />
      {attachOpen && <AttachButtons media={media} onPick={attach} busy={picking} />}
      <ErrorText>{err}</ErrorText>
      <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
        <Pressable onPress={() => setAttachOpen(!attachOpen)} accessibilityRole="button" accessibilityLabel="Fotoğraf ya da video ekle"
          accessibilityState={{ expanded: attachOpen }}
          style={{ width: 44, height: 46, borderRadius: 12, backgroundColor: attachOpen ? '#FDECEE' : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="camera" size={20} color={attachOpen ? colors.brand : colors.text} />
        </Pressable>
        <TextInput value={reply} onChangeText={setReply} placeholder="Yanıt yaz…" placeholderTextColor={colors.iconMuted} multiline
          maxLength={FORUM_LIMITS.commentMax} accessibilityLabel="Yanıt"
          style={[ui.input, { flex: 1, maxHeight: 120, paddingVertical: 11 }]} />
        <Pressable onPress={send} disabled={sending || picking} accessibilityRole="button" accessibilityLabel="Yanıtı gönder"
          style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 12, backgroundColor: pressed ? colors.brandDark : colors.brand, alignItems: 'center', justifyContent: 'center', opacity: sending ? 0.6 : 1 })}>
          <Icon name="send" size={19} color={colors.onBrand} />
        </Pressable>
      </Row>
    </Stack>
  );

  return (
    <Screen title="Konu" back footer={footer}>
      <Card style={{ gap: space.md }}>
        <AuthorRow author={post.author} at={post.createdAt} />
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <Pill tone="neutral">{FORUM_CATEGORY_LABEL[post.category]}</Pill>
          {post.solved && <Pill tone="ok">Çözüldü</Pill>}
          {post.sample && <Pill tone="info">Örnek</Pill>}
        </Row>
        <Text v="title">{post.title}</Text>
        {post.body ? <Text>{post.body}</Text> : null}
        <MediaGallery media={post.media} />
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {post.mine ? (
            <>
              <Button title={post.solved ? 'Çözülmedi olarak işaretle' : 'Çözüldü olarak işaretle'} icon="check" small variant={post.solved ? 'secondary' : 'outline'} onPress={toggleSolved} />
              <Button title="Sil" icon="trash" small variant="ghost" onPress={deletePost} />
            </>
          ) : (
            <>
              <SmallAction icon="flag" label="Şikâyet et" onPress={() => report({ postId: post.id })} />
              <SmallAction icon="ban" label="İşletmeyi engelle" onPress={() => block(post.author.businessId, post.author.businessName)} />
            </>
          )}
        </Row>
      </Card>

      <Section title={post.comments.length ? `Yanıtlar (${post.comments.length})` : 'Yanıtlar'}>
        {post.comments.length === 0 ? (
          <Muted>Henüz yanıt yok. İlk yanıtı sen yaz.</Muted>
        ) : (
          <Stack gap={space.md}>
            {post.comments.map((c) => (
              <CommentCard key={c.id} c={c}
                onDelete={() => act(async () => {
                  if (!(await confirm('Yanıtı sil', 'Yanıtın forumdan kaldırılır.', 'Sil', true))) return;
                  await forumRepo.deleteComment(c.id);
                  await load();
                }, 'Yanıt silinemedi.')}
                onReport={() => report({ commentId: c.id })}
                onBlock={() => block(c.author.businessId, c.author.businessName)} />
            ))}
          </Stack>
        )}
      </Section>
    </Screen>
  );
}

function CommentCard({ c, onDelete, onReport, onBlock }: { c: ForumComment; onDelete: () => void; onReport: () => void; onBlock: () => void }) {
  return (
    <Card style={{ gap: space.sm }}>
      <AuthorRow author={c.author} at={c.createdAt} />
      {c.body ? <Text>{c.body}</Text> : null}
      <MediaGallery media={c.media} />
      <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
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

function SmallAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.6 : 1, paddingVertical: 4 })}>
      <Icon name={icon} size={15} color={colors.textMuted} />
      <Text v="small" color={colors.textMuted}>{label}</Text>
    </Pressable>
  );
}
