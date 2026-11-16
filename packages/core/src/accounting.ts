/**
 * PISTON SERVİS muhasebe raporu: ciro, tahsilat, alacak (borçlu müşteriler), dönem özeti ve CSV.
 * Kurallar:
 *   * Ciroya müşterinin onayladığı ve tamamlanan kayıtlar sayılır; onay bekleyen ve itirazlı tutarlar ayrı gösterilir.
 *   * Tahsilat, ödemenin alındığı tarihe göre döneme girer (kaydın açıldığı tarihe göre değil).
 *   * İptal edilen ödeme hiçbir toplama girmez.
 *   * Alacak (borç) dönemden bağımsızdır: bugün itibarıyla ödenmemiş tutar.
 * Bu rapor muhasebeciye veri sağlar; fatura, e-arşiv ya da resmi defter yerine geçmez.
 */
import { formatNumber } from './format';
import {
  needsCustomerAction,
  PAYMENT_METHOD_LABEL,
  SERVICE_STATUS_LABEL,
  type PaymentMethod,
  type ServicePayment,
  type ServiceRecord,
  type ServiceRecordStatus,
} from './service';

/** Ciroya sayılan durumlar */
export const REVENUE_STATUSES: readonly ServiceRecordStatus[] = ['approved', 'completed'];
export const isRevenue = (s: ServiceRecordStatus) => REVENUE_STATUSES.includes(s);

export function activePayments(payments: readonly ServicePayment[]): ServicePayment[] {
  return payments.filter((p) => !p.voidedAt);
}

export function paidKurus(payments: readonly ServicePayment[]): number {
  return activePayments(payments).reduce((s, p) => s + p.amountKurus, 0);
}

/** Kalan borç. Negatifse fazla ödeme (kayıt düzeltilip tutar düşmüş olabilir). */
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

// ---------------------------------------------------------------------------
// Dönem
// ---------------------------------------------------------------------------

export type PeriodKind = 'today' | 'week' | 'month' | 'last_month';

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
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const last = new Date(today.getFullYear(), today.getMonth(), 0);
  return { kind, from: localDate(first), to: localDate(last), label: `${MONTHS[first.getMonth()]} ${first.getFullYear()}` };
}

const inPeriod = (date: string, p: Period) => date >= p.from && date <= p.to;

// ---------------------------------------------------------------------------
// Rapor
// ---------------------------------------------------------------------------

export interface MoneySummary {
  count: number;
  partsKurus: number;
  laborKurus: number;
  discountKurus: number;
  vatKurus: number;
  grandKurus: number;
}

export interface ServiceReport {
  period: Period;
  /** Dönemde açılan tüm kayıtlar */
  recordCount: number;
  customerCount: number;
  /** Ciro: onaylı ve tamamlanan */
  revenue: MoneySummary;
  /** Ciroya sayılmayanlar */
  awaiting: { count: number; grandKurus: number };
  objected: { count: number; grandKurus: number };
  /** Dönemde alınan ödemeler (alındığı tarihe göre) */
  collected: { totalKurus: number; byMethod: Record<PaymentMethod, number>; count: number };
  /** Dönemdeki cirodan henüz tahsil edilmeyen */
  periodUnpaidKurus: number;
  /** Bugün itibarıyla toplam alacak (dönemden bağımsız) */
  receivableKurus: number;
  topParts: { name: string; count: number; totalKurus: number }[];
  daily: { date: string; count: number; grandKurus: number; collectedKurus: number }[];
}

const emptyMoney = (): MoneySummary => ({ count: 0, partsKurus: 0, laborKurus: 0, discountKurus: 0, vatKurus: 0, grandKurus: 0 });

