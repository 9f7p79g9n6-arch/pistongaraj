/**
 * Trafik cezaları: ekleme, indirimli ödeme süresi, ödendi işaretleme.
 * Süreler tebliğ tarihinden işler; ödenen ceza "Ceza" masrafı olarak yıllık giderlere eklenir.
 */
import {
  fineInfo,
  FINE_STATUS_LABEL,
  formatDate,
  formatTL,
  parseDateTR,
  parseNumberTR,
  sortFines,
  toDateTR,
  validateFine,
  type TrafficFine,
} from '@piston/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Empty, ErrorText, Field, Muted, Pill, Row, Screen, Section, Stack, Text, type Tone } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { useApp, useVehicle } from '@/data/store';
import { confirm } from '@/lib/confirm';

const TONE = { discount: 'warn', due: 'bad', overdue: 'bad', paid: 'ok' } as const satisfies Record<string, Tone>;

export default function Fines() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicle, bundle } = useVehicle(id);
  const { today } = useApp();
  const [adding, setAdding] = useState(false);
  if (!vehicle) return null;

  const fines = sortFines(bundle.fines, today);
  const open = fines.filter((f) => !f.paidOn);
  const paid = fines.filter((f) => f.paidOn);

  return (
    <Screen title="Trafik cezaları" back>
      <Stack gap={space.md}>
        <Muted small>
          Ceza, tebliğ tarihinden itibaren 15 gün içinde ödenirse %25 indirimli ödenir. Normal ödeme süresi bir aydır. Güncel tutarı ve ödemeyi e-Devlet ya da bankandan kontrol et.
        </Muted>
        {adding ? (
          <AddFine vehicleId={vehicle.id} onDone={() => setAdding(false)} />
        ) : (
          <Button title="Ceza ekle" icon="plus" variant="primary" onPress={() => setAdding(true)} />
        )}
      </Stack>

      <Section title="Ödenmemiş">
        {open.length ? <Stack>{open.map((f) => <FineCard key={f.id} fine={f} />)}</Stack>
          : <Empty title="Ödenmemiş ceza yok" body="Ceza geldiğinde ekle; indirim süresi bitmeden hatırlatalım." />}
      </Section>

      {paid.length > 0 && (
        <Section title="Ödenenler">
          <Stack>{paid.map((f) => <FineCard key={f.id} fine={f} />)}</Stack>
        </Section>
      )}
    </Screen>
  );
}

