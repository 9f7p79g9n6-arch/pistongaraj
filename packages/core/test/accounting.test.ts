import { describe, expect, it } from 'vitest';
import {
  balanceKurus,
  buildReport,
  computeServiceTotals,
  countsAsDebt,
  customerDebtKurus,
  dailySeries,
  debtors,
  monthCompare,
  monthlySeries,
  netPartsLabor,
  paidKurus,
  parseDateTR,
  paymentState,
  periodOf,
  reportCsv,
  toDateTR,
  validateExpense,
  validatePayment,
  type BusinessExpense,
  type ServicePayment,
  type ServiceRecord,
  type ServiceRecordStatus,
} from '../src';

// Saatler öğlen: hangi saat diliminde çalışırsa çalışsın yerel tarih aynı kalır
let n = 0;
function rec(p: {
  date: string; status?: ServiceRecordStatus; completedOn?: string; customer?: string; parts?: [string, number][]; labor?: number;
  vat?: number | null; discountOnLabor?: number; payments?: Partial<ServicePayment>[]; id?: string;
}): ServiceRecord {
  n += 1;
  const status = p.status ?? 'completed';
  const items = [
    ...(p.labor ? [{ title: 'İşçilik', description: null, partName: null, partQty: 0, partUnitKurus: 0, laborKurus: p.labor, discountKurus: p.discountOnLabor ?? 0 }] : []),
    ...(p.parts ?? []).map(([name, k]) => ({ title: name, description: null, partName: name, partQty: 1, partUnitKurus: k, laborKurus: 0, discountKurus: 0 })),
  ];
  const done = p.completedOn ?? p.date;
  return {
    id: p.id ?? `r${n}`, businessId: 'b', businessName: 'Usta Oto', businessVerified: false,
    customerId: p.customer ?? 'c1', customerName: p.customer === 'c2' ? 'Mehmet Kaya' : 'Ayşe Yılmaz', customerPhone: '+905339998877',
    vehicleId: 'v', plate: '34 ABC 123', vehicleLabel: 'Ford Focus', status, approvalVersion: 1,
    intakeAt: `${p.date}T12:00:00`, odometerKm: 1000, complaint: 'Bakım', initialNote: null, fuelLevel: null, existingDamage: null,
    items: items.map((i, k) => ({ ...i, id: `i${k}` })), files: [], totals: computeServiceTotals(items, p.vat === undefined ? null : p.vat),
    responses: [],
    history: [{ status: 'awaiting_approval', at: `${p.date}T12:00:00`, by: 'business' }, ...(status === 'completed' ? [{ status: 'completed' as const, at: `${done}T12:00:00`, by: 'business' as const }] : [])],
    createdAt: `${p.date}T12:00:00`, updatedAt: `${done}T12:00:00`, approvedAt: null,
    payments: (p.payments ?? []).map((x, k) => ({ id: `p${n}-${k}`, amountKurus: 0, method: 'cash', paidAt: `${p.date}T12:00:00`, note: null, voidedAt: null, voidReason: null, ...x })),
  };
}
const exp = (spentOn: string, amountKurus: number, description: string | null = null): BusinessExpense =>
  ({ id: `${spentOn}-${amountKurus}`, amountKurus, description, spentOn, createdAt: `${spentOn}T12:00:00` });
const NOV = { kind: 'custom' as const, from: '2026-11-01', to: '2026-11-30', label: 'Kasım' };

