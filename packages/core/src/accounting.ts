/**
 * PISTON CİRO: ciro, tahsilat, alacak, gider ve işletme sonucu; dönem özeti, grafik verisi ve CSV.
 * Kurallar:
 *   * Gerçekleşen ciroya YALNIZCA tamamlanan servis kayıtları girer; tamamlanma tarihine göre döneme yazılır.
 *     Onay bekleyen, onaylanmış ama tamamlanmamış ve itirazlı kayıtlar ciroya girmez, ayrı gösterilir.
 *   * Ciro = parça geliri + işçilik geliri (indirim düşülmüş, KDV hariç). KDV ayrıca gösterilir.
 *     Tahsilat ve bekleyen tahsilat müşterinin ödeyeceği tutar (KDV dahil) üzerinden hesaplanır.
 *   * Aynı kayıt kimliği bir kez sayılır (çift kayıt koruması).
 *   * Tahsilat, ödemenin alındığı tarihe göre döneme girer. İptal edilen ödeme hiçbir toplama girmez.
 *   * Gider yalnızca kullanıcının girdiği giderlerdir; servis kayıtlarındaki parça tutarları gider sayılmaz
 *     (parça alış maliyeti tutulmadığı için iki kez düşülmez).
 *   * İşletme sonucu = ciro − gider. Bu bir iç takip rakamıdır; muhasebe anlamında kesin net kâr değildir.
 * Rapor muhasebeciye veri sağlar; fatura, e-arşiv ya da resmi defter yerine geçmez.
 */
import { formatNumber } from './format';
import {
  itemGrossKurus,
  needsCustomerAction,
  PAYMENT_METHOD_LABEL,
  SERVICE_STATUS_LABEL,
  type PaymentMethod,
  type ServiceItemInput,
  type ServicePayment,
  type ServiceRecord,
  type ServiceRecordStatus,
} from './service';

/** Ciroya sayılan durum */
export const REVENUE_STATUSES: readonly ServiceRecordStatus[] = ['completed'];
export const isRevenue = (s: ServiceRecordStatus) => REVENUE_STATUSES.includes(s);

export function activePayments(payments: readonly ServicePayment[]): ServicePayment[] {
  return payments.filter((p) => !p.voidedAt);
}

export function paidKurus(payments: readonly ServicePayment[]): number {
  return activePayments(payments).reduce((s, p) => s + p.amountKurus, 0);
}

/** Kalan borç (KDV dahil). Negatifse fazla ödeme (kayıt düzeltilip tutar düşmüş olabilir). */
export function balanceKurus(r: Pick<ServiceRecord, 'totals' | 'payments'>): number {
  return r.totals.grandKurus - paidKurus(r.payments);
}

export type PaymentState = 'unpaid' | 'partial' | 'paid' | 'overpaid';

export function paymentState(r: Pick<ServiceRecord, 'totals' | 'payments'>): PaymentState {
  const paid = paidKurus(r.payments);
  const grand = r.totals.grandKurus;
  if (paid > grand) return 'overpaid';
  if (paid === grand) return 'paid';
  return paid === 0 ? 'unpaid' : 'partial';
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  unpaid: 'Ödenmedi',
  partial: 'Kısmen ödendi',
  paid: 'Ödendi',
  overpaid: 'Fazla ödeme',
};

/** Ödeme girişini kontrol eder. Kalan borçtan fazlası alınamaz (sunucu da aynı kuralı uygular). */
export function validatePayment(amountKurus: number | null, remainingKurus: number): string | null {
  if (amountKurus == null || !Number.isInteger(amountKurus)) return 'Tutarı 1.250,50 biçiminde yaz.';
  if (amountKurus <= 0) return 'Tutar sıfırdan büyük olmalı.';
  if (amountKurus > remainingKurus) return remainingKurus <= 0 ? 'Bu kaydın ödenecek borcu yok.' : 'Tutar kalan borçtan fazla olamaz.';
  return null;
}

/**
 * Kalemlerden indirim düşülmüş parça ve işçilik geliri (KDV hariç).
 * Bir kalemde hem parça hem işçilik varsa indirim ikisine oranla bölünür.
 */
export function netPartsLabor(items: readonly ServiceItemInput[]): { partsKurus: number; laborKurus: number } {
  let parts = 0;
  let labor = 0;
  for (const i of items) {
    const p = i.partQty * i.partUnitKurus;
    const gross = itemGrossKurus(i);
    const d = Math.min(i.discountKurus, gross);
    const dParts = gross > 0 ? Math.round((d * p) / gross) : 0;
    parts += p - dParts;
    labor += i.laborKurus - (d - dParts);
  }
  return { partsKurus: parts, laborKurus: labor };
}

