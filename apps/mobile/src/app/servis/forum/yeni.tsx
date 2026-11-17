/** Yeni forum konusu: kategori, başlık, açıklama, en fazla 4 fotoğraf ya da 1 video. */
import { FORUM_CATEGORIES, FORUM_CATEGORY_LABEL, FORUM_LIMITS, validateForumMedia, validateForumPost, type ForumCategory } from '@piston/core';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';

import { AttachButtons, PendingMediaRow } from '@/components/forum';
import { Button, Card, Chip, ErrorText, Field, Muted, Row, Screen, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { forumRepo } from '@/data/forum';
import type { PendingForumMedia } from '@/data/forum-repo';
import { RepoError } from '@/data/repo';
import { pickForumMedia } from '@/lib/forum-media';

export default function NewForumPost() {
  const { business } = useBusiness();
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<PendingForumMedia[]>([]);
  const [requestId] = useState(() => Crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const attach = async (source: 'camera' | 'library', kind: 'image' | 'video') => {
    setErr(null);
    setPicking(true);
    const remaining = FORUM_LIMITS.maxImages - media.filter((m) => m.kind === 'image').length;
    const res = await pickForumMedia(source, kind, remaining);
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

  const share = async () => {
    if (!business) return;
    const e = validateForumPost({ title, body, category: category ?? '', media });
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      const id = await forumRepo.createPost({ businessId: business.id, category: category!, title, body, media, clientRequestId: requestId });
      router.replace(`/servis/forum/${id}`);
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Konu paylaşılamadı. Tekrar dene.');
      setBusy(false);
    }
  };

  return (
    <Screen title="Yeni konu" back
      footer={<Button title="Paylaş" icon="send" variant="primary" onPress={share} loading={busy} disabled={picking} />}>
      <Stack gap={space.lg}>
        <Stack gap={space.sm}>
          <Text v="smallStrong">Kategori</Text>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {FORUM_CATEGORIES.map((c) => <Chip key={c} label={FORUM_CATEGORY_LABEL[c]} selected={category === c} onPress={() => setCategory(c)} />)}
          </Row>
        </Stack>
        <Field label="Başlık" value={title} onChangeText={setTitle} maxLength={FORUM_LIMITS.titleMax}
          placeholder="Örn. Egea frenden ses geliyor, balata yeni" />
        <Field label="Açıklama (isteğe bağlı)" value={body} onChangeText={setBody} multiline maxLength={FORUM_LIMITS.bodyMax}
          placeholder="Aracın modeli, yılı, kilometresi, ne denedin, belirtiler…" style={{ minHeight: 120, textAlignVertical: 'top' }}
          hint={`${body.length} / ${FORUM_LIMITS.bodyMax}`} />

        <Card style={{ gap: space.md }}>
          <Text v="bodyStrong">Fotoğraf ya da video</Text>
          <PendingMediaRow media={media} onRemove={(uri) => setMedia(media.filter((m) => m.uri !== uri))} />
          <AttachButtons media={media} onPick={attach} busy={picking} />
          <Muted small>En fazla 4 fotoğraf ya da 1 video (en fazla 60 saniye). Kaldırmak için önizlemeye dokun.</Muted>
        </Card>

        <ErrorText>{err}</ErrorText>
        <Muted small style={{ color: colors.textMuted }}>
          Paylaştığın konu diğer işletmelere {business?.name ? `“${business.name}”` : 'işletmen'} adıyla görünür. Müşteri adı, plaka ve telefon gibi kişisel
          bilgileri fotoğraflarda ve metinde paylaşma. Hakaret, reklam ve uygunsuz içerik şikâyet edilince gizlenir.
        </Muted>
      </Stack>
    </Screen>
  );
}
