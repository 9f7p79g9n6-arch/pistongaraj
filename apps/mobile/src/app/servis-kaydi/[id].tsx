/** Müşteri tarafı: servis kaydını incele, ONAYLA ya da İTİRAZ ET. */
import { isRevenue, needsCustomerAction } from '@piston/core';

import { PaymentCard } from '@/components/payments';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { FilesGrid, HistoryList, IntakeCard, ItemsList, ResponsesList, TotalsCard } from '@/components/servis';
import { Button, Card, Empty, ErrorText, Field, Muted, Pill, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { confirm } from '@/lib/confirm';

export default function CustomerRecord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const biz = useBusiness();
  const r = biz.myRecords.find((x) => x.id === id);
  const [objecting, setObjecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'object' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!r) return <Screen title="Servis kaydı" back><Empty title="Kayıt bulunamadı" body="Bu kayıt hesabınla eşleşmiyor ya da kaldırılmış." /></Screen>;
  const canRespond = needsCustomerAction(r.status);

  const respond = async (action: 'approved' | 'objected') => {
    setErr(null);
    if (action === 'objected' && reason.trim().length < 5) return setErr('İtiraz sebebini en az 5 karakterle yaz.');
    if (action === 'approved') {
      const ok = await confirm('Kaydı onayla', `${r.businessName} tarafından yazılan işlemleri ve toplam tutarı onaylıyorsun.`, 'Onayla');
      if (!ok) return;
    }
    setBusy(action === 'approved' ? 'approve' : 'object');
    try {
      await biz.run((x) => x.respond(r.id, r.approvalVersion, action, action === 'objected' ? reason.trim() : null));
      setObjecting(false);
      setReason('');
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Yanıt gönderilemedi.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Servis kaydı" back
      footer={canRespond ? (
        objecting ? (
          <Stack gap={space.sm}>
            <Field label="İtiraz sebebi" value={reason} onChangeText={setReason} multiline placeholder="Örn. Filtre değişmedi, eski filtre duruyor" autoFocus />
            <ErrorText>{err}</ErrorText>
            <Row gap={space.sm}>
              <Button title="Vazgeç" onPress={() => { setObjecting(false); setErr(null); }} style={{ flex: 1 }} />
              <Button title="İtirazı gönder" variant="danger" onPress={() => respond('objected')} loading={busy === 'object'} style={{ flex: 2 }} />
            </Row>
          </Stack>
        ) : (
          <Stack gap={space.sm}>
            <ErrorText>{err}</ErrorText>
            <Row gap={space.sm}>
              <Button title="İTİRAZ ET" variant="ghost" onPress={() => setObjecting(true)} style={{ flex: 1 }} />
              <Button title="ONAYLA" variant="primary" icon="check" onPress={() => respond('approved')} loading={busy === 'approve'} style={{ flex: 2 }} />
            </Row>
          </Stack>
        )
      ) : undefined}>
      <Card style={{ gap: 4 }}>
        <Text v="label">İşletme</Text>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text v="section" style={{ flex: 1 }}>{r.businessName}</Text>
          {!r.businessVerified && <Pill tone="warn">Doğrulanmadı</Pill>}
        </Row>
        {!r.businessVerified && <Muted small>Bu işletmenin bilgileri henüz PISTON tarafından doğrulanmadı.</Muted>}
      </Card>

      <Stack gap={space.md} style={{ marginTop: space.md }}>
        {r.status === 'revised' && (
          <Card style={{ gap: 4 }}>
            <Text v="bodyStrong" color={colors.warnText}>İşletme kaydı düzeltti</Text>
            <Muted small>Önceki yanıtın aşağıda saklı. Güncel hâlini inceleyip yeniden karar ver.</Muted>
          </Card>
        )}
        <IntakeCard r={r} />
      </Stack>

      <Section title="Değişen parçalar ve işçilik"><ItemsList items={r.items} /></Section>
      <Section title="Tutar"><TotalsCard totals={r.totals} /></Section>
      {r.payments.length > 0 || isRevenue(r.status) ? <Section title="Ödeme"><PaymentCard r={r} /></Section> : null}
      <Section title="Fotoğraf ve belgeler"><FilesGrid files={r.files} /></Section>
      <Section title="Yanıtların"><ResponsesList r={r} /></Section>
      <Section title="Durum geçmişi"><HistoryList r={r} /></Section>

      <Muted small style={{ marginTop: space.lg }}>
        Onayın, kaydı gördüğünü ve kabul ettiğini gösterir; onay zamanı, kayıt sürümü, fotoğraflar ve belgeler ayrıca saklanır.
        Sorun olursa itiraz edebilirsin; itiraz edilen kayıt silinmez.
      </Muted>
    </Screen>
  );
}