/** Kaydın ciroya yazıldığı gün: tamamlanma tarihi (yoksa son güncelleme) */
export function revenueDateOf(r: Pick<ServiceRecord, 'history' | 'updatedAt' | 'intakeAt'>): string {
  const done = [...r.history].reverse().find((h) => h.status === 'completed');
  return localDateOf(done?.at ?? r.updatedAt ?? r.intakeAt);
}

// ---------------------------------------------------------------------------
// Dönem
// ---------------------------------------------------------------------------

export type PeriodKind = 'today' | 'week' | 'month' | 'last_month' | 'year';

export interface Period {
  kind: PeriodKind | 'custom';
  /** Yerel tarih, dahil: YYYY-MM-DD */
  from: string;
  to: string;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** ISO zaman damgasını cihazın yerel tarihine çevirir */
export const localDateOf = (iso: string) => localDate(new Date(iso));

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const monthLabelTR = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export function periodOf(kind: PeriodKind, now: Date = new Date()): Period {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === 'today') return { kind, from: localDate(today), to: localDate(today), label: 'Bugün' };
  if (kind === 'week') {
    // Hafta pazartesi başlar
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return { kind, from: localDate(monday), to: localDate(today), label: 'Bu hafta' };
  }
  if (kind === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { kind, from: localDate(first), to: localDate(today), label: `${MONTHS[today.getMonth()]} ${today.getFullYear()}` };
  }
  if (kind === 'year') {
    return { kind, from: `${today.getFullYear()}-01-01`, to: localDate(today), label: `${today.getFullYear()} yılı` };
  }
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const last = new Date(today.getFullYear(), today.getMonth(), 0);
  return { kind, from: localDate(first), to: localDate(last), label: `${MONTHS[first.getMonth()]} ${first.getFullYear()}` };
}

const inPeriod = (date: string, p: Period) => date >= p.from && date <= p.to;

// ---------------------------------------------------------------------------
// Giderler (sade: tutar, açıklama, tarih)
// ---------------------------------------------------------------------------

export interface BusinessExpense {
  id: string;
  amountKurus: number;
  description: string | null;
  /** Yerel tarih: YYYY-MM-DD */
  spentOn: string;
  createdAt: string;
}

// Tarih girişi için dates.ts'deki parseDateTR ("16.11.2026" → "2026-11-16") ve toDateTR kullanılır.

export interface ExpenseInputErrors { amount?: string; date?: string; description?: string }

/** Gider girişini kontrol eder; sunucu da aynı kuralları uygular. `today` yerel tarih (YYYY-MM-DD). */
export function validateExpense(amountKurus: number | null, dateIso: string | null, description: string, today: string): ExpenseInputErrors {
  const e: ExpenseInputErrors = {};
  if (amountKurus == null) e.amount = 'Tutarı 1.250,50 biçiminde yaz.';
  else if (amountKurus <= 0) e.amount = 'Tutar sıfırdan büyük olmalı.';
  else if (amountKurus > 100_000_000) e.amount = 'Tutar en fazla 1.000.000 ₺ olabilir.';
  if (!dateIso) e.date = 'Tarihi 16.11.2026 biçiminde yaz.';
  else if (dateIso > today) e.date = 'İleri bir tarih girilemez.';
  else if (dateIso < '2000-01-01') e.date = 'Tarihi kontrol et.';
  if (description.trim().length > 200) e.description = 'Açıklama en fazla 200 karakter olabilir.';
  return e;
}

