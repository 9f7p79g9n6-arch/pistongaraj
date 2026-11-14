import { EXPENSE_LABEL, parseDateTR, parseNumberTR, toDateTR, type ExpenseCategory } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Chip, ErrorText, Field, Muted, Row, Screen, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { useApp, useVehicle } from '@/data/store';

export default function AddExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicle } = useVehicle(id);
  const { run, today } = useApp();
  const [cat, setCat] = useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(toDateTR(today));
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!vehicle) return null;

  const save = async () => {
    const a = parseNumberTR(amount);
    const d = parseDateTR(date);
    if (!cat) return setErr('Bir kategori seç.');
    if (a == null || a <= 0) return setErr('Tutarı gir.');
    if (!d) return setErr('Tarihi GG.AA.YYYY biçiminde gir.');
    if (d > today) return setErr('İleri tarihli masraf girilemez.');
    setErr(null);
    setBusy(true);
    try {
      await run((r) => r.addExpense({ vehicleId: vehicle.id, category: cat, amount: a, spentOn: d, note: note.trim() || null }));
      router.back();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Masraf ekle" back footer={<Button title="Kaydet" variant="primary" onPress={save} loading={busy} />}>
      <Stack gap={space.lg}>
        <Stack gap={space.sm}>
          <Text v="smallStrong" color={colors.textMuted}>Kategori</Text>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {(Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).map((c) => <Chip key={c} label={EXPENSE_LABEL[c]} selected={cat === c} onPress={() => setCat(c)} />)}
          </Row>
          <Muted small>Yakıt alımlarını “Yakıt kaydı” ile gir; tüketim hesabı ona göre yapılır.</Muted>
        </Stack>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Field label="Tutar (₺)" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" />
          <Field label="Tarih" value={date} onChangeText={setDate} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />
        </Row>
        <Field label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Örn. Kasko 2. taksit" maxLength={500} />
        <ErrorText>{err}</ErrorText>
      </Stack>
    </Screen>
  );
}
