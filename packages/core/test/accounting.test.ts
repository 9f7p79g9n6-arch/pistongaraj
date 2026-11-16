import { describe, expect, it } from 'vitest';
import {
  balanceKurus,
  buildReport,
  computeServiceTotals,
  customerDebtKurus,
  debtors,
  paidKurus,
  paymentState,
  periodOf,
  reportCsv,
  validatePayment,
  type ServicePayment,
  type ServiceRecord,
  type ServiceRecordStatus,
} from '../src';

// Saatler öğlen: hangi saat diliminde çalışırsa çalışsın yerel tarih aynı kalır
let n = 0;
function rec(p: { date: string; status?: ServiceRecordStatus; customer?: string; parts?: [string, number][]; labor?: number; vat?: number | null; payments?: Partial<ServicePayment>[] }): ServiceRecord {
  n += 1;
  const items = [
    ...(p.labor ? [{ title: 'İşçilik', description: null, partName: null, partQty: 0, partUnitKurus: 0, laborKurus: p.labor, discountKurus: 0 }] : []),
    ...(p.parts ?? []).map(([name, k]) => ({ title: name, description: null, partName: name, partQty: 1, partUnitKurus: k, laborKurus: 0, discountKurus: 0 })),
  ];
  return {
    id: `r${n}`, businessId: 'b', businessName: 'Usta Oto', businessVerified: false,
    customerId: p.customer ?? 'c1', customerName: p.customer === 'c2' ? 'Mehmet Kaya' : 'Ayşe Yılmaz', customerPhone: '+905339998877',
    vehicleId: 'v', plate: '34 ABC 123', vehicleLabel: 'Ford Focus', status: p.status ?? 'approved', approvalVersion: 1,
    intakeAt: `${p.date}T12:00:00`, odometerKm: 1000, complaint: 'Bakım', initialNote: null, fuelLevel: null, existingDamage: null,
    items: items.map((i, k) => ({ ...i, id: `i${k}` })), files: [], totals: computeServiceTotals(items, p.vat === undefined ? null : p.vat),
    responses: [], history: [], createdAt: `${p.date}T12:00:00`, updatedAt: `${p.date}T12:00:00`, approvedAt: null,
    payments: (p.payments ?? []).map((x, k) => ({ id: `p${n}-${k}`, amountKurus: 0, method: 'cash', paidAt: `${p.date}T12:00:00`, note: null, voidedAt: null, voidReason: null, ...x })),
  };
}

describe('bakiye ve ödeme durumu', () => {
  it('iptal edilen ödeme sayılmaz', () => {
    const r = rec({ date: '2026-11-10', labor: 100_00, payments: [{ amountKurus: 40_00 }, { amountKurus: 60_00, voidedAt: '2026-11-11T10:00:00' }] });
    expect(paidKurus(r.payments)).toBe(40_00);
    expect(balanceKurus(r)).toBe(60_00);
    expect(paymentState(r)).toBe('partial');
  });
  it('durumlar', () => {
    expect(paymentState(rec({ date: '2026-11-10', labor: 100 }))).toBe('unpaid');
    expect(paymentState(rec({ date: '2026-11-10', labor: 100, payments: [{ amountKurus: 100 }] }))).toBe('paid');
    expect(paymentState(rec({ date: '2026-11-10', labor: 100, payments: [{ amountKurus: 150 }] }))).toBe('overpaid');
  });
  it('ödeme girişi: kalan borçtan fazla olamaz', () => {
    expect(validatePayment(5000, 5000)).toBeNull();
    expect(validatePayment(5001, 5000)).not.toBeNull();
    expect(validatePayment(0, 5000)).not.toBeNull();
    expect(validatePayment(null, 5000)).not.toBeNull();
    expect(validatePayment(100, 0)).toMatch(/borcu yok/);
  });
});

