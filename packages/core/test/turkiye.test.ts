import { describe, expect, it } from 'vitest';
import { ACCIDENT_PHOTOS, ACCIDENT_STEPS, fineInfo, INSPECTION_CHECKLIST, sortFines, validateFine } from '../src';

describe('trafik cezası', () => {
  const f = (notifiedOn: string, paidOn: string | null = null) => ({ notifiedOn, amount: 2000, paidOn });

  it('tebliğden itibaren 15 gün %25 indirim', () => {
    const i = fineInfo(f('2026-11-01'), '2026-11-14');
    expect(i.status).toBe('discount');
    expect(i.discountUntil).toBe('2026-11-16');
    expect(i.daysLeftForDiscount).toBe(2);
    expect(i.discountedAmount).toBe(1500);
    expect(i.dueOn).toBe('2026-12-01');
  });

  it('son gün hâlâ indirimli', () => {
    expect(fineInfo(f('2026-11-01'), '2026-11-16')).toMatchObject({ status: 'discount', daysLeftForDiscount: 0 });
  });

  it('15 gün geçince indirim biter, bir ay dolunca süre geçer', () => {
    expect(fineInfo(f('2026-11-01'), '2026-11-17').status).toBe('due');
    expect(fineInfo(f('2026-11-01'), '2026-12-01').status).toBe('due');
    expect(fineInfo(f('2026-11-01'), '2026-12-02').status).toBe('overdue');
  });

  it('ay sonu: 31 Ocak tebliğ → son gün 28 Şubat', () => {
    expect(fineInfo(f('2026-01-31'), '2026-02-01').dueOn).toBe('2026-02-28');
  });

  it('ödenen ceza', () => {
    expect(fineInfo(f('2026-11-01', '2026-11-05'), '2026-12-30').status).toBe('paid');
  });

  it('doğrulama', () => {
    expect(validateFine({ fineDate: '2026-11-10', notifiedOn: '2026-11-05', amount: 100 }, '2026-11-14')).toContain('Tebliğ tarihi ceza tarihinden önce olamaz.');
    expect(validateFine({ fineDate: '2026-11-10', notifiedOn: '2026-11-20', amount: 100 }, '2026-11-14')).toContain('Tebliğ tarihi ileri bir tarih olamaz.');
    expect(validateFine({ fineDate: null, notifiedOn: null, amount: 0 }, '2026-11-14')).toHaveLength(3);
    expect(validateFine({ fineDate: '2026-11-01', notifiedOn: '2026-11-03', amount: 993 }, '2026-11-14')).toEqual([]);
  });

  it('en acil ceza önce', () => {
    const list = [f('2026-11-10'), f('2026-09-01'), f('2026-11-01', '2026-11-02'), f('2026-11-02')];
    expect(sortFines(list, '2026-11-14').map((x) => x.notifiedOn)).toEqual(['2026-09-01', '2026-11-02', '2026-11-10', '2026-11-01']);
  });
});

describe('muayene ve kaza içerikleri', () => {
  it('kimlikler benzersiz, metinler dolu', () => {
    const ids = INSPECTION_CHECKLIST.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of INSPECTION_CHECKLIST) expect(i.how.length).toBeGreaterThan(10);
    expect(new Set(ACCIDENT_PHOTOS.map((p) => p.id)).size).toBe(ACCIDENT_PHOTOS.length);
    expect(ACCIDENT_STEPS[0]!.title).toBe('Önce güvenlik');
  });
});
