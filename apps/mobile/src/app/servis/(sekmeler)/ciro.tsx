/**
 * OTOM CİRO: işletmenin ne kadar iş yaptığı, ne kadar gelir elde ettiği, ne kadar gider yaptığı ve işletme sonucu.
 * Rakamlar gerçek servis kayıtlarından, ödemelerden ve girilen giderlerden hesaplanır (packages/core accounting.ts).
 * Yalnızca finans yetkisi olan rol (sahip, müdür) görür; sunucu da aynı kuralı uygular.
 */
import {
  buildReport,
  dailySeries,
  debtors,
  formatDate,
  formatKurus,
  kurusToInput,
  localDate,
  monthCompare,
  monthlySeries,
  parseDateTR,
  parseKurus,
  PAYMENT_METHOD_LABEL,
  periodOf,
  toDateTR,
  validateExpense,
  type BusinessExpense,
  type ExpenseInputErrors,
  type PaymentMethod,
  type PeriodKind,
} from '@piston/core';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BarChart, CompareBars, SERIES_A, SERIES_B, SplitBar } from '@/components/ciro-charts';
import { Button, Card, Chip, Divider, Empty, ErrorText, Field, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { confirm } from '@/lib/confirm';
import { shareReportCsv, shareReportPdf } from '@/lib/report-export';

const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: 'today', label: 'Bugün' },
  { value: 'week', label: 'Bu hafta' },
  { value: 'month', label: 'Bu ay' },
  { value: 'last_month', label: 'Geçen ay' },
  { value: 'year', label: 'Bu yıl' },
];

function Tile({ label, value, color, note, wide }: { label: string; value: string; color?: string; note?: string; wide?: boolean }) {
  return (
    <Card style={{ flexBasis: wide ? '100%' : '47%', flexGrow: 1, gap: 2 }}>
      <Muted small>{label}</Muted>
      <Text v={wide ? 'display' : 'number'} color={color}>{value}</Text>
      {note ? <Muted small>{note}</Muted> : null}
    </Card>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text v={strong ? 'bodyStrong' : 'body'} color={strong ? colors.text : colors.textMuted} style={{ flex: 1 }}>{label}</Text>
      <Text v={strong ? 'bodyStrong' : 'body'} style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
    </Row>
  );
}

const money = (k: number) => (k < 0 ? `−${formatKurus(-k)}` : formatKurus(k));

interface ExpenseForm { id: string | null; amount: string; description: string; date: string; requestId: string }