export function expensesIn(expenses: readonly BusinessExpense[], period: Period): BusinessExpense[] {
  return expenses.filter((x) => inPeriod(x.spentOn, period)).sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Rapor
// ---------------------------------------------------------------------------

export interface RevenueSummary {
  /** Tamamlanan servis sayısı */
  count: number;
  /** İndirim düşülmüş parça geliri (KDV hariç) */
  partsKurus: number;
  /** İndirim düşülmüş işçilik geliri (KDV hariç) */
  laborKurus: number;
  /** Ciro = parça + işçilik (KDV hariç) */
  ciroKurus: number;
  discountKurus: number;
  vatKurus: number;
  /** Müşterinin ödeyeceği toplam (KDV dahil) */
  grandKurus: number;
  /** Ortalama servis tutarı (ciro / adet) */
  averageKurus: number;
}

export interface ServiceReport {
  period: Period;
  /** Dönemde açılan tüm kayıtlar */
  recordCount: number;
  customerCount: number;
  /** Gerçekleşen ciro: tamamlanan kayıtlar */
  revenue: RevenueSummary;
  /** Ciroya sayılmayanlar (dönemde açılan) */
  awaiting: { count: number; grandKurus: number };
  approvedNotCompleted: { count: number; grandKurus: number };
  objected: { count: number; grandKurus: number };
  /** Dönemde alınan ödemeler (alındığı tarihe göre) */
  collected: { totalKurus: number; byMethod: Record<PaymentMethod, number>; count: number };
  /** Dönemin cirosundan henüz tahsil edilmeyen (KDV dahil) */
  periodUnpaidKurus: number;
  /** Bugün itibarıyla toplam alacak (dönemden bağımsız) */
  receivableKurus: number;
  /** Dönemdeki giderler (gider tarihine göre) */
  expenses: { totalKurus: number; count: number };
  /** İşletme sonucu = ciro − gider */
  netKurus: number;
  topParts: { name: string; count: number; totalKurus: number }[];
  /** Günlük döküm (en yeni önce) */
  daily: { date: string; count: number; ciroKurus: number; collectedKurus: number; expenseKurus: number }[];
}

/** Aynı kimlikli kayıt bir kez sayılır */
const unique = (records: readonly ServiceRecord[]) => [...new Map(records.map((r) => [r.id, r])).values()];

export function buildReport(allRecords: readonly ServiceRecord[], period: Period, expenses: readonly BusinessExpense[] = []): ServiceReport {
  const records = unique(allRecords);
  const opened = records.filter((r) => inPeriod(localDateOf(r.intakeAt), period));
  const completed = records.filter((r) => isRevenue(r.status) && inPeriod(revenueDateOf(r), period));
  const rev: RevenueSummary = { count: 0, partsKurus: 0, laborKurus: 0, ciroKurus: 0, discountKurus: 0, vatKurus: 0, grandKurus: 0, averageKurus: 0 };
  let periodUnpaid = 0;
  const parts = new Map<string, { name: string; count: number; totalKurus: number }>();
  const daily = new Map<string, ServiceReport['daily'][number]>();
  const day = (date: string) => {
    let d = daily.get(date);
    if (!d) { d = { date, count: 0, ciroKurus: 0, collectedKurus: 0, expenseKurus: 0 }; daily.set(date, d); }
    return d;
  };

  for (const r of completed) {
    const n = netPartsLabor(r.items);
    rev.count += 1;
    rev.partsKurus += n.partsKurus;
    rev.laborKurus += n.laborKurus;
    rev.discountKurus += r.totals.discountKurus;
    rev.vatKurus += r.totals.vatKurus;
    rev.grandKurus += r.totals.grandKurus;
    periodUnpaid += Math.max(0, balanceKurus(r));
    const dd = day(revenueDateOf(r));
    dd.count += 1;
    dd.ciroKurus += n.partsKurus + n.laborKurus;
    for (const i of r.items) {
      if (i.partQty <= 0 || !i.partName) continue;
      const key = i.partName.trim().toLocaleLowerCase('tr');
      const e = parts.get(key) ?? { name: i.partName.trim(), count: 0, totalKurus: 0 };
      e.count += i.partQty;
      e.totalKurus += i.partQty * i.partUnitKurus;
      parts.set(key, e);
    }
  }
  rev.ciroKurus = rev.partsKurus + rev.laborKurus;
  rev.averageKurus = rev.count ? Math.round(rev.ciroKurus / rev.count) : 0;

  const awaiting = { count: 0, grandKurus: 0 };
  const approvedNotCompleted = { count: 0, grandKurus: 0 };
  const objected = { count: 0, grandKurus: 0 };
  for (const r of opened) {
    const bucket = needsCustomerAction(r.status) ? awaiting : r.status === 'approved' ? approvedNotCompleted : r.status === 'objected' ? objected : null;
    if (bucket) { bucket.count += 1; bucket.grandKurus += r.totals.grandKurus; }
  }

  const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
  let collectedTotal = 0;
  let collectedCount = 0;
  for (const r of records) {
    for (const p of activePayments(r.payments)) {
      const date = localDateOf(p.paidAt);
      if (!inPeriod(date, period)) continue;
      byMethod[p.method] += p.amountKurus;
      collectedTotal += p.amountKurus;
      collectedCount += 1;
      day(date).collectedKurus += p.amountKurus;
    }
  }

  const periodExpenses = expensesIn(expenses, period);
  for (const x of periodExpenses) day(x.spentOn).expenseKurus += x.amountKurus;
  const expenseTotal = periodExpenses.reduce((s, x) => s + x.amountKurus, 0);

  return {
    period,
    recordCount: opened.length,
    customerCount: new Set([...opened, ...completed].map((r) => r.customerId)).size,
    revenue: rev,
    awaiting,
    approvedNotCompleted,
    objected,
    collected: { totalKurus: collectedTotal, byMethod, count: collectedCount },
    periodUnpaidKurus: periodUnpaid,
    receivableKurus: debtors(records).reduce((s, d) => s + d.debtKurus, 0),
    expenses: { totalKurus: expenseTotal, count: periodExpenses.length },
    netKurus: rev.ciroKurus - expenseTotal,
    topParts: [...parts.values()].sort((a, b) => b.totalKurus - a.totalKurus).slice(0, 10),
    daily: [...daily.values()].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

// ---------------------------------------------------------------------------
// Grafik verisi
// ---------------------------------------------------------------------------

export interface SeriesPoint { key: string; label: string; ciroKurus: number; expenseKurus: number }

/** Dönemin her günü için ciro ve gider (boş günler 0). 62 günden uzun dönemde aylık toplanır. */
export function dailySeries(rep: ServiceReport): SeriesPoint[] {
  const from = new Date(`${rep.period.from}T12:00:00`);
  const to = new Date(`${rep.period.to}T12:00:00`);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const byDate = new Map(rep.daily.map((d) => [d.date, d]));
  if (days > 62) {
    const months = new Map<string, SeriesPoint>();
    for (let d = new Date(from); d <= to; d.setMonth(d.getMonth() + 1, 1)) {
      const ym = localDate(d).slice(0, 7);
      months.set(ym, { key: ym, label: MONTHS[d.getMonth()]!.slice(0, 3), ciroKurus: 0, expenseKurus: 0 });
    }
    for (const d of rep.daily) {
      const m = months.get(d.date.slice(0, 7));
      if (m) { m.ciroKurus += d.ciroKurus; m.expenseKurus += d.expenseKurus; }
    }
    return [...months.values()];
  }
  const out: SeriesPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = localDate(d);
    const v = byDate.get(key);
    out.push({ key, label: String(d.getDate()), ciroKurus: v?.ciroKurus ?? 0, expenseKurus: v?.expenseKurus ?? 0 });
  }
  return out;
}

/** Son `n` ayın ciro ve gideri (en eski önce), bu ay dahil */
export function monthlySeries(records: readonly ServiceRecord[], expenses: readonly BusinessExpense[], now: Date = new Date(), n = 6): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const last = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const p: Period = { kind: 'custom', from: localDate(first), to: localDate(last), label: '' };
    const r = buildReport(records, p, expenses);
    out.push({ key: localDate(first).slice(0, 7), label: MONTHS[first.getMonth()]!.slice(0, 3), ciroKurus: r.revenue.ciroKurus, expenseKurus: r.expenses.totalKurus });
  }
  return out;
}

