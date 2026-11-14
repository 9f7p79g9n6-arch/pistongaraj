import type { ISODate } from './dates';
import { formatNumber } from './format';
import type { FuelRecord } from './types';

export interface ConsumptionPoint {
  filledOn: ISODate;
  odometerKm: number;
  /** 100 km'de tüketim (L veya kWh) */
  per100: number;
  distanceKm: number;
}

export interface ConsumptionSummary {
  points: ConsumptionPoint[];
  /** Tüm ölçülebilir aralıkların ağırlıklı ortalaması (toplam yakıt / toplam km) */
  averagePer100: number | null;
  /** Ölçülen aralıklarda harcanan toplam tutar / toplam km */
  costPerKm: number | null;
  measuredKm: number;
}

/**
 * Depo dolum yöntemi (full-to-full).
 *
 * Bir ölçüm yalnızca iki TAM dolum arasında yapılabilir. Aradaki kısmi dolumlar biriktirilir ve
 * bir sonraki tam dolumda hesaba katılır. Her dolumda litre/km oranını doğrudan hesaplamak kısmi
 * dolumlarda yanlış sonuç verir (brifteki hesap hatası).
 *
 * İlk tam dolumdan önceki kısmi dolumlar ölçülemez ve yok sayılır.
 */
export function consumption(records: FuelRecord[]): ConsumptionSummary {
  const sorted = [...records].sort((a, b) => a.odometerKm - b.odometerKm || a.filledOn.localeCompare(b.filledOn));
  const points: ConsumptionPoint[] = [];
  let anchor: FuelRecord | null = null;
  let pendingQty = 0;
  let pendingCost = 0;
  let totalQty = 0;
  let totalCost = 0;
  let totalKm = 0;

  for (const r of sorted) {
    if (!anchor) {
      if (r.isFullTank) anchor = r;
      continue;
    }
    pendingQty += r.quantity;
    pendingCost += r.totalAmount;
    if (!r.isFullTank) continue;

    const dist = r.odometerKm - anchor.odometerKm;
    if (dist > 0) {
      points.push({ filledOn: r.filledOn, odometerKm: r.odometerKm, per100: (pendingQty / dist) * 100, distanceKm: dist });
      totalQty += pendingQty;
      totalCost += pendingCost;
      totalKm += dist;
    }
    anchor = r;
    pendingQty = 0;
    pendingCost = 0;
  }

  return {
    points,
    averagePer100: totalKm > 0 ? (totalQty / totalKm) * 100 : null,
    costPerKm: totalKm > 0 ? totalCost / totalKm : null,
    measuredKm: totalKm,
  };
}

export interface FuelInput {
  odometerKm: number | null;
  quantity: number | null;
  unitPrice: number | null;
  filledOn: ISODate;
}

/**
 * Yeni yakıt kaydını aynı araçtaki diğer kayıtlarla tutarlılık açısından doğrular.
 * Kilometre, tarih sırasına göre önceki kayıttan küçük, sonraki kayıttan büyük olamaz.
 */
export function validateFuelEntry(input: FuelInput, existing: FuelRecord[], unit: 'L' | 'kWh' = 'L'): string[] {
  const errors: string[] = [];
  const { odometerKm: km, quantity: q, unitPrice: p } = input;
  if (km == null || !Number.isFinite(km) || km <= 0) errors.push('Kilometreyi gir.');
  const maxQty = unit === 'kWh' ? 250 : 200;
  if (q == null || !(q > 0) || q > maxQty) errors.push(`Miktar 0 ile ${maxQty} ${unit} arasında olmalı.`);
  if (p == null || !(p > 0) || p > 1000) errors.push('Birim fiyatı kontrol et.');
  if (km != null && km > 0) {
    const before = existing.filter((r) => r.filledOn <= input.filledOn);
    const after = existing.filter((r) => r.filledOn > input.filledOn);
    const maxBefore = Math.max(0, ...before.map((r) => r.odometerKm));
    const minAfter = Math.min(Infinity, ...after.map((r) => r.odometerKm));
    if (km <= maxBefore) errors.push(`Kilometre, bu tarihten önceki kayıttan (${formatNumber(maxBefore)} km) büyük olmalı.`);
    else if (km >= minAfter) errors.push(`Kilometre, bu tarihten sonraki kayıttan (${formatNumber(minAfter)} km) küçük olmalı.`);
  }
  return errors;
}

/** Tutarı 2 ondalığa yuvarlar (kuruş). */
export function fuelTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}