export default function Ciro() {
  const biz = useBusiness();
  const { records, expenses, business, canFinance } = biz;
  const [kind, setKind] = useState<PeriodKind>('month');
  const [form, setForm] = useState<ExpenseForm | null>(null);
  const [formErr, setFormErr] = useState<ExpenseInputErrors>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | 'pdf' | 'csv' | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const period = useMemo(() => periodOf(kind), [kind]);
  const rep = useMemo(() => buildReport(records, period, expenses), [records, period, expenses]);
  const daily = useMemo(() => dailySeries(rep), [rep]);
  const monthly = useMemo(() => monthlySeries(records, expenses), [records, expenses]);
  const cmp = useMemo(() => monthCompare(records, expenses), [records, expenses]);
  const debt = useMemo(() => debtors(records), [records]);
  const periodExpenses = useMemo(() => expenses.filter((x) => x.spentOn >= period.from && x.spentOn <= period.to), [expenses, period]);

  if (!business) return <Screen title="OTOM CİRO">{null}</Screen>;
  if (!canFinance) {
    return (
      <Screen title="OTOM CİRO">
        <Empty title="Yetkin yok" body="OTOM CİRO'yu yalnızca işletme sahibi ve yetki verilen personel görebilir." />
      </Screen>
    );
  }

  const r = rep.revenue;

  // ---------------- Gider formu ----------------
  const openNew = () => {
    setForm({ id: null, amount: '', description: '', date: toDateTR(localDate(new Date())), requestId: Crypto.randomUUID() });
    setFormErr({});
    setSaveErr(null);
  };
  const openEdit = (x: BusinessExpense) => {
    setForm({ id: x.id, amount: kurusToInput(x.amountKurus), description: x.description ?? '', date: toDateTR(x.spentOn), requestId: Crypto.randomUUID() });
    setFormErr({});
    setSaveErr(null);
  };
  const save = async () => {
    if (!form) return;
    const amount = form.amount.trim() ? parseKurus(form.amount) : null;
    const date = parseDateTR(form.date);
    const e = validateExpense(amount, date, form.description, localDate(new Date()));
    setFormErr(e);
    if (Object.keys(e).length) return;
    setBusy('save');
    setSaveErr(null);
    try {
      const patch = { amountKurus: amount!, description: form.description.trim() || null, spentOn: date! };
      if (form.id) await biz.run((x) => x.updateExpense(form.id!, patch));
      else await biz.run((x) => x.addExpense({ ...patch, businessId: business.id, clientRequestId: form.requestId }));
      setForm(null);
    } catch (x) {
      setSaveErr(x instanceof RepoError ? x.message : 'Gider kaydedilemedi. Tekrar dene.');
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!form?.id) return;
    if (!(await confirm('Gideri sil', `${form.amount} ₺ tutarındaki gider silinecek. Silinen giderin kaydı geçmişte saklanır.`, 'Sil', true))) return;
    setBusy('delete');
    setSaveErr(null);
    try {
      await biz.run((x) => x.deleteExpense(form.id!));
      setForm(null);
    } catch (x) {
      setSaveErr(x instanceof RepoError ? x.message : 'Gider silinemedi.');
    } finally {
      setBusy(null);
    }
  };

  const exportAs = async (type: 'pdf' | 'csv') => {
    setBusy(type);
    setExportErr(null);
    try {
      const res = type === 'pdf' ? await shareReportPdf(rep, business, debt) : await shareReportCsv(records, rep, business, expenses);
      if (res === 'unavailable') setExportErr('Bu cihazda paylaşım kullanılamıyor.');
    } catch {
      setExportErr('Rapor dosyası oluşturulamadı. Tekrar dene.');
    } finally {
      setBusy(null);
    }
  };

  const expenseForm = form && (
    <Card style={{ gap: space.md, borderColor: SERIES_A }}>
      <Text v="section">{form.id ? 'Gideri düzenle' : 'Gider ekle'}</Text>
      <Field label="Gider tutarı (₺)" value={form.amount} onChangeText={(t) => setForm({ ...form, amount: t })} keyboardType="decimal-pad"
        placeholder="0" error={formErr.amount} autoFocus={!form.id} />
      <Field label="Açıklama (isteğe bağlı)" value={form.description} onChangeText={(t) => setForm({ ...form, description: t })}
        placeholder="Örn. Dükkan kirası" error={formErr.description} />
      <Field label="Tarih" value={form.date} onChangeText={(t) => setForm({ ...form, date: t })} placeholder="16.11.2026" error={formErr.date} />
      <ErrorText>{saveErr}</ErrorText>
      <Row gap={space.sm}>
        <Button title="Vazgeç" onPress={() => setForm(null)} style={{ flex: 1 }} />
        <Button title={form.id ? 'Kaydet' : 'Gideri Kaydet'} variant="primary" onPress={save} loading={busy === 'save'} style={{ flex: 2 }} />
      </Row>
      {form.id && <Button title="Gideri sil" variant="ghost" onPress={remove} loading={busy === 'delete'} />}
    </Card>
  );

  return (
    <Screen title="OTOM CİRO">
      <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
        {PERIODS.map((p) => <Chip key={p.value} label={p.label} selected={kind === p.value} onPress={() => setKind(p.value)} />)}
      </Row>
      <Muted small style={{ marginTop: space.sm }}>{`${period.label}: ${formatDate(period.from)} – ${formatDate(period.to)}`}</Muted>

      {/* Finans kartları */}
      <Row style={{ flexWrap: 'wrap', marginTop: space.md }} gap={space.sm}>
        <Tile wide label={kind === 'month' ? 'Aylık toplam ciro' : 'Toplam ciro'} value={formatKurus(r.ciroKurus)} note="Tamamlanan servisler, KDV hariç" />
        <Tile label="Parça satış geliri" value={formatKurus(r.partsKurus)} />
        <Tile label="İşçilik geliri" value={formatKurus(r.laborKurus)} />
        <Tile label="Toplam gider" value={formatKurus(rep.expenses.totalKurus)} note={`${rep.expenses.count} gider`} />
        <Tile label="Net kazanç" value={money(rep.netKurus)} color={rep.netKurus < 0 ? colors.danger : undefined} note="Ciro − gider" />
        <Tile label="Tamamlanan servis" value={String(r.count)} />
        <Tile label="Ortalama servis tutarı" value={formatKurus(r.averageKurus)} />
        <Tile label="Tahsil edilen" value={formatKurus(rep.collected.totalKurus)} note="Bu dönemde alınan ödemeler" />
        <Tile label="Bekleyen tahsilat" value={formatKurus(rep.periodUnpaidKurus)} color={rep.periodUnpaidKurus > 0 ? colors.warnText : undefined}
          note={`Toplam alacak ${formatKurus(rep.receivableKurus)}`} />
      </Row>
      <Muted small style={{ marginTop: space.sm }}>
        Net kazanç işletme içi gelir-gider takibidir; muhasebe anlamında kesin net kâr değildir. KDV ({formatKurus(r.vatKurus)}) ciroya dahil edilmez.
      </Muted>

      {/* Giderler */}
      <Section title="Giderler">
        {form && !form.id ? expenseForm : <Button title="+ Gider Ekle" variant="primary" onPress={openNew} />}
        {periodExpenses.length === 0 ? (
          <Muted small>Bu dönemde gider yok.</Muted>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {periodExpenses.map((x, i) => (
              <View key={x.id}>
                {i > 0 && <Divider />}
                {form?.id === x.id ? (
                  <View style={{ paddingVertical: space.md }}>{expenseForm}</View>
                ) : (
                  <Pressable onPress={() => openEdit(x)} accessibilityRole="button" accessibilityLabel={`${formatDate(x.spentOn)} gider ${formatKurus(x.amountKurus)}, düzenle`}
                    style={({ pressed }) => [{ paddingVertical: space.md, gap: 2 }, pressed && { opacity: 0.7 }]}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text v="bodyStrong">{formatKurus(x.amountKurus)}</Text>
                      <Muted small>{formatDate(x.spentOn)}</Muted>
                    </Row>
                    <Muted small>{x.description ?? 'Açıklama yok'}</Muted>
                  </Pressable>
                )}
              </View>
            ))}
          </Card>
        )}
        {periodExpenses.length > 0 && <Muted small>Düzenlemek ya da silmek için gidere dokun.</Muted>}
      </Section>

      {/* Grafikler */}
      <Section title={kind === 'year' ? 'Aylara göre ciro (bu yıl)' : 'Günlük ciro'}>
        <Card><BarChart points={daily} pick={(p) => p.ciroKurus} color={SERIES_A} summary="Ciro" emptyText="Bu dönemde tamamlanan servis yok." /></Card>
      </Section>
      <Section title="Aylık ciro (son 6 ay)">
        <Card><BarChart points={monthly} pick={(p) => p.ciroKurus} color={SERIES_A} summary="Aylık ciro" emptyText="Son 6 ayda tamamlanan servis yok." /></Card>
      </Section>
      <Section title="Parça ve işçilik geliri">
        <Card><SplitBar a={{ label: 'Parça', kurus: r.partsKurus }} b={{ label: 'İşçilik', kurus: r.laborKurus }} /></Card>
      </Section>
      <Section title="Aylık gider (son 6 ay)">
        <Card><BarChart points={monthly} pick={(p) => p.expenseKurus} color={SERIES_B} summary="Aylık gider" emptyText="Son 6 ayda gider girilmedi." /></Card>
      </Section>
      <Section title={`${cmp.current.label} ↔ ${cmp.previous.label}`}>
        <Card style={{ gap: space.sm }}>
          <Muted small>{`Ayın ilk ${new Date().getDate()} günü karşılaştırılır.`}</Muted>
          <CompareBars currentLabel={cmp.current.label} previousLabel={cmp.previous.label} rows={[
            { label: 'Ciro', current: cmp.current.ciroKurus, previous: cmp.previous.ciroKurus },
            { label: 'Gider', current: cmp.current.expenseKurus, previous: cmp.previous.expenseKurus },
            { label: 'Net kazanç', current: cmp.current.netKurus, previous: cmp.previous.netKurus },
          ]} />
        </Card>
      </Section>

      {/* Ödeme takibi */}
      <Section title="Tahsilat">
        <Card style={{ gap: space.sm }}>
          {(Object.keys(rep.collected.byMethod) as PaymentMethod[]).map((m) => (
            <Line key={m} label={PAYMENT_METHOD_LABEL[m]} value={formatKurus(rep.collected.byMethod[m])} />
          ))}
          <Divider />
          <Line label="Tahsil edilen" value={formatKurus(rep.collected.totalKurus)} strong />
          <Line label="Bekleyen tahsilat (bu dönemin cirosundan)" value={formatKurus(rep.periodUnpaidKurus)} strong />
          <Muted small>Tahsil edilen ve bekleyen tutarlar KDV dahildir; ödemeler alındığı tarihe göre sayılır.</Muted>
          {debt.length > 0 && <Button title={`Borçlu müşteriler (${debt.length})`} small onPress={() => router.push('/servis/borclular')} />}
        </Card>
      </Section>

      <Section title="Ciroya girmeyenler">
        <Card style={{ gap: space.sm }}>
          <Line label={`Müşteri onayı bekleyen (${rep.awaiting.count})`} value={formatKurus(rep.awaiting.grandKurus)} />
          <Line label={`Onaylandı, tamamlanmadı (${rep.approvedNotCompleted.count})`} value={formatKurus(rep.approvedNotCompleted.grandKurus)} />
          <Line label={`İtiraz edilen (${rep.objected.count})`} value={formatKurus(rep.objected.grandKurus)} />
          <Muted small>Kayıt tamamlandığında ciroya, tamamlandığı güne yazılır.</Muted>
        </Card>
      </Section>

      {rep.topParts.length > 0 && (
        <Section title="En çok değişen parçalar">
          <Card style={{ gap: space.sm }}>
            {rep.topParts.map((p) => <Line key={p.name} label={`${p.name} · ${p.count} adet`} value={formatKurus(p.totalKurus)} />)}
          </Card>
        </Section>
      )}

      <Section title="Muhasebeciye gönder">
        <Stack gap={space.sm}>
          <Button title="PDF rapor" icon="doc" onPress={() => exportAs('pdf')} loading={busy === 'pdf'} />
          <Button title="Excel tablosu (CSV)" icon="list" onPress={() => exportAs('csv')} loading={busy === 'csv'} />
          <ErrorText>{exportErr}</ErrorText>
          <Muted small>Rapor işletme içi takip içindir; fatura, e-arşiv, kesin net kâr veya resmi defter yerine geçmez.</Muted>
        </Stack>
      </Section>
    </Screen>
  );
}