export interface MonthCompare {
  current: { label: string; ciroKurus: number; expenseKurus: number; netKurus: number };
  previous: { label: string; ciroKurus: number; expenseKurus: number; netKurus: number };
  /** Ayın aynı gününe kadar karşılaştırma (ör. 1–16 Kasım ↔ 1–16 Ekim) */
  sameDays: boolean;
}

/** Bu ay (bugüne kadar) ile geçen ayın aynı günlerine kadar olan kısmı */
export function monthCompare(records: readonly ServiceRecord[], expenses: readonly BusinessExpense[], now: Date = new Date()): MonthCompare {
  const cur = periodOf('month', now);
  const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const prevTo = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), prevLastDay));
  const prev: Period = { kind: 'custom', from: localDate(prevFirst), to: localDate(prevTo), label: MONTHS[prevFirst.getMonth()]! };
  const a = buildReport(records, cur, expenses);
  const b = buildReport(records, prev, expenses);
  const pick = (r: ServiceReport, label: string) => ({ label, ciroKurus: r.revenue.ciroKurus, expenseKurus: r.expenses.totalKurus, netKurus: r.netKurus });
  return { current: pick(a, MONTHS[now.getMonth()]!), previous: pick(b, MONTHS[prevFirst.getMonth()]!), sameDays: true };
}

// ---------------------------------------------------------------------------
// Borçlu müşteriler
// ---------------------------------------------------------------------------

export interface Debtor {
  customerId: string;
  customerName: string;
  customerPhone: string;
  debtKurus: number;
  /** Borcu olan kayıtlar (en eskisi önce) */
  records: { id: string; plate: string; date: string; balanceKurus: number }[];
  oldestDate: string;
}

