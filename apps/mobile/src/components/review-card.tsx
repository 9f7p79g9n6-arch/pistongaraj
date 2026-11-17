/** Müşteri: tamamlanan servis kaydı için işletmeyi değerlendirme (1–5 yıldız + yorum). Kayıt başına bir yorum; güncellenebilir. */
import { validateReview } from '@piston/core';
import { useEffect, useState } from 'react';

import { space } from '@/constants/theme';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';
import { StarInput } from './market';
import { Button, Card, ErrorText, Field, Muted, Text } from './ui';

export function ReviewCard({ recordId, businessName }: { recordId: string; businessName: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    marketRepo.myReview(recordId).then((r) => {
      if (!alive || !r) return;
      setRating(r.rating);
      setComment(r.comment ?? '');
      setExisting(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, [recordId]);

  if (!marketRepo.available) return null;

  const save = async () => {
    const e = validateReview({ rating, comment });
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      await marketRepo.addReview(recordId, rating, comment.trim());
      setExisting(true);
      setDone(true);
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Yorum kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Text v="bodyStrong">{existing ? 'Değerlendirmen' : `${businessName} nasıldı?`}</Text>
      <Muted small>Yorumun adın olmadan “Doğrulanmış müşteri” olarak işletmenin rehber sayfasında görünür.</Muted>
      <StarInput value={rating} onChange={(v) => { setRating(v); setDone(false); }} />
      <Field label="Yorum (isteğe bağlı)" value={comment} onChangeText={(t) => { setComment(t); setDone(false); }} multiline maxLength={500}
        placeholder="Örn. Zamanında teslim etti, fiyat söylendiği gibiydi" />
      <ErrorText>{err}</ErrorText>
      {done && <Text v="small" color="#1E7D53">Teşekkürler, değerlendirmen kaydedildi.</Text>}
      <Button title={existing ? 'Değerlendirmeyi güncelle' : 'Değerlendir'} variant="outline" onPress={save} loading={busy} disabled={rating === 0} />
    </Card>
  );
}
