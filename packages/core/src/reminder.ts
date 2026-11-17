/**
 * Borç hatırlatma mesajı: işletme bir kez şablon yazar; her müşteri için {ad}, {tutar}, {detay}, {isletme}
 * alanları o müşterinin bilgisiyle doldurulur.
 */
import type { Debtor } from './accounting';
import { formatDate } from './format';
import { formatKurus } from './service';

export const REMINDER_FIELDS = [
  { key: '{ad}', label: 'Müşteri adı' },
  { key: '{tutar}', label: 'Toplam borç' },
  { key: '{detay}', label: 'Kayıt listesi' },
  { key: '{isletme}', label: 'İşletme adı' },
] as const;

export const DEFAULT_REMINDER_TEMPLATE = [
  'Merhaba {ad}, {isletme} olarak hatırlatma:',
  '',
  '{detay}',
  '',
  'Toplam kalan: {tutar}',
  'Uygun olduğunuzda ödemenizi rica ederiz. Teşekkür ederiz.',
].join('\n');

/** Kayıt satırları: "• 16 Kas 2026 · 34 ABC 123: 1.880,00 ₺" */
export function reminderDetail(d: Pick<Debtor, 'records'>): string {
  return d.records.map((r) => `• ${formatDate(r.date)} · ${r.plate}: ${formatKurus(r.balanceKurus)}`).join('\n');
}

export function fillReminder(template: string, d: Pick<Debtor, 'customerName' | 'debtKurus' | 'records'>, businessName: string): string {
  const vars: Record<string, string> = {
    '{ad}': d.customerName.trim(),
    '{tutar}': formatKurus(d.debtKurus),
    '{detay}': reminderDetail(d),
    '{isletme}': businessName.trim() || 'servisimiz',
  };
  return template.replace(/\{(ad|tutar|detay|isletme)\}/gi, (m) => vars[m.toLowerCase()] ?? m).trim();
}

/** Şablonda müşteriye özel bilgi yoksa uyarı (hepsine aynı mesaj gider) */
export function reminderTemplateWarning(template: string): string | null {
  if (template.trim().length < 10) return 'Mesaj çok kısa.';
  if (!/\{(ad|tutar|detay)\}/i.test(template)) return 'Mesajda {ad}, {tutar} ya da {detay} yok; her müşteriye aynı metin gider.';
  return null;
}
