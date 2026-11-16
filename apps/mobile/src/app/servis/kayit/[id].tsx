/** Servis kaydı (işletme görünümü): döküm, müşteri yanıtları, durum geçmişi; düzeltme ve tamamlama. */
import { needsCustomerAction, type ServiceRecord } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { FilesGrid, HistoryList, IntakeCard, ItemsList, ResponsesList, TotalsCard } from '@/components/servis';
import { Button, Card, Empty, ErrorText, Muted, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { serviceRepo, useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { confirm } from '@/lib/confirm';
import { openWhatsApp, shareRecordPdf, whatsappMessage } from '@/lib/share-record';

export default function RecordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const biz = useBusiness();
  const [r, setR] = useState<ServiceRecord | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setR(await serviceRepo.getRecord(id));
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof RepoError ? e.message : 'Kayıt yüklenemedi.');
    }
  }, [id]);
  // Liste her güncellendiğinde (ör. müşteri yanıt verdiğinde) kayıt yeniden okunur
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load, biz.records]);

  if (loadErr) return <Screen title="Servis kaydı" back><Empty title="Kayıt açılamadı" body={loadErr} action="Tekrar dene" onAction={load} /></Screen>;
  if (!r) return <Screen title="Servis kaydı" back><Muted>Yükleniyor…</Muted></Screen>;

  const lastObjection = [...r.responses].reverse().find((a) => a.action === 'objected');
  const edit = async () => {
    if (r.status === 'approved') {
      const ok = await confirm('Onaylı kaydı düzelt', 'Müşteri bu kaydı onayladı. Değişiklik yaparsan eski ve yeni değerler saklanır ve müşteriden yeniden onay istenir.', 'Düzelt');
      if (!ok) return;
    }
    router.push({ pathname: '/servis/yeni-kayit', params: { duzenle: r.id } });
  };
  const complete = async () => {
    if (!(await confirm('Kaydı tamamla', 'Tamamlanan kayıt artık değiştirilemez.', 'Tamamla'))) return;
    setBusy(true);
    setErr(null);
    try {
      await biz.run((x) => x.completeRecord(r.id));
      await load();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Kayıt tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const sendWhatsApp = async () => {
    setErr(null);
    const ok = await openWhatsApp(r.customerPhone, whatsappMessage(r));
    if (!ok) setErr('WhatsApp açılamadı. Telefonunda WhatsApp yüklü mü?');
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
            <Muted small>Kayıt silinmez. Düzeltme gönderirsen müşteriden yeniden onay istenir.</Muted>
            <Button title="Düzeltme gönder" variant="primary" onPress={edit} />
          </Card>
        )}
        {needsCustomerAction(r.status) && (
          <Card style={{ gap: 4 }}>
            <Text v="bodyStrong" color={colors.warn}>Müşteri onayı bekleniyor</Text>
            <Muted small>{`${r.customerName} kaydı PISTON GARAGE hesabında görüp onaylayabilir (e-posta eşleşirse). Sürüm ${r.approvalVersion}.`}</Muted>
          </Card>
        )}

        <Card style={{ gap: space.sm }}>
          <Text v="bodyStrong">Müşteriye gönder</Text>
          <Button title="WhatsApp ile gönder" icon="forum" variant="primary" onPress={sendWhatsApp} />
          <Button title="PDF olarak paylaş" icon="doc" onPress={sharePdf} loading={busy} />
          <Muted small>WhatsApp, müşterinin numarasıyla mesaj hazır açılır; göndere sen basarsın. PDF’i paylaşım menüsünden WhatsApp’a ekleyebilirsin. Uygulamaya girmeden onay verilebilen güvenli bağlantı, sunucu bağlanınca eklenecek.</Muted>
        </Card>
        {r.status === 'approved' && (
          <Card style={{ gap: 4 }}>
            <Text v="bodyStrong" color={colors.neon}>Müşteri onayladı</Text>
            <Muted small>Araç teslim edildiyse kaydı tamamla.</Muted>
            <Button title="Kaydı tamamla" variant="primary" onPress={complete} loading={busy} />
          </Card>
        )}

        <IntakeCard r={r} />
      </Stack>

      <Section title="Değişen parçalar ve işçilik"><ItemsList items={r.items} /></Section>
      <Section title="Tutar"><TotalsCard totals={r.totals} /></Section>
      <Section title="Fotoğraf ve belgeler"><FilesGrid files={r.files} /></Section>
      <Section title="Müşteri yanıtları"><ResponsesList r={r} /></Section>
      <Section title="Durum geçmişi"><HistoryList r={r} /></Section>

      <ErrorText>{err}</ErrorText>
      {r.status !== 'completed' && r.status !== 'objected' && (
        <Button title="Kaydı düzelt" variant="ghost" style={{ marginTop: space.xl }} onPress={edit} />
      )}
      {r.status === 'completed' && <Muted small style={{ marginTop: space.lg }}>Bu kayıt tamamlandı; değiştirilemez.</Muted>}
    </Screen>
  );
}