describe('dönem', () => {
  const now = new Date(2026, 10, 18, 15, 0); // 18 Kasım 2026 Çarşamba
  it('bugün, bu hafta (pazartesi), bu ay, geçen ay', () => {
    expect(periodOf('today', now)).toMatchObject({ from: '2026-11-18', to: '2026-11-18' });
    expect(periodOf('week', now)).toMatchObject({ from: '2026-11-16', to: '2026-11-18' });
    expect(periodOf('month', now)).toMatchObject({ from: '2026-11-01', to: '2026-11-18', label: 'Kasım 2026' });
    expect(periodOf('last_month', now)).toMatchObject({ from: '2026-10-01', to: '2026-10-31', label: 'Ekim 2026' });
    expect(periodOf('last_month', new Date(2026, 0, 5))).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('rapor', () => {
  const period = { kind: 'custom' as const, from: '2026-11-01', to: '2026-11-30', label: 'Kasım' };
  const records = [
    rec({ date: '2026-11-02', parts: [['Fren balatası', 1000_00], ['Motor yağı', 900_00]], labor: 500_00, vat: 20, payments: [{ amountKurus: 2880_00, method: 'card', paidAt: '2026-11-02T13:00:00' }] }),
    rec({ date: '2026-11-05', status: 'completed', customer: 'c2', parts: [['fren balatası', 1200_00]], labor: 300_00, payments: [{ amountKurus: 500_00, paidAt: '2026-12-01T10:00:00' }] }),
    rec({ date: '2026-11-06', status: 'awaiting_approval', labor: 700_00 }),
    rec({ date: '2026-11-07', status: 'objected', labor: 400_00 }),
    rec({ date: '2026-10-20', labor: 1000_00, payments: [{ amountKurus: 300_00, method: 'transfer', paidAt: '2026-11-03T09:00:00' }] }),
  ];

  it('ciroya yalnızca onaylı ve tamamlanan kayıtlar girer', () => {
    const r = buildReport(records, period);
    expect(r.recordCount).toBe(4);
    expect(r.customerCount).toBe(2);
    expect(r.revenue).toMatchObject({ count: 2, partsKurus: 3100_00, laborKurus: 800_00, vatKurus: 480_00, grandKurus: 4380_00 });
    expect(r.awaiting).toEqual({ count: 1, grandKurus: 700_00 });
    expect(r.objected).toEqual({ count: 1, grandKurus: 400_00 });
  });

  it('tahsilat ödemenin alındığı tarihe göre döneme girer', () => {
    const r = buildReport(records, period);
    expect(r.collected.totalKurus).toBe(3180_00); // 2.880 kart + 300 havale (ekim kaydı); aralık ödemesi dahil değil
    expect(r.collected.byMethod).toEqual({ cash: 0, card: 2880_00, transfer: 300_00, other: 0 });
    expect(r.periodUnpaidKurus).toBe(1000_00); // kasım cirosunun kalanı: 1.500 − 500 (aralıkta ödendi)
  });

  it('alacak dönemden bağımsız: bugünkü toplam borç', () => {
    const r = buildReport(records, period);
    expect(r.receivableKurus).toBe(1000_00 + 700_00);
  });

  it('en çok değişen parçalar büyük-küçük harf farkı gözetmeden birleşir', () => {
    const r = buildReport(records, period);
    expect(r.topParts[0]).toEqual({ name: 'Fren balatası', count: 2, totalKurus: 2200_00 });
  });

  it('günlük döküm', () => {
    const r = buildReport(records, period);
    expect(r.daily.find((d) => d.date === '2026-11-03')).toEqual({ date: '2026-11-03', count: 0, grandKurus: 0, collectedKurus: 300_00 });
    expect(r.daily.find((d) => d.date === '2026-11-02')).toMatchObject({ count: 1, grandKurus: 2880_00, collectedKurus: 2880_00 });
  });
});

describe('borçlu müşteriler', () => {
  it('yalnızca onaylı/tamamlanan kayıtların kalan borcu; en çok borçlu önce', () => {
    const list = debtors([
      rec({ date: '2026-11-02', customer: 'c1', labor: 1000_00, payments: [{ amountKurus: 1000_00 }] }),
      rec({ date: '2026-11-03', customer: 'c1', labor: 300_00 }),
      rec({ date: '2026-11-01', customer: 'c1', labor: 200_00, payments: [{ amountKurus: 50_00 }] }),
      rec({ date: '2026-11-04', customer: 'c2', labor: 900_00, status: 'completed' }),
      rec({ date: '2026-11-04', customer: 'c2', labor: 900_00, status: 'awaiting_approval' }),
    ]);
    expect(list.map((d) => [d.customerId, d.debtKurus])).toEqual([['c2', 900_00], ['c1', 450_00]]);
    expect(list[1]!.oldestDate).toBe('2026-11-01');
    expect(list[1]!.records.map((r) => r.balanceKurus)).toEqual([150_00, 300_00]);
  });
  it('müşteri borcu', () => {
    const rs = [rec({ date: '2026-11-02', customer: 'c1', labor: 300_00 })];
    expect(customerDebtKurus(rs, 'c1')).toBe(300_00);
    expect(customerDebtKurus(rs, 'c2')).toBe(0);
  });
});

describe('CSV', () => {
  it('Türkçe Excel biçimi: BOM, ";" ayraç, virgüllü tutar, tırnaklı alan', () => {
    const r = rec({ date: '2026-11-02', labor: 1250_50, payments: [{ amountKurus: 1000_00, note: 'Kalan; haftaya' }] });
    const csv = reportCsv([r], { kind: 'custom', from: '2026-11-01', to: '2026-11-30', label: 'Kasım' });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('2026-11-02;34 ABC 123;Ford Focus;Ayşe Yılmaz;+905339998877;Müşteri onayladı;Evet;0,00;1250,50;0,00;Yok;0,00;1250,50;1000,00;250,50;Kısmen ödendi');
    expect(csv).toContain('"Kalan; haftaya"');
  });
});
