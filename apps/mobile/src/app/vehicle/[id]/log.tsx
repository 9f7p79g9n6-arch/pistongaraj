import { formatNumber, parseDateTR, parseNumberTR, toDateTR } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Chip, ErrorText, Field, Row, Screen, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { useApp, useVehicle } from '@/data/store';

/** Yapılan bakım işlemini kaydeder; seçilen hatırlatmanın sayacı sıfırlanır. */
export default function LogMaintenance() {
  const { id, ruleId: initialRule } = useLocalSearchParams<{ id: string; ruleId?: string }>();
  const { vehicle, bundle } = useVehicle(id);
  const { run, today } = useApp();
  const [ruleId, setRuleId] = useState<string | null>(initialRule ?? null);
  const [title, setTitle] = useState(bundle.rules.find((r) => r.id === initialRule)?.title ?? '');
  const [date, setDate] = useState(toDateTR(today));
  const [km, setKm] = useState(vehicle ? formatNumber(vehicle.odometerKm) : '');
  const [cost, setCost] = useState('');
  const [by, setBy] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!vehicle) return null;

  const intervalRules = bundle.rules.filter((r) => r.kind === 'interval');

  const save = async () => {
    const d = parseDateTR(date);
    const k = km.trim() ? parseNumberTR(km) : null;
    const c = cost.trim() ? parseNumberTR(cost) : null;
    if (!title.trim()) return setErr('Yapılan işlemi yaz ya da listeden seç.');
    if (!d) return setErr('Tarihi GG.AA.YYYY biçiminde gir.');
    if (d > today) return setErr('İleri tarihli işlem kaydedilemez.');
    if (km.trim() && (k == null || k < 0 || k > 2_000_000)) return setErr('Kilometreyi kontrol et.');
    if (cost.trim() && (c == null || c < 0)) return setErr('Tutarı kontrol et.');
    setErr(null);
    setBusy(true);
    try {
      await run((r) => r.addEvent({
        vehicleId: vehicle.id, ruleId, title: title.trim(), performedOn: d, odometerKm: k != null ? Math.round(k) : null,
        cost: c, performedBy: by.trim() || null, notes: notes.trim() || null,
      }));
      router.back();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="İşlem ekle" back footer={<Button title="Kaydet" variant="primary" onPress={save} loading={busy} />}>
      <Stack gap={space.lg}>
        {intervalRules.length > 0 && (
          <Stack gap={space.sm}>
            <Text v="smallStrong" color={colors.textMuted}>Hangi hatırlatma için? (sayaç sıfırlanır)</Text>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {intervalRules.map((r) => (
                <Chip key={r.id} label={r.title} selected={ruleId === r.id}
                  onPress={() => { setRuleId(ruleId === r.id ? null : r.id); if (ruleId !== r.id) setTitle(r.title); }} />
              ))}
            </Row>
          </Stack>
        )}
        <Field label="Yapılan işlem" value={title} onChangeText={setTitle} placeholder="Örn. Ön fren balatası değişti" />
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Field label="Tarih" value={date} onChangeText={setDate} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />
          <Field label="Kilometre" value={km} onChangeText={setKm} keyboardType="number-pad" />
        </Row>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Field label="Tutar (₺)" value={cost} onChangeText={setCost} placeholder="0" keyboardType="decimal-pad" />
          <Field label="Kim yaptı" value={by} onChangeText={setBy} placeholder="Servis adı ya da Kendim" />
        </Row>
        <Field label="Not" value={notes} onChangeText={setNotes} placeholder="Kullanılan parça, garanti vb." multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
        <ErrorText>{err}</ErrorText>
      </Stack>
    </Screen>
  );
}
