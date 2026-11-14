import {
  formatNumber,
  MAINTENANCE_ITEMS,
  parseDateTR,
  parseNumberTR,
  SOURCE_LABEL,
  toDateTR,
  validateRule,
  type MaintenanceRule,
  type RuleKind,
} from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Chip, ErrorText, Field, Muted, Row, Screen, Segmented, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { useApp, useVehicle } from '@/data/store';
import { confirm } from '@/lib/confirm';

const numStr = (n: number | null) => (n == null ? '' : formatNumber(n));

export default function RuleEditor() {
  const { id, ruleId } = useLocalSearchParams<{ id: string; ruleId?: string }>();
  const { vehicle, bundle } = useVehicle(id);
  const existing = bundle.rules.find((r) => r.id === ruleId) ?? null;
  // Sayfa doğrudan açıldıysa (ör. web'de yenileme) kayıtlar yüklenene kadar formu kurma; yoksa form boş açılır
  if (!vehicle || (ruleId && !existing)) {
    return <Screen title="Hatırlatma" back><Muted>Yükleniyor…</Muted></Screen>;
  }
  return <RuleForm key={existing?.id ?? 'new'} vehicleId={vehicle.id} existing={existing} />;
}

function RuleForm({ vehicleId, existing }: { vehicleId: string; existing: MaintenanceRule | null }) {
  const { vehicle } = useVehicle(vehicleId);
  const { run, today } = useApp();

  const [itemKey, setItemKey] = useState(existing?.itemKey ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<RuleKind>(existing?.kind ?? 'interval');
  const [source, setSource] = useState<MaintenanceRule['source']>(existing?.source ?? 'user');
  const [everyKm, setEveryKm] = useState(numStr(existing?.everyKm ?? null));
  const [everyM, setEveryM] = useState(existing?.everyMonths ? String(existing.everyMonths) : '');
  const [lastKm, setLastKm] = useState(numStr(existing?.lastDoneKm ?? null));
  const [lastOn, setLastOn] = useState(toDateTR(existing?.lastDoneOn));
  const [dueOn, setDueOn] = useState(toDateTR(existing?.dueOn));
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (!vehicle) return null;

  const pick = (key: string) => {
    const it = MAINTENANCE_ITEMS.find((i) => i.key === key)!;
    setItemKey(key);
    setTitle(key === 'custom' ? '' : it.title);
    setKind(it.kind);
    setSource(it.source);
    if (it.kind === 'interval' && !lastKm) setLastKm(formatNumber(vehicle.odometerKm));
    if (it.kind === 'interval' && !lastOn) setLastOn(toDateTR(today));
  };

  const save = async () => {
    const dateErrs: string[] = [];
    const lastOnISO = lastOn.trim() ? parseDateTR(lastOn) : null;
    const dueOnISO = dueOn.trim() ? parseDateTR(dueOn) : null;
    if (lastOn.trim() && !lastOnISO) dateErrs.push('Son yapıldığı tarihi GG.AA.YYYY biçiminde gir.');
    if (dueOn.trim() && !dueOnISO) dateErrs.push('Son tarihi GG.AA.YYYY biçiminde gir.');
    if (lastOnISO && lastOnISO > today) dateErrs.push('Son yapıldığı tarih ileri bir tarih olamaz.');
    const input = {
      kind, title: title.trim(),
      everyKm: kind === 'interval' ? parseNumberTR(everyKm) : null,
      everyMonths: kind === 'interval' ? parseNumberTR(everyM) : null,
      lastDoneKm: kind === 'interval' ? parseNumberTR(lastKm) : null,
      lastDoneOn: kind === 'interval' ? lastOnISO : null,
      dueOn: kind === 'due_date' ? dueOnISO : null,
    };
    const all = [...dateErrs, ...validateRule(input, vehicle.odometerKm)];
    if (!itemKey && !existing) all.unshift('Listeden bir kalem seç.');
    setErrs(all);
    if (all.length) return;
    setBusy(true);
    try {
      await run((r) => r.upsertRule({
        id: existing?.id, vehicleId: vehicle.id, itemKey: itemKey || existing!.itemKey, ...input,
        everyKm: input.everyKm != null ? Math.round(input.everyKm) : null,
        everyMonths: input.everyMonths != null ? Math.round(input.everyMonths) : null,
        lastDoneKm: input.lastDoneKm != null ? Math.round(input.lastDoneKm) : null,
        // Kullanıcı aralığı değiştirdiyse kaynak "Sizin tanımınız" olur
        source: existing && (existing.everyKm !== input.everyKm || existing.everyMonths !== input.everyMonths) && source === 'service' ? 'user' : source,
        remindBeforeKm: existing?.remindBeforeKm ?? 1500, remindBeforeDays: existing?.remindBeforeDays ?? 30, enabled: true,
      }));
      router.back();
    } catch (e) {
      setErrs([e instanceof RepoError ? e.message : 'Kaydedilemedi.']);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing || !(await confirm('Hatırlatmayı sil', `${existing.title} artık takip edilmeyecek. Geçmiş kayıtlar silinmez.`, 'Sil', true))) return;
    await run((r) => r.deleteRule(existing.id));
    router.back();
  };

  return (
    <Screen title={existing ? existing.title : 'Hatırlatma ekle'} back
      footer={<Button title="Kaydet" variant="primary" onPress={save} loading={busy} />}>
      <Stack gap={space.lg}>
        {!existing && (
          <Stack gap={space.sm}>
            <Text v="smallStrong" color={colors.textMuted}>Ne takip edilsin?</Text>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {MAINTENANCE_ITEMS.map((i) => <Chip key={i.key} label={i.title} selected={itemKey === i.key} onPress={() => pick(i.key)} />)}
            </Row>
          </Stack>
        )}

        {(itemKey || existing) && (
          <>
            <Field label="Ad" value={title} onChangeText={setTitle} placeholder="Örn. Motor yağı + yağ filtresi" />
            <Segmented<RuleKind> value={kind} onChange={setKind} options={[
              { value: 'interval', label: 'Km / süre aralığı' }, { value: 'due_date', label: 'Belirli tarih' },
            ]} />

            {kind === 'interval' ? (
              <>
                <Muted small>Hangisi önce dolarsa o tetiklenir. Değerleri aracının kullanım kılavuzundan ya da ustandan alabilirsin.</Muted>
                <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                  <Field label="Her … km" value={everyKm} onChangeText={setEveryKm} placeholder="15.000" keyboardType="number-pad" />
                  <Field label="veya her … ay" value={everyM} onChangeText={setEveryM} placeholder="12" keyboardType="number-pad" maxLength={3} />
                </Row>
                <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                  <Field label="Son yapıldığı km" value={lastKm} onChangeText={setLastKm} placeholder={formatNumber(vehicle.odometerKm)} keyboardType="number-pad" />
                  <Field label="Son yapıldığı tarih" value={lastOn} onChangeText={setLastOn} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />
                </Row>
              </>
            ) : (
              <Field label="Son tarih" value={dueOn} onChangeText={setDueOn} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10}
                hint="Ruhsattaki muayene tarihi ya da poliçe bitiş tarihi" />
            )}

            <Card style={{ gap: 4 }}>
              <Text v="smallStrong">Kaynak: {SOURCE_LABEL[source]}</Text>
              <Muted small>Üretici aralıklarını yalnızca lisanslı katalogdan doğrulandığında “Üretici (doğrulanmış)” olarak gösteririz.</Muted>
            </Card>
          </>
        )}

        {errs.map((e) => <ErrorText key={e}>{e}</ErrorText>)}
        {existing && <Button title="Hatırlatmayı sil" variant="ghost" icon="trash" onPress={remove} />}
      </Stack>
    </Screen>
  );
}
