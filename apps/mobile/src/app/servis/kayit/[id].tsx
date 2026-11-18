/**
 * Servis kaydı (işletme görünümü): döküm, ödeme, fotoğraflar, durum geçmişi; düzeltme, tamamlama, silme.
 * Müşteri onayı zorunlu değil: esnaf "Ücret alındı" deyince kayıt tamamlanır ve ciroya girer.
 */
import {
  balanceKurus,
  formatKurus,
  kurusToInput,
  parseKurus,
  PAYMENT_METHOD_LABEL,
  validatePayment,
  type PaymentMethod,
  type ServiceRecord,
} from '@piston/core';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { PaymentCard } from '@/components/payments';
import { FilesGrid, HistoryList, IntakeCard, ItemsList, ResponsesList, TotalsCard } from '@/components/servis';
import { Button, Card, Chip, Empty, ErrorText, Field, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { serviceRepo, useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { confirm } from '@/lib/confirm';
import { pickServicePhoto } from '@/lib/photo';
import { env } from '@/lib/env';
import { openWhatsApp, recordPdfFile, shareRecordPdf, whatsappMessage } from '@/lib/share-record';

const msg = (e: unknown, fallback: string) => (e instanceof RepoError ? e.message : fallback);

export default function RecordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const biz = useBusiness();
  const [r, setR] = useState<ServiceRecord | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  const load = useCallback(async () => {
    try {
      setR(await serviceRepo.getRecord(id));
      setLoadErr(null);
    } catch (e) {
      setLoadErr(msg(e, 'Kayıt yüklenemedi.'));
    }
  }, [id]);
  // Liste her güncellendiğinde (ör. müşteri yanıt verdiğinde) kayıt yeniden okunur
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load, biz.records]);

  if (loadErr) return <Screen title="Servis kaydı" back><Empty title="Kayıt açılamadı" body={loadErr} action="Tekrar dene" onAction={load} /></Screen>;
  if (!r) return <Screen title="Servis kaydı" back><Muted>Yükleniyor…</Muted></Screen>;

  const open = r.status !== 'completed';
  const lastObjection = [...r.responses].reverse().find((a) => a.action === 'objected');

  const edit = async () => {
    if (r.status === 'approved') {
      const ok = await confirm('Onaylı kaydı düzelt', 'Müşteri bu kaydı onayladı. Değişiklik yaparsan eski ve yeni değerler saklanır.', 'Düzelt');
      if (!ok) return;
    }
    if (r.status === 'completed') {
      const ok = await confirm('Tamamlanan kaydı düzelt', 'Kayıt tamamlanmış olarak kalır; eski hâli saklanır. Ciro ve müşterinin borcu yeni tutara göre güncellenir.', 'Düzelt');
      if (!ok) return;
    }
    router.push({ pathname: '/servis/yeni-kayit', params: { duzenle: r.id } });
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    if (!biz.business) return;
    setErr(null);
    const res = await pickServicePhoto(source);
    if (!res.ok) {
      if (res.reason === 'denied') setErr('Kamera izni verilmedi. Ayarlardan izin verebilirsin.');
      else if (res.reason === 'failed') setErr('Fotoğraf eklenemedi. Tekrar dene.');
      return;
    }
    if (r.files.length >= 20) return setErr('Bir kayda en fazla 20 fotoğraf eklenebilir.');
    setPhotoBusy(true);
    try {
      const bid = biz.business.id;
      await biz.run((x) => x.addFiles(bid, r.id, [{ uri: res.uri, kind: 'intake', mimeType: 'image/jpeg', sizeBytes: res.sizeBytes }]));
      await load();
    } catch (e) {
      setErr(msg(e, 'Fotoğraf kaydedilemedi.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setErr(null);
    try {
      await biz.run((x) => x.deleteRecord(r.id, deleteReason.trim() || null));
      if (router.canGoBack()) router.back();
      else router.replace('/servis/kayitlar');
    } catch (e) {
      setErr(msg(e, 'Kayıt silinemedi.'));
      setBusy(false);
    }
  };

  // PDF oluşturulur, sunucuya yüklenir; 30 gün geçerli bağlantısı müşterinin numarasıyla açılan mesaja eklenir.
  // Demo sürümde sunucu yok: mesaj bağlantısız gider. PDF oluşturulamaz ya da yüklenemezse mesaj yine açılır ve uyarı gösterilir.
  const sendWhatsApp = async () => {
    if (!biz.business) return;
    setSending(true);
    setErr(null);
    let link: string | null = null;
    let warn: string | null = null;
    try {
      const file = await recordPdfFile(r, biz.business);
      if (file) link = await serviceRepo.recordPdfLink(biz.business.id, r.id, file);
    } catch (e) {
      warn = `PDF bağlantısı eklenemedi (${msg(e, 'bağlantı hatası')}). Mesaj PDF'siz açıldı; PDF'i aşağıdan ayrıca paylaşabilirsin.`;
    }
    const ok = await openWhatsApp(r.customerPhone, whatsappMessage(r, link));
    setSending(false);
    if (!ok) setErr('WhatsApp açılamadı. Telefonunda WhatsApp yüklü mü?');
    else if (warn) setErr(warn);
  };
  const sharePdf = async () => {
    if (!biz.business) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await shareRecordPdf(r, biz.business);
      if (res === 'unavailable') setErr('Bu cihazda paylaşım kullanılamıyor.');
    } catch {
      setErr('PDF oluşturulamadı. Tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Servis kaydı" back>
      <Stack gap={space.md}>
        {r.status === 'objected' && lastObjection && (
          <Card style={{ borderColor: colors.danger, gap: 6 }}>
            <Text v="bodyStrong" color={colors.danger}>Müşteri itiraz etti</Text>
            <Text>{lastObjection.reason}</Text>
            <Muted small>Gerekirse kaydı düzelt. Anlaştıysanız aşağıdan ücreti alıp kaydı yine de tamamlayabilirsin.</Muted>
            <Button title="Kaydı düzelt" onPress={edit} />
          </Card>
        )}

        <Card style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text v="bodyStrong">Kaydı düzelt</Text>
              <Muted small>{open ? 'Parça, fiyat, işçilik ya da araç bilgisini değiştir.' : 'Kayıt tamamlandı; düzeltirsen ciro ve borç yeni tutara göre güncellenir.'}</Muted>
            </View>
            <Button title="Düzelt" icon="edit" small variant="outline" onPress={edit} />
          </Row>
        </Card>

        {open && (
          <ChargeCard r={r} onDone={load}
            onCharge={async (amount, method, requestId) => {
              if (amount > 0) {
                await biz.run((x) => x.addPayment({ recordId: r.id, amountKurus: amount, method, paidAt: null, note: null, clientRequestId: requestId }));
              }
              await biz.run((x) => x.completeRecord(r.id));
            }} />
        )}

        <Card style={{ gap: space.sm }}>
          <Text v="bodyStrong">Müşteriye gönder</Text>
          <Button title="WhatsApp ile PDF gönder" icon="forum" variant="primary" onPress={sendWhatsApp} loading={sending} />
          <Button title="PDF’i başka yolla paylaş" icon="doc" onPress={sharePdf} loading={busy} />
          <Muted small>
            {env.isDemo
              ? 'Demo sürümde sunucu olmadığı için mesaj PDF bağlantısı olmadan açılır; PDF’i “başka yolla paylaş” ile gönder. Sunucu bağlanınca PDF bağlantısı mesaja kendiliğinden eklenecek.'
              : 'Müşterinin numarasıyla mesaj hazır açılır; içinde 30 gün açılabilen PDF bağlantısı vardır. Gönder tuşuna sen basarsın.'}
          </Muted>
        </Card>

        <IntakeCard r={r} />
      </Stack>

      <Section title="Araç fotoğrafları">
        <Card style={{ gap: space.sm }}>
          {r.files.length > 0 ? <FilesGrid files={r.files} /> : <Muted small>Henüz fotoğraf yok. Aracın kabuldeki hâlini, hasarları ya da değişen parçaları çekebilirsin.</Muted>}
          <Row gap={space.sm}>
            <Button title="Fotoğraf çek" icon="camera" small onPress={() => addPhoto('camera')} loading={photoBusy} />
            <Button title="Galeriden ekle" small onPress={() => addPhoto('library')} disabled={photoBusy} />
          </Row>
        </Card>
      </Section>

      <Section title="Değişen parçalar ve işçilik"><ItemsList items={r.items} /></Section>
      <Section title="Tutar"><TotalsCard totals={r.totals} /></Section>
      <Section title="Tahsilat">
        <PaymentCard r={r}
          onAdd={async (p) => { await biz.run((x) => x.addPayment(p)); setErr(null); await load(); }}
          onVoid={async (pid, reason) => { await biz.run((x) => x.voidPayment(pid, reason)); setErr(null); await load(); }} />
      </Section>
      {r.responses.length > 0 && <Section title="Müşteri yanıtları"><ResponsesList r={r} /></Section>}
      <Section title="Durum geçmişi"><HistoryList r={r} /></Section>

      <ErrorText>{err}</ErrorText>
      {!open && <Muted small style={{ marginTop: space.lg }}>Bu kayıt tamamlandı. Düzeltme, fotoğraf ve ödeme eklenebilir.</Muted>}

      {biz.canDelete && !deleting && (
        <Button title="Kaydı sil" icon="trash" variant="ghost" style={{ marginTop: space.md }}
          onPress={() => { setDeleting(true); setDeleteReason(''); setErr(null); }} />
      )}
      {biz.canDelete && deleting && (
        <Card style={{ borderColor: colors.danger, gap: space.sm, marginTop: space.md }}>
          <Text v="bodyStrong" color={colors.danger}>Bu kayıt silinsin mi?</Text>
          <Muted small>
            Kayıt listelerden, müşteri ekranından ve OTOM CİRO’dan çıkar. Denetim için arka planda saklanır.
            {r.payments.some((p) => !p.voidedAt) ? ' Bu kayıtta alınmış ödeme var: önce Tahsilat bölümünden ödemeyi iptal et.' : ''}
          </Muted>
          <Field label="Sebep (isteğe bağlı)" value={deleteReason} onChangeText={setDeleteReason} placeholder="Örn. Yanlışlıkla açıldı" />
          <Row gap={space.sm}>
            <Button title="Vazgeç" onPress={() => setDeleting(false)} style={{ flex: 1 }} />
            <Button title="Kaydı sil" variant="danger" onPress={doDelete} loading={busy} style={{ flex: 1 }} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}

/** "Ücret alındı": kalan tutarı (değiştirilebilir) ödeme olarak yazar ve kaydı tamamlar. */
function ChargeCard({ r, onCharge, onDone }: {
  r: ServiceRecord;
  onCharge: (amountKurus: number, method: PaymentMethod, requestId: string) => Promise<void>;
  onDone: () => Promise<void>;
}) {
  const balance = Math.max(0, balanceKurus(r));
  const [amount, setAmount] = useState(() => kurusToInput(balance));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [requestId] = useState(() => Crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (credit: boolean) => {
    const k = credit ? 0 : parseKurus(amount);
    if (!credit) {
      if (k == null) return setErr('Alınan tutarı yaz.');
      if (k > 0) {
        const e = validatePayment(k, balance);
        if (e) return setErr(e);
      }
    }
    setBusy(true);
    setErr(null);
    try {
      await onCharge(k ?? 0, method, requestId);
      await onDone();
    } catch (e) {
      setErr(msg(e, 'Kayıt tamamlanamadı. Tekrar dene.'));
    } finally {
      setBusy(false);
    }
  };

  const k = parseKurus(amount) ?? 0;
  const rest = balance - k;

  return (
    <Card style={{ gap: space.sm }}>
      <Text v="bodyStrong">İş bitti mi?</Text>
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted>{r.payments.some((p) => !p.voidedAt) ? 'Kalan tutar' : 'Genel toplam'}</Muted>
        <Text v="bodyStrong">{formatKurus(balance)}</Text>
      </Row>
      {balance > 0 && (
        <>
          <Field label="Alınan tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <Chip key={m} label={PAYMENT_METHOD_LABEL[m]} selected={method === m} onPress={() => setMethod(m)} />
            ))}
          </Row>
          {rest > 0 && k > 0 && <Muted small>{`Kalan ${formatKurus(rest)} müşterinin borcu olarak yazılır.`}</Muted>}
        </>
      )}
      <Button title="Ücret alındı · Kaydı tamamla" icon="check" variant="primary" onPress={() => submit(false)} loading={busy} />
      {balance > 0 && (
        <Text v="small" color={colors.textMuted} onPress={() => submit(true)} accessibilityRole="button" style={{ textAlign: 'center' }}>
          Ödeme sonra · borç olarak tamamla
        </Text>
      )}
      <Muted small>Tamamlanan kayıt OTOM CİRO’ya girer. Müşteri onayı gerekmez.</Muted>
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}