function FineCard({ fine }: { fine: TrafficFine }) {
  const { today, run } = useApp();
  const info = fineInfo(fine, today);
  const [paying, setPaying] = useState(false);
  const [paidAmount, setPaidAmount] = useState(String(info.status === 'discount' ? info.discountedAmount : fine.amount).replace('.', ','));
  const [paidOn, setPaidOn] = useState(toDateTR(today));
  const [err, setErr] = useState<string | null>(null);

  const pay = async () => {
    const a = parseNumberTR(paidAmount);
    const d = parseDateTR(paidOn);
    if (a == null || a <= 0) return setErr('Ödediğin tutarı gir.');
    if (!d || d > today) return setErr('Ödeme tarihini GG.AA.YYYY biçiminde gir.');
    try {
      await run((r) => r.payFine(fine.id, d, a));
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Kaydedilemedi.');
    }
  };

  const remove = async () => {
    if (await confirm('Cezayı sil', 'Bu ceza kaydı silinsin mi? Ödendiyse giderlere eklenen masraf kalır.', 'Sil', true)) {
      await run((r) => r.deleteFine(fine.id));
    }
  };

  return (
    <Card style={{ gap: space.sm }} highlight={info.status === 'discount'}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text v="bodyStrong">{fine.description || 'Trafik cezası'}</Text>
          <Muted small>Ceza {formatDate(fine.fineDate)} · Tebliğ {formatDate(fine.notifiedOn)}</Muted>
        </View>
        <Pill tone={TONE[info.status]}>{FINE_STATUS_LABEL[info.status]}</Pill>
      </Row>

      {info.status === 'paid' ? (
        <Muted small>{formatDate(fine.paidOn!)} tarihinde {formatTL(fine.paidAmount!)} ödendi.</Muted>
      ) : (
        <>
          <Row gap={space.lg}>
            <View>
              <Muted small>İndirimli</Muted>
              <Text v="number" color={info.status === 'discount' ? colors.neon : colors.textMuted}>{formatTL(info.discountedAmount)}</Text>
            </View>
            <View>
              <Muted small>Normal</Muted>
              <Text v="number">{formatTL(fine.amount)}</Text>
            </View>
          </Row>
          {info.status === 'discount' && (
            <Text v="smallStrong" color={colors.warn}>
              {info.daysLeftForDiscount === 0 ? 'İndirimin bugün son günü' : `İndirime ${info.daysLeftForDiscount} gün kaldı`} · son gün {formatDate(info.discountUntil)}
            </Text>
          )}
          {info.status === 'due' && (
            <Text v="smallStrong" color={colors.danger}>İndirim süresi geçti. Son ödeme günü {formatDate(info.dueOn)}.</Text>
          )}
          {info.status === 'overdue' && (
            <Text v="smallStrong" color={colors.danger}>Ödeme süresi {formatDate(info.dueOn)} tarihinde doldu; gecikme zammı uygulanabilir. Güncel tutarı e-Devlet’ten kontrol et.</Text>
          )}

          {paying ? (
            <Stack gap={space.sm}>
              <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                <Field label="Ödenen tutar (₺)" value={paidAmount} onChangeText={setPaidAmount} keyboardType="decimal-pad" />
                <Field label="Ödeme tarihi" value={paidOn} onChangeText={setPaidOn} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />
              </Row>
              <ErrorText>{err}</ErrorText>
              <Row gap={space.sm}>
                <Button title="Kaydet" variant="primary" small style={{ flex: 1 }} onPress={pay} />
                <Button title="Vazgeç" variant="ghost" small style={{ flex: 1 }} onPress={() => setPaying(false)} />
              </Row>
            </Stack>
          ) : (
            <Row gap={space.sm}>
              <Button title="Ödedim" small icon="check" style={{ flex: 1 }} onPress={() => setPaying(true)} />
              <Button title="Sil" small variant="ghost" icon="trash" onPress={remove} />
            </Row>
          )}
        </>
      )}
    </Card>
  );
}

function AddFine({ vehicleId, onDone }: { vehicleId: string; onDone: () => void }) {
  const { run, today } = useApp();
  const [fineDate, setFineDate] = useState(toDateTR(today));
  const [notified, setNotified] = useState(toDateTR(today));
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const input = { fineDate: parseDateTR(fineDate), notifiedOn: parseDateTR(notified), amount: parseNumberTR(amount) };
    const e = validateFine(input, today);
    setErrs(e);
    if (e.length) return;
    setBusy(true);
    try {
      await run((r) => r.addFine({ vehicleId, fineDate: input.fineDate!, notifiedOn: input.notifiedOn!, amount: input.amount!, description: desc.trim() || null }));
      onDone();
    } catch (err) {
      setErrs([err instanceof RepoError ? err.message : 'Kaydedilemedi.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space.md }}>
      <Text v="bodyStrong">Yeni ceza</Text>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <Field label="Ceza tarihi" value={fineDate} onChangeText={setFineDate} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />
        <Field label="Tebliğ tarihi" value={notified} onChangeText={setNotified} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />
      </Row>
      <Muted small>Yerinde kesilen cezada tebliğ tarihi ceza tarihidir. Posta ya da e-Tebligat ile geldiyse teslim aldığın tarihi yaz.</Muted>
      <Field label="Tutar (₺)" value={amount} onChangeText={setAmount} placeholder="2.167" keyboardType="decimal-pad" />
      <Field label="Açıklama (isteğe bağlı)" value={desc} onChangeText={setDesc} placeholder="Örn. Hız sınırı ihlali" maxLength={200} />
      {errs.map((e) => <ErrorText key={e}>{e}</ErrorText>)}
      <Row gap={space.sm}>
        <Button title="Kaydet" variant="primary" style={{ flex: 1 }} onPress={save} loading={busy} />
        <Button title="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={onDone} />
      </Row>
    </Card>
  );
}
