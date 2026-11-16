/**
 * Muhasebe raporu: dönem seçimi, ciro (onaylı + tamamlanan), tahsilat (yönteme göre), alacak, ciroya sayılmayanlar,
 * en çok değişen parçalar, günlük döküm. PDF ve Excel (CSV) olarak muhasebeciye gönderilir.
 */
import { buildReport, debtors, formatDate, formatKurus, PAYMENT_METHOD_LABEL, periodOf, type PaymentMethod, type PeriodKind } from '@piston/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { Button, Card, Chip, Divider, ErrorText, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { shareReportCsv, shareReportPdf } from '@/lib/report-export';

const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: 'today', label: 'Bugün' },
  { value: 'week', label: 'Bu hafta' },
  { value: 'month', label: 'Bu ay' },
  { value: 'last_month', label: 'Geçen ay' },
];

function Line({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text v={strong ? 'bodyStrong' : 'body'} color={strong ? colors.text : colors.textMuted} style={{ flex: 1 }}>{label}</Text>
      <Text v={strong ? 'bodyStrong' : 'body'} color={color} style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
    </Row>
  );
}

export default function Reports() {
  const { records, business } = useBusiness();
  const [kind, setKind] = useState<PeriodKind>('month');
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rep = useMemo(() => buildReport(records, periodOf(kind)), [records, kind]);
  const debt = useMemo(() => debtors(records), [records]);

  if (!business) return <Screen title="Raporlar" back>{null}</Screen>;

  const exportAs = async (type: 'pdf' | 'csv') => {
    setBusy(type);
    setErr(null);
    try {
      const res = type === 'pdf' ? await shareReportPdf(rep, business, debt) : await shareReportCsv(records, rep, business);
      if (res === 'unavailable') setErr('Bu cihazda paylaşım kullanılamıyor.');
    } catch {
      setErr('Rapor dosyası oluşturulamadı. Tekrar dene.');
    } finally {
      setBusy(null);
    }
  };

  const r = rep.revenue;
  return (
    <Screen title="Raporlar" back>
      <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
        {PERIODS.map((p) => <Chip key={p.value} label={p.label} selected={kind === p.value} onPress={() => setKind(p.value)} />)}
      </Row>
      <Muted small style={{ marginTop: space.sm }}>{`${rep.period.label}: ${formatDate(rep.period.from)} – ${formatDate(rep.period.to)}`}</Muted>

      <Card style={{ gap: 2, marginTop: space.md }}>
        <Muted small>Ciro (onaylı ve tamamlanan)</Muted>
        <Text v="display">{formatKurus(r.grandKurus)}</Text>
        <Muted small>{`${r.count} servis · ${rep.customerCount} müşteri · dönemde açılan ${rep.recordCount} kayıt`}</Muted>
      </Card>

      <Section title="Ciro dökümü">
        <Card style={{ gap: space.sm }}>
          <Line label="Parça toplamı" value={formatKurus(r.partsKurus)} />
          <Line label="İşçilik toplamı" value={formatKurus(r.laborKurus)} />
          {r.discountKurus > 0 && <Line label="İndirim" value={`−${formatKurus(r.discountKurus)}`} color={colors.warn} />}
          <Line label="KDV" value={formatKurus(r.vatKurus)} />
          <Divider />
          <Line label="Genel ciro" value={formatKurus(r.grandKurus)} strong />
        </Card>
      </Section>

      <Section title="Tahsilat">
        <Card style={{ gap: space.sm }}>
          {(Object.keys(rep.collected.byMethod) as PaymentMethod[]).map((m) => (
            <Line key={m} label={PAYMENT_METHOD_LABEL[m]} value={formatKurus(rep.collected.byMethod[m])} />
          ))}
          <Divider />
          <Line label="Toplam tahsilat" value={formatKurus(rep.collected.totalKurus)} strong />
          <Muted small>Ödemeler alındığı tarihe göre sayılır.</Muted>
        </Card>
      </Section>

      <Section title="Alacak" action={debt.length > 0 ? 'Borçlular' : undefined} onAction={() => router.push('/servis/borclular')}>
        <Card style={{ gap: space.sm }}>
          <Line label="Bu dönemin cirosundan tahsil edilmeyen" value={formatKurus(rep.periodUnpaidKurus)} />
          <Line label="Bugün itibarıyla toplam alacak" value={formatKurus(rep.receivableKurus)} strong color={rep.receivableKurus > 0 ? colors.warn : undefined} />
        </Card>
      </Section>

      <Section title="Ciroya sayılmayanlar">
        <Card style={{ gap: space.sm }}>
          <Line label={`Müşteri onayı bekleyen (${rep.awaiting.count})`} value={formatKurus(rep.awaiting.grandKurus)} />
          <Line label={`İtiraz edilen (${rep.objected.count})`} value={formatKurus(rep.objected.grandKurus)} />
        </Card>
      </Section>

      {rep.topParts.length > 0 && (
        <Section title="En çok değişen parçalar">
          <Card style={{ gap: space.sm }}>
            {rep.topParts.map((p) => <Line key={p.name} label={`${p.name} · ${p.count} adet`} value={formatKurus(p.totalKurus)} />)}
          </Card>
        </Section>
      )}

      {rep.daily.length > 0 && (
        <Section title="Günlük">
          <Card style={{ gap: space.sm }}>
            {rep.daily.map((d) => (
              <Row key={d.date} style={{ justifyContent: 'space-between' }}>
                <Text v="small" style={{ flex: 1 }}>{formatDate(d.date)}</Text>
                <Muted small>{`${d.count} servis · ${formatKurus(d.grandKurus)}`}</Muted>
                <Text v="smallStrong" style={{ minWidth: 110, textAlign: 'right' }}>{`+${formatKurus(d.collectedKurus)}`}</Text>
              </Row>
            ))}
            <Muted small>Sağdaki tutar o gün alınan ödemedir.</Muted>
          </Card>
        </Section>
      )}

      <Section title="Muhasebeciye gönder">
        <Stack gap={space.sm}>
          <Button title="PDF rapor" icon="doc" variant="primary" onPress={() => exportAs('pdf')} loading={busy === 'pdf'} />
          <Button title="Excel tablosu (CSV)" icon="list" onPress={() => exportAs('csv')} loading={busy === 'csv'} />
          <ErrorText>{err}</ErrorText>
          <Muted small>Rapor bilgilendirme amaçlıdır; fatura, e-arşiv veya resmi defter yerine geçmez.</Muted>
        </Stack>
      </Section>
    </Screen>
  );
}