export function buildReport(records: readonly ServiceRecord[], period: Period): ServiceReport {
  const opened = records.filter((r) => inPeriod(localDateOf(r.intakeAt), period));
  const revenue = emptyMoney();
  const awaiting = { count: 0, grandKurus: 0 };
  const objected = { count: 0, grandKurus: 0 };
  let periodUnpaid = 0;
  const parts = new Map<string, { name: string; count: number; totalKurus: number }>();
  const daily = new Map<string, { date: string; count: number; grandKurus: number; collectedKurus: number }>();
  const day = (date: string) => {
    let d = daily.get(date);
    if (!d) { d = { date, count: 0, grandKurus: 0, collectedKurus: 0 }; daily.set(date, d); }
    return d;
  };

  for (const r of opened) {
    if (isRevenue(r.status)) {
      const t = r.totals;
      revenue.count += 1;
      revenue.partsKurus += t.partsKurus;
      revenue.laborKurus += t.laborKurus;
      revenue.discountKurus += t.discountKurus;
      revenue.vatKurus += t.vatKurus;
      revenue.grandKurus += t.grandKurus;
      periodUnpaid += Math.max(0, balanceKurus(r));
      const dd = day(localDateOf(r.intakeAt));
      dd.count += 1;
      dd.grandKurus += t.grandKurus;
      for (const i of r.items) {
        if (i.partQty <= 0 || !i.partName) continue;
        const key = i.partName.trim().toLocaleLowerCase('tr');
        const e = parts.get(key) ?? { name: i.partName.trim(), count: 0, totalKurus: 0 };
        e.count += i.partQty;
        e.totalKurus += i.partQty * i.partUnitKurus;
        parts.set(key, e);
      }
    } else if (needsCustomerAction(r.status)) {
      awaiting.count += 1;
      awaiting.grandKurus += r.totals.grandKurus;
    } else if (r.status === 'objected') {
      objected.count += 1;
      objected.grandKurus += r.totals.grandKurus;
    }
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

  return {
    period,
    recordCount: opened.length,
    customerCount: new Set(opened.map((r) => r.customerId)).size,
    revenue,
    awaiting,
    objected,
    collected: { totalKurus: collectedTotal, byMethod, count: collectedCount },
    periodUnpaidKurus: periodUnpaid,
    receivableKurus: debtors(records).reduce((s, d) => s + d.debtKurus, 0),
    topParts: [...parts.values()].sort((a, b) => b.totalKurus - a.totalKurus).slice(0, 10),
    daily: [...daily.values()].sort((a, b) => b.date.localeCompare(a.date)),
  };
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

/** Onaylı ya da tamamlanmış kayıtlarda kalan borcu olan müşteriler; en çok borçlu önce. */
export function debtors(records: readonly ServiceRecord[]): Debtor[] {
  const map = new Map<string, Debtor>();
  for (const r of records) {
    if (!isRevenue(r.status)) continue;
    const bal = balanceKurus(r);
    if (bal <= 0) continue;
    const date = localDateOf(r.intakeAt);
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

export function reportCsv(records: readonly ServiceRecord[], period: Period): string {
  const head = ['Tarih', 'Plaka', 'Araç', 'Müşteri', 'Telefon', 'Durum', 'Ciroya dahil', 'Parça', 'İşçilik', 'İndirim', 'KDV oranı', 'KDV', 'Genel toplam', 'Ödenen', 'Kalan', 'Ödeme durumu'];
  const rows = records
    .filter((r) => inPeriod(localDateOf(r.intakeAt), period))
    .sort((a, b) => a.intakeAt.localeCompare(b.intakeAt))
    .map((r) => {
      const t = r.totals;
      const paid = paidKurus(r.payments);
      return [
        localDateOf(r.intakeAt), r.plate, r.vehicleLabel, r.customerName, r.customerPhone, SERVICE_STATUS_LABEL[r.status],
        isRevenue(r.status) ? 'Evet' : 'Hayır', money(t.partsKurus), money(t.laborKurus), money(t.discountKurus),
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
    [`PISTON SERVİS raporu: ${period.label} (${period.from} – ${period.to})`],
    ['Bu tablo bilgilendirme amaçlıdır; fatura veya resmi defter yerine geçmez.'],
    [],
    ['SERVİS KAYITLARI'],
    head,
    ...rows,
    [],
    ['TAHSİLATLAR'],
    payHead,
    ...pays,
  ];
  return '﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n');
}
