import { lastMonthKeys, monthKey, type ISODate } from './dates';
import type { ExpenseCategory, ExpenseRecord, FuelRecord, MaintenanceEvent } from './types';

export type CostBucket = 'fuel' | 'maintenance' | 'other';

export interface MonthTotals {
  month: string; // "2026-11"
  fuel: number;
  maintenance: number;
  other: number;
  total: number;
}

const MAINTENANCE_CATS: ReadonlySet<ExpenseCategory> = new Set(['maintenance', 'repair']);

/**
 * Son `months` ayın gider toplamları. Bakım olayları (maintenance_events) ve
 * bakım/onarım kategorisindeki masraflar "bakım" kovasına düşer.
 * Aynı işlemin hem olay hem masraf olarak iki kez sayılmaması için olaylar yalnızca
 * `cost` alanıyla, masraflar kendi kayıtlarıyla sayılır; uygulama bir işlemi yalnızca birinde tutar.
 */
export function monthlyTotals(
  today: ISODate,
  months: number,
  fuel: FuelRecord[],
  expenses: ExpenseRecord[],
  events: MaintenanceEvent[],
): MonthTotals[] {
  const keys = lastMonthKeys(today, months);
  const map = new Map<string, MonthTotals>(keys.map((k) => [k, { month: k, fuel: 0, maintenance: 0, other: 0, total: 0 }]));
  const add = (date: ISODate, bucket: CostBucket, amount: number) => {
    const row = map.get(monthKey(date));
    if (!row || !Number.isFinite(amount)) return;
    row[bucket] += amount;
    row.total += amount;
  };
  fuel.forEach((r) => add(r.filledOn, 'fuel', r.totalAmount));
  expenses.forEach((e) => add(e.spentOn, MAINTENANCE_CATS.has(e.category) ? 'maintenance' : 'other', e.amount));
  events.forEach((e) => e.cost != null && add(e.performedOn, 'maintenance', e.cost));
  return keys.map((k) => map.get(k)!);
}

/**
 * Yıllık gider tahmini: elimizdeki ayların ortalaması × 12.
 * Veri olmayan (henüz kayıt girilmemiş) baştaki aylar ortalamaya katılmaz.
 */
export function yearlyEstimate(rows: MonthTotals[]): number | null {
  const firstWithData = rows.findIndex((r) => r.total > 0);
  if (firstWithData < 0) return null;
  const used = rows.slice(firstWithData);
  return (used.reduce((a, r) => a + r.total, 0) / used.length) * 12;
}

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  maintenance: 'Bakım',
  repair: 'Onarım',
  insurance: 'Sigorta / kasko',
  inspection: 'Muayene',
  tax: 'MTV / vergi',
  parking: 'Otopark',
  toll: 'Köprü / otoyol',
  wash: 'Yıkama',
  fine: 'Ceza',
  other: 'Diğer',
};
