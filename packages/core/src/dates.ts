/**
 * Tarih yardımcıları. Tüm tarihler takvim günü olarak "YYYY-MM-DD" biçiminde tutulur;
 * saat dilimi kaymalarını önlemek için hesaplar UTC üzerinden yapılır.
 */
export type ISODate = string;

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUTC(date: ISODate): number {
  if (!isISODate(date)) throw new Error(`Geçersiz tarih: ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** b - a, gün cinsinden. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/**
 * Ay ekler; hedef ayda gün yoksa ayın son gününe sabitlenir (31 Ocak + 1 ay = 28/29 Şubat).
 * PostgreSQL'in `date + interval 'n months'` davranışıyla aynıdır.
 */
export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fromUTC(Date.UTC(ny, nm, Math.min(d, lastDay)));
}

export function todayISO(now: Date = new Date()): ISODate {
  // Kullanıcının yerel takvim günü
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "2026-11" gibi ay anahtarı */
export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

/** Son `count` ayın anahtarları, eskiden yeniye. */
export function lastMonthKeys(today: ISODate, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) keys.push(monthKey(addMonths(`${today.slice(0, 7)}-01`, -i)));
  return keys;
}

/** "14.11.2026" → "2026-11-14". Geçersizse null. */
export function parseDateTR(raw: string): ISODate | null {
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isISODate(iso) ? iso : null;
}

/** "2026-11-14" → "14.11.2026" */
export function toDateTR(iso: ISODate | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
