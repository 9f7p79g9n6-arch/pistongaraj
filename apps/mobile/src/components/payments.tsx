/**
 * Servis kaydının ödeme durumu: genel toplam, ödenen, kalan borç, ödeme geçmişi.
 * İşletme ödeme alır ve yanlış ödemeyi sebebiyle iptal eder (silinmez). Müşteri aynı kartı yalnızca okur.
 */
import {
  balanceKurus,
  formatKurus,
  isRevenue,
  kurusToInput,
  paidKurus,
  parseKurus,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATE_LABEL,
  paymentState,
  validatePayment,
  type PaymentMethod,
  type ServiceRecord,
} from '@piston/core';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';

import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import type { NewPayment } from '@/data/service-repo';
import { formatDateTime } from './servis';
import { Button, Card, Chip, Divider, ErrorText, Field, Muted, Pill, Row, Stack, Text, type Tone } from './ui';

const STATE_TONE: Record<ReturnType<typeof paymentState>, Tone> = { unpaid: 'bad', partial: 'warn', paid: 'ok', overpaid: 'info' };

export function PaymentCard({ r, onAdd, onVoid }: {
  r: ServiceRecord;
  /** Verilmezse kart salt okunur (müşteri görünümü) */
  onAdd?: (p: NewPayment) => Promise<void>;
  onVoid?: (paymentId: string, reason: string) => Promise<void>;
}) {
  const paid = paidKurus(r.payments);
  const balance = balanceKurus(r);
  const state = paymentState(r);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [requestId, setRequestId] = useState(() => Crypto.randomUUID());
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = () => {
    setAmount(kurusToInput(Math.max(0, balance)));
    setMethod('cash');
    setNote('');
    setRequestId(Crypto.randomUUID());
    setErr(null);
    setOpen(true);
  };

  const save = async () => {
    if (!onAdd) return;
    const k = parseKurus(amount);
    const e = validatePayment(k, balance);
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      await onAdd({ recordId: r.id, amountKurus: k!, method, paidAt: null, note: note.trim() || null, clientRequestId: requestId });
      setOpen(false);
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Ödeme kaydedilemedi. Tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const doVoid = async () => {
    if (!onVoid || !voiding) return;
    if (reason.trim().length < 3) return setErr('İptal sebebini yaz.');
    setBusy(true);
    setErr(null);
    try {
      await onVoid(voiding, reason.trim());
      setVoiding(null);
      setReason('');
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Ödeme iptal edilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="bodyStrong">Ödeme</Text>
        <Pill tone={STATE_TONE[state]}>{PAYMENT_STATE_LABEL[state]}</Pill>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}><Muted>Genel toplam</Muted><Text>{formatKurus(r.totals.grandKurus)}</Text></Row>
      <Row style={{ justifyContent: 'space-between' }}><Muted>Ödenen</Muted><Text>{formatKurus(paid)}</Text></Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="bodyStrong">{balance < 0 ? 'Fazla ödeme' : 'Kalan borç'}</Text>
        <Text v="bodyStrong" color={balance > 0 ? colors.warnText : colors.text}>{formatKurus(Math.abs(balance))}</Text>
      </Row>
      {balance < 0 && <Muted small>Kayıt düzeltildikten sonra tutar düştü. Fazla alınan tutarı iade et ya da ilgili ödemeyi iptal edip doğru tutarla yeniden gir.</Muted>}
      {!isRevenue(r.status) && balance > 0 && <Muted small>Kayıt henüz tamamlanmadığı için borç listesine ve ciroya sayılmıyor.</Muted>}

      {r.payments.length > 0 && <Divider />}
      {r.payments.map((p) => (
        <Stack key={p.id} gap={2} style={{ opacity: p.voidedAt ? 0.55 : 1 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="small" style={{ textDecorationLine: p.voidedAt ? 'line-through' : 'none' }}>
              {`${formatDateTime(p.paidAt)} · ${PAYMENT_METHOD_LABEL[p.method]}`}
            </Text>
            <Text v="smallStrong" style={{ textDecorationLine: p.voidedAt ? 'line-through' : 'none' }}>{formatKurus(p.amountKurus)}</Text>
          </Row>
          {p.note ? <Muted small>{p.note}</Muted> : null}
          {p.voidedAt ? <Text v="small" color={colors.danger}>{`İptal edildi: ${p.voidReason}`}</Text> : null}
          {!p.voidedAt && onVoid && voiding !== p.id && (
            <Text v="small" color={colors.textMuted} onPress={() => { setVoiding(p.id); setReason(''); setErr(null); }} accessibilityRole="button">Bu ödemeyi iptal et</Text>
          )}
          {voiding === p.id && (
            <Stack gap={space.sm}>
              <Field label="İptal sebebi" value={reason} onChangeText={setReason} placeholder="Örn. Yanlış tutar girildi" autoFocus />
              <Row gap={space.sm}>
                <Button title="Vazgeç" small onPress={() => setVoiding(null)} />
                <Button title="Ödemeyi iptal et" small variant="danger" onPress={doVoid} loading={busy} />
              </Row>
            </Stack>
          )}
        </Stack>
      ))}

      {onAdd && !open && balance > 0 && <Button title="Ödeme al" icon="plus" variant="primary" onPress={start} />}
      {onAdd && open && (
        <Stack gap={space.sm}>
          <Divider />
          <Field label="Alınan tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <Chip key={m} label={PAYMENT_METHOD_LABEL[m]} selected={method === m} onPress={() => setMethod(m)} />
            ))}
          </Row>
          <Field label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Örn. Kalanı ay sonunda" />
          <Row gap={space.sm}>
            <Button title="Vazgeç" onPress={() => setOpen(false)} style={{ flex: 1 }} />
            <Button title="Ödemeyi kaydet" variant="primary" onPress={save} loading={busy} style={{ flex: 2 }} />
          </Row>
        </Stack>
      )}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}