/** Tamamlanmış kayıtlarda kalan borcu olan müşteriler; en çok borçlu önce. */
export function debtors(allRecords: readonly ServiceRecord[]): Debtor[] {
  const map = new Map<string, Debtor>();
  for (const r of unique(allRecords)) {
    if (!isRevenue(r.status)) continue;
    const bal = balanceKurus(r);
    if (bal <= 0) continue;
    const date = revenueDateOf(r);
    const d = map.get(r.customerId) ?? { customerId: r.customerId, customerName: r.customerName, customerPhone: r.customerPhone, debtKurus: 0, records: [], oldestDate: date };
    d.debtKurus += bal;
    d.records.push({ id: r.id, plate: r.plate, date, balanceKurus: bal });
    if (date < d.oldestDate) d.oldestDate = date;
    map.set(r.customerId, d);
  }
  for (const d of map.values()) d.records.sort((a, b) => a.date.localeCompare(b.date));
  return [...map.values()].sort((a, b) => b.debtKurus - a.debtKurus);
}

/** Müşterinin bugünkü toplam borcu */
export function customerDebtKurus(records: readonly ServiceRecord[], customerId: string): number {
  return debtors(records.filter((r) => r.customerId === customerId))[0]?.debtKurus ?? 0;
}

// ---------------------------------------------------------------------------
// CSV (Excel, Türkçe ayarlar: ";" ayraç, "," ondalık, UTF-8 BOM)
// ---------------------------------------------------------------------------

const money = (k: number) => formatNumber(k / 100, 2).replace(/\./g, '');
const cell = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(allRecords: readonly ServiceRecord[], period: Period, expenses: readonly BusinessExpense[] = []): string {
  const records = unique(allRecords);
  const head = ['Kabul tarihi', 'Ciro tarihi', 'Plaka', 'Araç', 'Müşteri', 'Telefon', 'Durum', 'Ciroya dahil', 'Parça geliri', 'İşçilik geliri', 'İndirim', 'KDV oranı', 'KDV', 'Müşteri toplamı', 'Ödenen', 'Kalan', 'Ödeme durumu'];
  const rows = records
    .filter((r) => inPeriod(localDateOf(r.intakeAt), period) || (isRevenue(r.status) && inPeriod(revenueDateOf(r), period)))
    .sort((a, b) => a.intakeAt.localeCompare(b.intakeAt))
    .map((r) => {
      const t = r.totals;
      const n = netPartsLabor(r.items);
      const paid = paidKurus(r.payments);
      const counted = isRevenue(r.status) && inPeriod(revenueDateOf(r), period);
      return [
        localDateOf(r.intakeAt), isRevenue(r.status) ? revenueDateOf(r) : '', r.plate, r.vehicleLabel, r.customerName, r.customerPhone,
        SERVICE_STATUS_LABEL[r.status], counted ? 'Evet' : 'Hayır', money(n.partsKurus), money(n.laborKurus), money(t.discountKurus),
        t.vatRate == null ? 'Yok' : `%${t.vatRate}`, money(t.vatKurus), money(t.grandKurus), money(paid), money(t.grandKurus - paid),
        PAYMENT_STATE_LABEL[paymentState(r)],
      ];
    });
  const payHead = ['Ödeme tarihi', 'Plaka', 'Müşteri', 'Yöntem', 'Tutar', 'Not'];
  const pays = records.flatMap((r) => activePayments(r.payments)
    .filter((p) => inPeriod(localDateOf(p.paidAt), period))
    .map((p) => ({ r, p })))
    .sort((a, b) => a.p.paidAt.localeCompare(b.p.paidAt))
    .map(({ r, p }) => [localDateOf(p.paidAt), r.plate, r.customerName, PAYMENT_METHOD_LABEL[p.method], money(p.amountKurus), p.note ?? '']);
  const lines = [
    [`PISTON CİRO: ${period.label} (${period.from} – ${period.to})`],
    ['Bu tablo işletme içi gelir-gider takibidir; fatura, kesin net kâr veya resmi defter yerine geçmez.'],
    [],
    ['SERVİS KAYITLARI'],
    head,
    ...rows,
    [],
    ['TAHSİLATLAR'],
    payHead,
    ...pays,
    [],
    ['GİDERLER'],
    ['Tarih', 'Tutar', 'Açıklama'],
    ...expensesIn(expenses, period).slice().reverse().map((x) => [x.spentOn, money(x.amountKurus), x.description ?? '']),
  ];
  return '﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n');
}
