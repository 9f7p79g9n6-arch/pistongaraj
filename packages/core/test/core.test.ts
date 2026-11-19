import { describe, expect, it } from 'vitest';
import cases from './fixtures/due-cases.json';
import {
  addMonths,
  canAddVehicle,
  checkOdometerUpdate,
  computeDue,
  consumption,
  daysBetween,
  describeLeft,
  formatNumber,
  formatTL,
  isISODate,
  lastMonthKeys,
  parseDateTR,
  toDateTR,
  maskVin,
  monthlyTotals,
  normalizePlate,
  parseNumberTR,
  sortByUrgency,
  validateFuelEntry,
  validateModelYear,
  validatePlate,
  validateRule,
  validateVin,
  yearlyEstimate,
  type FuelRecord,
  type MaintenanceRule,
} from '../src';

const fuel = (km: number, qty: number, full: boolean, date = '2026-10-01', price = 60): FuelRecord => ({
  id: `f${km}`, vehicleId: 'v', filledOn: date, odometerKm: km, quantity: qty, unit: 'L',
  unitPrice: price, totalAmount: Math.round(qty * price * 100) / 100, isFullTank: full, fuelType: 'diesel',
});

describe('tarihler', () => {
  it('ay sonunu sabitler', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2026-03-10', -12)).toBe('2025-03-10');
  });
  it('gün farkı yaz saatinden etkilenmez', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-11-14', '2026-10-01')).toBe(-44);
  });
  it('geçersiz tarihi yakalar', () => {
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-02-28')).toBe(true);
  });
  it('Türkçe tarih girişi', () => {
    expect(parseDateTR('14.11.2026')).toBe('2026-11-14');
    expect(parseDateTR('1.3.2026')).toBe('2026-03-01');
    expect(parseDateTR('31.02.2026')).toBeNull();
    expect(parseDateTR('2026-11-14')).toBeNull();
    expect(toDateTR('2026-11-14')).toBe('14.11.2026');
  });
  it('son ayları üretir', () => {
    expect(lastMonthKeys('2026-01-15', 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('bakım durumu (SQL görünümüyle ortak vakalar)', () => {
  for (const c of cases) {
    it(c.name, () => {
      const rule = { id: 'r', vehicleId: 'v', itemKey: 'x', title: 'x', source: 'user', enabled: true, ...c.rule } as MaintenanceRule;
      const due = computeDue(rule, c.odometer, c.today);
      expect({ status: due.status, nextDueKm: due.nextDueKm, nextDueOn: due.nextDueOn, kmLeft: due.kmLeft, daysLeft: due.daysLeft }).toEqual(c.expect);
    });
  }

  it('aciliyete göre sıralar', () => {
    const mk = (status: 'ok' | 'overdue' | 'due_soon', usedRatio: number, id: string) => ({ id, due: { status, usedRatio } as never });
    const sorted = sortByUrgency([mk('ok', 0.9, 'a'), mk('overdue', 1.1, 'b'), mk('due_soon', 0.95, 'c'), mk('overdue', 1.4, 'd')]);
    expect(sorted.map((s) => s.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('kural formunu doğrular', () => {
    const base = { kind: 'interval' as const, title: 'Motor yağı', everyKm: null, everyMonths: null, lastDoneKm: null, lastDoneOn: null, dueOn: null };
    expect(validateRule(base, 1000)).toContain('Kilometre ya da ay olarak en az bir aralık gir.');
    expect(validateRule({ ...base, everyKm: 15000, lastDoneKm: 5000 }, 1000)).toContain(
      'Son yapıldığı kilometre, aracın güncel kilometresinden büyük olamaz.',
    );
    expect(validateRule({ ...base, everyKm: 15000, lastDoneKm: 900 }, 1000)).toEqual([]);
    expect(validateRule({ ...base, kind: 'due_date' }, 1000)).toEqual(['Son tarihi seç.']);
  });
});

describe('yakıt tüketimi (depo dolum yöntemi)', () => {
  it('iki tam dolum arasını ölçer', () => {
    const s = consumption([fuel(1000, 40, true), fuel(1800, 44, true)]);
    expect(s.points).toHaveLength(1);
    expect(s.averagePer100).toBeCloseTo(5.5, 5);
  });

  it('kısmi dolumu bir sonraki tam dolumda hesaba katar', () => {
    const s = consumption([fuel(1000, 40, true), fuel(1300, 10, false), fuel(1800, 34, true)]);
    // 10 + 34 = 44 L / 800 km
    expect(s.points).toHaveLength(1);
    expect(s.averagePer100).toBeCloseTo(5.5, 5);
  });

  it('naif hesap bu durumda yanlış sonuç verirdi', () => {
    // Kısmi dolumu yok sayıp 34 L / 500 km hesaplamak 6,8 L verir; doğru değer 5,5 L.
    const s = consumption([fuel(1000, 40, true), fuel(1300, 10, false), fuel(1800, 34, true)]);
    expect(s.averagePer100).not.toBeCloseTo(6.8, 1);
  });

  it('ilk tam dolumdan önceki kısmi dolumları yok sayar', () => {
    const s = consumption([fuel(500, 20, false), fuel(1000, 40, true), fuel(1800, 44, true)]);
    expect(s.averagePer100).toBeCloseTo(5.5, 5);
  });

  it('tek tam dolumla ölçüm yapmaz', () => {
    expect(consumption([fuel(1000, 40, true)]).averagePer100).toBeNull();
  });

  it('ağırlıklı ortalama ve km başı maliyet', () => {
    const s = consumption([fuel(0, 40, true), fuel(1000, 50, true, '2026-10-01', 60), fuel(1500, 30, true, '2026-10-10', 60)]);
    expect(s.averagePer100).toBeCloseTo((80 / 1500) * 100, 5);
    expect(s.costPerKm).toBeCloseTo((80 * 60) / 1500, 5);
  });

  it('kilometre tutarlılığını kontrol eder', () => {
    const existing = [fuel(1000, 40, true, '2026-10-01'), fuel(1800, 44, true, '2026-10-20')];
    expect(validateFuelEntry({ odometerKm: 1700, quantity: 30, unitPrice: 60, filledOn: '2026-10-25' }, existing)[0]).toMatch(/önceki kayıttan/);
    expect(validateFuelEntry({ odometerKm: 1900, quantity: 30, unitPrice: 60, filledOn: '2026-10-10' }, existing)[0]).toMatch(/sonraki kayıttan/);
    expect(validateFuelEntry({ odometerKm: 1400, quantity: 30, unitPrice: 60, filledOn: '2026-10-10' }, existing)).toEqual([]);
    expect(validateFuelEntry({ odometerKm: 2000, quantity: 0, unitPrice: 60, filledOn: '2026-10-25' }, existing)).toHaveLength(1);
  });
});

describe('giderler', () => {
  it('ay kovalarına böler', () => {
    const rows = monthlyTotals(
      '2026-11-14', 3,
      [fuel(1000, 10, true, '2026-10-05', 60)],
      [{ id: 'e', vehicleId: 'v', category: 'parking', amount: 100, spentOn: '2026-11-01', note: null },
       { id: 'e2', vehicleId: 'v', category: 'repair', amount: 900, spentOn: '2026-09-03', note: null },
       { id: 'old', vehicleId: 'v', category: 'parking', amount: 999, spentOn: '2026-01-01', note: null }],
      [{ id: 'm', vehicleId: 'v', ruleId: null, title: 'Yağ', performedOn: '2026-11-02', odometerKm: 1, cost: 2000, performedBy: null, notes: null, hasDocument: false }],
    );
    expect(rows.map((r) => r.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(rows[0]).toMatchObject({ maintenance: 900, total: 900 });
    expect(rows[1]).toMatchObject({ fuel: 600, total: 600 });
    expect(rows[2]).toMatchObject({ maintenance: 2000, other: 100, total: 2100 });
  });

  it('yıllık tahmin veri olmayan baştaki ayları saymaz', () => {
    const r = (total: number) => ({ month: '', fuel: total, maintenance: 0, other: 0, total });
    expect(yearlyEstimate([r(0), r(0), r(1000), r(2000)])).toBe(18000);
    expect(yearlyEstimate([r(0)])).toBeNull();
  });
});

describe('doğrulama', () => {
  it('şasi numarası', () => {
    expect(validateVin('')).toBeNull();
    expect(validateVin('WF0XXXGCDXGA12345')).toBeNull();
    expect(validateVin('wf0x xxgc dxga1234 5')).toBeNull();
    expect(validateVin('WF0XXXGCDXGA1234')).toMatch(/17 karakter/);
    expect(validateVin('WF0XXXGCDXGO12345')).toMatch(/I, O ve Q/);
    expect(maskVin('WF0XXXGCDXGA12345')).toBe('WF0••••••••••2345');
  });

  it('plaka', () => {
    expect(validatePlate('34 abc 123')).toBeNull();
    expect(validatePlate('06A1234')).toBeNull();
    expect(validatePlate('82 AB 123')).toMatch(/İl kodu/);
    expect(validatePlate('34 QW 123')).toMatch(/Q, W ve X/);
    expect(validatePlate('ABC')).toMatch(/biçimi/);
    expect(normalizePlate('34abc123')).toBe('34 ABC 123');
    // Türkçe klavye: küçük i büyütülünce İ olmamalı
    expect(validatePlate('34 abi 12')).toBeNull();
    expect(normalizePlate('34 abi 12')).toBe('34 ABI 12');
    expect(validatePlate('34 ŞA 123')).toMatch(/Ç, Ğ, Ö, Ş, Ü/);
  });

  it('kilometre güncelleme', () => {
    expect(checkOdometerUpdate(1000, 900).error).toMatch(/küçük olamaz/);
    expect(checkOdometerUpdate(148760, 100).error).toContain('148.760 km');
    expect(checkOdometerUpdate(1000, 25000).warning).toMatch(/Doğru mu/);
    expect(checkOdometerUpdate(1000, 1200)).toEqual({ error: null, warning: null });
  });

  it('model yılı', () => {
    const now = new Date('2026-11-14');
    expect(validateModelYear(2027, now)).toBeNull();
    expect(validateModelYear(2028, now)).toMatch(/1950 ile 2027/);
  });

  it('Türkçe sayı girişi', () => {
    expect(parseNumberTR('148.760')).toBe(148760);
    expect(parseNumberTR('45,3')).toBe(45.3);
    expect(parseNumberTR('1.249,90')).toBe(1249.9);
    expect(parseNumberTR('63.5')).toBe(63.5);
    expect(parseNumberTR('abc')).toBeNull();
    expect(parseNumberTR('')).toBeNull();
  });
});

describe('biçimlendirme ve plan', () => {
  it('Türkçe biçim', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatTL(1249.9)).toBe('1.249,90 ₺');
    expect(formatNumber(-1500)).toBe('-1.500');
    expect(describeLeft(2240, 116)).toBe('2.240 km kaldı · 116 gün kaldı');
    expect(describeLeft(-1000, -3)).toBe('1.000 km geçti · 3 gün gecikti');
  });
  it('ücretsiz planda 5 araç', () => {
    expect(canAddVehicle('free', 4)).toBe(true);
    expect(canAddVehicle('free', 5)).toBe(false);
    expect(canAddVehicle('plus', 5)).toBe(true);
  });
});