describe('bakiye ve ödeme durumu', () => {
  it('iptal edilen ödeme sayılmaz; kısmi ödeme', () => {
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
  it('bugün, bu hafta (pazartesi), bu ay, geçen ay, bu yıl', () => {
    expect(periodOf('today', now)).toMatchObject({ from: '2026-11-18', to: '2026-11-18' });
    expect(periodOf('week', now)).toMatchObject({ from: '2026-11-16', to: '2026-11-18' });
    expect(periodOf('month', now)).toMatchObject({ from: '2026-11-01', to: '2026-11-18', label: 'Kasım 2026' });
    expect(periodOf('last_month', now)).toMatchObject({ from: '2026-10-01', to: '2026-10-31', label: 'Ekim 2026' });
    expect(periodOf('last_month', new Date(2026, 0, 5))).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodOf('year', now)).toMatchObject({ from: '2026-01-01', to: '2026-11-18', label: '2026 yılı' });
  });
});

describe('parça ve işçilik geliri', () => {
  it('indirim kalemden düşülür, KDV hariç', () => {
    expect(netPartsLabor([
      { title: 'İşçilik', description: null, partName: null, partQty: 0, partUnitKurus: 0, laborKurus: 1000_00, discountKurus: 100_00 },
      { title: 'Balata', description: null, partName: 'Balata', partQty: 2, partUnitKurus: 500_00, laborKurus: 0, discountKurus: 0 },
    ])).toEqual({ partsKurus: 1000_00, laborKurus: 900_00 });
  });
  it('karışık kalemde indirim orana göre bölünür', () => {
    expect(netPartsLabor([{ title: 'Yağ', description: null, partName: 'Yağ', partQty: 1, partUnitKurus: 300_00, laborKurus: 100_00, discountKurus: 40_00 }]))
      .toEqual({ partsKurus: 270_00, laborKurus: 90_00 });
  });
});

describe('PISTON CİRO raporu', () => {
  const records = [
    // Tamamlandı, kasımda: parça 1.900, işçilik 500, KDV %20; tamamen kartla ödendi
    rec({ date: '2026-11-02', parts: [['Fren balatası', 1000_00], ['Motor yağı', 900_00]], labor: 500_00, vat: 20, payments: [{ amountKurus: 2880_00, method: 'card', paidAt: '2026-11-02T13:00:00' }] }),
    // Tamamlandı, kasımda (müşteri c2): kısmi ödeme aralıkta
    rec({ date: '2026-11-05', customer: 'c2', parts: [['fren balatası', 1200_00]], labor: 300_00, payments: [{ amountKurus: 500_00, paidAt: '2026-12-01T10:00:00' }] }),
    // Ekimde açıldı, kasımda tamamlandı: ciro kasıma yazılır; kasımda havaleyle kısmi ödendi
    rec({ date: '2026-10-28', completedOn: '2026-11-03', labor: 1000_00, payments: [{ amountKurus: 300_00, method: 'transfer', paidAt: '2026-11-03T09:00:00' }] }),
    // Ciroya girmeyenler
    rec({ date: '2026-11-06', status: 'awaiting_approval', labor: 700_00 }),
    rec({ date: '2026-11-06', status: 'approved', labor: 650_00 }),
    rec({ date: '2026-11-07', status: 'objected', labor: 400_00 }),
  ];
  const expenses = [exp('2026-11-01', 1500_00, 'Kira'), exp('2026-11-20', 250_50), exp('2026-10-31', 999_00)];

  it('gerçekleşen ciroya yalnızca tamamlanan kayıtlar girer; ciro = parça + işçilik', () => {
    const r = buildReport(records, NOV, expenses);
    expect(r.revenue).toMatchObject({ count: 3, partsKurus: 3100_00, laborKurus: 1800_00, ciroKurus: 4900_00, vatKurus: 480_00, grandKurus: 5380_00 });
    expect(r.revenue.averageKurus).toBe(Math.round(4900_00 / 3));
  });

  it('onay bekleyen, onaylanıp tamamlanmayan ve itirazlı kayıtlar ayrı gösterilir', () => {
    const r = buildReport(records, NOV, expenses);
    expect(r.awaiting).toEqual({ count: 1, grandKurus: 700_00 });
    expect(r.approvedNotCompleted).toEqual({ count: 1, grandKurus: 650_00 });
    expect(r.objected).toEqual({ count: 1, grandKurus: 400_00 });
  });

  it('tahsilat ödeme tarihine göre; bekleyen tahsilat ve toplam alacak', () => {
    const r = buildReport(records, NOV, expenses);
    expect(r.collected.totalKurus).toBe(3180_00); // 2.880 kart + 300 havale; aralık ödemesi dahil değil
    expect(r.collected.byMethod).toEqual({ cash: 0, card: 2880_00, transfer: 300_00, other: 0 });
    expect(r.periodUnpaidKurus).toBe(1000_00 + 700_00); // c2: 1.500−500, ekim kaydı: 1.000−300
    expect(r.receivableKurus).toBe(1700_00);
  });

  it('gider ve işletme sonucu = ciro − gider', () => {
    const r = buildReport(records, NOV, expenses);
    expect(r.expenses).toEqual({ totalKurus: 1750_50, count: 2 });
    expect(r.netKurus).toBe(4900_00 - 1750_50);
    expect(buildReport([], NOV, [exp('2026-11-05', 100_00)]).netKurus).toBe(-100_00);
  });

  it('aynı servis kaydı iki kez ciroya eklenmez', () => {
    const one = rec({ date: '2026-11-04', labor: 1000_00, id: 'tekrar' });
    const r = buildReport([one, { ...one }, one], NOV);
    expect(r.revenue.count).toBe(1);
    expect(r.revenue.ciroKurus).toBe(1000_00);
    expect(debtors([one, one])[0]!.debtKurus).toBe(1000_00);
  });

  it('en çok değişen parçalar büyük-küçük harf farkı gözetmeden birleşir', () => {
    expect(buildReport(records, NOV).topParts[0]).toEqual({ name: 'Fren balatası', count: 2, totalKurus: 2200_00 });
  });
});

describe('grafik verisi', () => {
  it('günlük seri dönemin her gününü içerir; boş gün 0', () => {
    const rep = buildReport([rec({ date: '2026-11-03', labor: 100_00 })], { kind: 'custom', from: '2026-11-01', to: '2026-11-05', label: '' }, [exp('2026-11-05', 30_00)]);
    const s = dailySeries(rep);
    expect(s.map((p) => p.label)).toEqual(['1', '2', '3', '4', '5']);
    expect(s[2]).toMatchObject({ ciroKurus: 100_00, expenseKurus: 0 });
    expect(s[4]).toMatchObject({ ciroKurus: 0, expenseKurus: 30_00 });
  });
  it('yıllık dönemde aylık toplanır', () => {
    const rep = buildReport([rec({ date: '2026-03-10', labor: 100_00 }), rec({ date: '2026-03-20', labor: 50_00 })], periodOf('year', new Date(2026, 10, 18)));
    const s = dailySeries(rep);
    expect(s).toHaveLength(11);
    expect(s[2]).toMatchObject({ key: '2026-03', label: 'Mar', ciroKurus: 150_00 });
  });
  it('son 6 ay ve geçen ayla karşılaştırma (aynı günlere kadar)', () => {
    const rs = [rec({ date: '2026-11-04', labor: 1000_00 }), rec({ date: '2026-10-04', labor: 600_00 }), rec({ date: '2026-10-25', labor: 900_00 })];
    const ex = [exp('2026-10-10', 100_00)];
    const now = new Date(2026, 10, 18);
    const m = monthlySeries(rs, ex, now);
    expect(m.map((p) => p.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(m[4]).toMatchObject({ ciroKurus: 1500_00, expenseKurus: 100_00 });
    const c = monthCompare(rs, ex, now);
    expect(c.current).toEqual({ label: 'Kasım', ciroKurus: 1000_00, expenseKurus: 0, netKurus: 1000_00 });
    expect(c.previous).toEqual({ label: 'Ekim', ciroKurus: 600_00, expenseKurus: 100_00, netKurus: 500_00 }); // 25 Ekim dahil değil
  });
});

describe('borçlu müşteriler', () => {
  it('yalnızca tamamlanan kayıtların kalan borcu; en çok borçlu önce', () => {
    const list = debtors([
      rec({ date: '2026-11-02', customer: 'c1', labor: 1000_00, payments: [{ amountKurus: 1000_00 }] }),
      rec({ date: '2026-11-03', customer: 'c1', labor: 300_00 }),
      rec({ date: '2026-11-01', customer: 'c1', labor: 200_00, payments: [{ amountKurus: 50_00 }] }),
      rec({ date: '2026-11-04', customer: 'c2', labor: 900_00 }),
      rec({ date: '2026-11-04', customer: 'c2', labor: 900_00, status: 'approved' }),
    ]);
    expect(list.map((d) => [d.customerId, d.debtKurus])).toEqual([['c2', 900_00], ['c1', 450_00]]);
    expect(list[1]!.oldestDate).toBe('2026-11-01');
    expect(list[1]!.records.map((r) => r.balanceKurus)).toEqual([150_00, 300_00]);
  });
  it('eksik ödeme alınan açık kayıt hemen borçlulara geçer; ödemesiz açık kayıt geçmez', () => {
    const list = debtors([
      rec({ date: '2026-11-05', customer: 'c1', labor: 1000_00, status: 'awaiting_approval', payments: [{ amountKurus: 400_00, paidAt: '2026-11-07T10:00:00' }] }),
      rec({ date: '2026-11-05', customer: 'c2', labor: 900_00, status: 'awaiting_approval' }),
      rec({ date: '2026-11-05', customer: 'c2', labor: 500_00, status: 'approved', payments: [{ amountKurus: 500_00 }] }),
      rec({ date: '2026-11-05', customer: 'c2', labor: 700_00, status: 'awaiting_approval', payments: [{ amountKurus: 100_00, voidedAt: '2026-11-06T10:00:00' }] }),
    ]);
    expect(list.map((d) => [d.customerId, d.debtKurus])).toEqual([['c1', 600_00]]);
    expect(list[0]!.records[0]).toMatchObject({ open: true, date: '2026-11-07', balanceKurus: 600_00 });
    expect(countsAsDebt({ status: 'awaiting_approval', payments: [] })).toBe(false);
  });
  it('müşteri borcu', () => {
    const rs = [rec({ date: '2026-11-02', customer: 'c1', labor: 300_00 })];
    expect(customerDebtKurus(rs, 'c1')).toBe(300_00);
    expect(customerDebtKurus(rs, 'c2')).toBe(0);
  });
});

describe('gider girişi', () => {
  it('tarih ve tutar doğrulama', () => {
    expect(parseDateTR('16.11.2026')).toBe('2026-11-16');
    expect(parseDateTR('31.02.2026')).toBeNull();
    expect(toDateTR('2026-11-16')).toBe('16.11.2026');
    expect(validateExpense(100, '2026-11-16', '', '2026-11-16')).toEqual({});
    expect(Object.keys(validateExpense(null, null, 'x'.repeat(201), '2026-11-16')).sort()).toEqual(['amount', 'date', 'description']);
    expect(validateExpense(100, '2026-11-17', '', '2026-11-16').date).toMatch(/İleri/);
    expect(validateExpense(0, '2026-11-16', '', '2026-11-16').amount).toBeDefined();
  });
});

describe('CSV', () => {
  it('Türkçe Excel biçimi: BOM, ";" ayraç, virgüllü tutar, tırnaklı alan, giderler', () => {
    const r = rec({ date: '2026-11-02', labor: 1250_50, payments: [{ amountKurus: 1000_00, note: 'Kalan; haftaya' }] });
    const csv = reportCsv([r], NOV, [exp('2026-11-03', 1500_00, 'Kira')]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('2026-11-02;2026-11-02;34 ABC 123;Ford Focus;Ayşe Yılmaz;+905339998877;Kayıt tamamlandı;Evet;0,00;1250,50;0,00;Yok;0,00;1250,50;1000,00;250,50;Kısmen ödendi');
    expect(csv).toContain('"Kalan; haftaya"');
    expect(csv).toContain('2026-11-03;1500,00;Kira');
  });
});
