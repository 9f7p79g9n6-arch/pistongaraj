import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDER_TEMPLATE, fillReminder, reminderTemplateWarning } from '../src/reminder';

const d = {
  customerName: 'Ayşe Yılmaz',
  debtKurus: 188000,
  records: [
    { id: 'r1', plate: '34 ABC 123', date: '2026-11-16', balanceKurus: 100000, open: false },
    { id: 'r2', plate: '34 ABC 123', date: '2026-11-17', balanceKurus: 88000, open: false },
  ],
};

describe('borç hatırlatma şablonu', () => {
  it('her müşterinin adı, tutarı ve kayıtları doldurulur', () => {
    const m = fillReminder(DEFAULT_REMINDER_TEMPLATE, d, 'Yıldız Oto');
    expect(m).toContain('Merhaba Ayşe Yılmaz, Yıldız Oto olarak');
    expect(m).toContain('Toplam kalan: 1.880,00');
    expect(m).toContain('34 ABC 123: 1.000,00');
    expect(m).toContain('34 ABC 123: 880,00');
    expect(m).not.toMatch(/\{(ad|tutar|detay|isletme)\}/);
  });
  it('büyük harfle yazılan alan da dolar; işletme adı yoksa "servisimiz"', () => {
    expect(fillReminder('Sayın {AD}, borç {Tutar} — {isletme}', d, '  ')).toBe('Sayın Ayşe Yılmaz, borç 1.880,00 ₺ — servisimiz');
  });
  it('müşteriye özel alan yoksa uyarır', () => {
    expect(reminderTemplateWarning('Merhaba, ödemenizi bekliyoruz.')).toMatch(/aynı metin/);
    expect(reminderTemplateWarning(DEFAULT_REMINDER_TEMPLATE)).toBeNull();
    expect(reminderTemplateWarning('kısa')).toMatch(/kısa/);
  });
});
