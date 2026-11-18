/** Yeni paylaşım ya da soru: metin, en fazla 4 fotoğraf ya da 1 video, isteğe bağlı marka grubu. */
import { FORUM_LIMITS, SOCIAL_LIMITS, validateDisplayName, validateForumMedia, validateSocialPost, type SocialGroup, type SocialPostKind } from '@piston/core';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { AttachButtons, PendingMediaRow } from '@/components/forum';
import { Button, Card, Chip, ErrorText, Field, Muted, Row, Screen, Segmented, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import type { PendingForumMedia } from '@/data/forum-repo';
import { RepoError } from '@/data/repo';
import { socialRepo } from '@/data/social';
import { useApp } from '@/data/store';
import { pickForumMedia } from '@/lib/forum-media';

export default function NewSocialPost() {
  const params = useLocalSearchParams<{ tur?: string; grup?: string }>();
  const { account, refresh } = useApp();
  const needsName = !account?.displayName || account.displayName.trim().length < SOCIAL_LIMITS.nameMin;
  const [kind, setKind] = useState<SocialPostKind>(params.tur === 'soru' ? 'question' : 'post');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [groupId, setGroupId] = useState<string | null>(params.grup ?? null);
  const [groups, setGroups] = useState<SocialGroup[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [media, setMedia] = useState<PendingForumMedia[]>([]);
  const [requestId] = useState(() => Crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { socialRepo.groups().then(setGroups).catch(() => setGroups([])); }, []);

  const attach = async (source: 'camera' | 'library', k: 'image' | 'video') => {
    setErr(null);
    setPicking(true);
    const res = await pickForumMedia(source, k, FORUM_LIMITS.maxImages - media.filter((m) => m.kind === 'image').length);
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
    if (needsName) {
      const ne = validateDisplayName(name);
      if (ne) return setErr(ne);
    }
    const e = validateSocialPost({ kind, body, media });
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      if (needsName) {
        await socialRepo.setMyName(name);
        await refresh();
      }
      const id = await socialRepo.createPost({ kind, groupId, body, media, clientRequestId: requestId });
      router.replace(`/sosyal/${id}`);
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Paylaşılamadı. Tekrar dene.');
      setBusy(false);
    }
  };

  // Önce katıldığım gruplar; "tümü" açılınca diğerleri
  const joined = groups.filter((g) => g.joined || g.id === groupId);
  const visible = showAll ? groups : joined;
  const isQ = kind === 'question';

  return (
    <Screen title={isQ ? 'Soru sor' : 'Yeni paylaşım'} back
      footer={<Button title={isQ ? 'Soruyu paylaş' : 'Paylaş'} icon="send" variant="primary" onPress={share} loading={busy} disabled={picking} />}>
      <Stack gap={space.lg}>
        <Segmented options={[{ value: 'post', label: 'Paylaşım' }, { value: 'question', label: 'Soru' }]} value={kind} onChange={setKind} />

        {needsName && (
          <Card style={{ gap: space.sm }}>
            <Field label="Adın" value={name} onChangeText={setName} maxLength={SOCIAL_LIMITS.nameMax} autoCapitalize="words"
              placeholder="Örn. Ahmet Y." hint="Paylaşımlarında bu ad görünür. Profilinden değiştirebilirsin." />
          </Card>
        )}

        <Field label={isQ ? 'Sorun' : 'Açıklama'} value={body} onChangeText={setBody} multiline maxLength={SOCIAL_LIMITS.bodyMax}
          placeholder={isQ ? 'Örn. 2018 Egea 1.3 dizel, soğukta geç çalışıyor. Ne olabilir?' : 'Örn. Yeni jantlar takıldı, nasıl olmuş?'}
          style={{ minHeight: 110, textAlignVertical: 'top' }} hint={`${body.length} / ${SOCIAL_LIMITS.bodyMax}`} />

        <Card style={{ gap: space.md }}>
          <Text v="bodyStrong">Fotoğraf ya da video{isQ ? ' (isteğe bağlı)' : ''}</Text>
          <PendingMediaRow media={media} onRemove={(uri) => setMedia(media.filter((m) => m.uri !== uri))} />
          <AttachButtons media={media} onPick={attach} busy={picking} />
          <Muted small>En fazla 4 fotoğraf ya da 1 video (en fazla 60 saniye). Kaldırmak için önizlemeye dokun.</Muted>
        </Card>

        <Stack gap={space.sm}>
          <Text v="smallStrong">Marka grubu (isteğe bağlı)</Text>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            <Chip label="Grupsuz" selected={groupId == null} onPress={() => setGroupId(null)} />
            {visible.map((g) => <Chip key={g.id} label={g.name} selected={groupId === g.id} onPress={() => setGroupId(g.id)} />)}
            {!showAll && groups.length > joined.length && <Chip label="Tüm markalar…" onPress={() => setShowAll(true)} />}
          </Row>
        </Stack>

        <ErrorText>{err}</ErrorText>
        <Muted small>
          Paylaşımın tüm OTOM kullanıcılarına görünür. Plaka, telefon ve adres gibi kişisel bilgileri paylaşma.
          Hakaret, reklam ve uygunsuz içerik şikâyet edilince gizlenir ve kaldırılır.
        </Muted>
      </Stack>
    </Screen>
  );
}
