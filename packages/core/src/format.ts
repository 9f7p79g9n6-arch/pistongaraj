/**
 * Türkçe sayı biçimleri. Intl desteği platformlar arasında farklı olabildiği için
 * gruplama elle yapılır: binlik ".", ondalık ",".
 */
function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatNumber(value: number, decimals = 0): string {
  const neg = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [i, d] = fixed.split('.') as [string, string | undefined];
  return `${neg ? '-' : ''}${group(i)}${d ? ',' + d : ''}`;
}

export const formatKm = (km: number) => `${formatNumber(Math.round(km))} km`;
export const formatTL = (amount: number, decimals = 2) => `${formatNumber(amount, decimals)} ₺`;

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export function formatDate(iso: string, withYear = true): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}

export function monthShort(key: string): string {
  return MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
}

export function monthLong(key: string): string {
  return MONTHS_LONG[Number(key.slice(5, 7)) - 1] ?? key;
}

/** "1.240 km kaldı · 18 gün kaldı" */
export function describeLeft(kmLeft: number | null, daysLeft: number | null): string {
  const parts: string[] = [];
  if (kmLeft != null) parts.push(kmLeft < 0 ? `${formatNumber(-kmLeft)} km geçti` : `${formatNumber(kmLeft)} km kaldı`);
  if (daysLeft != null) {
    if (daysLeft < 0) parts.push(`${formatNumber(-daysLeft)} gün gecikti`);
    else if (daysLeft === 0) parts.push('bugün');
    else parts.push(`${formatNumber(daysLeft)} gün kaldı`);
  }
  return parts.join(' · ') || 'Son yapılma bilgisi eksik';
}
