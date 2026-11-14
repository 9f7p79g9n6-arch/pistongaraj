import { formatNumber } from './format';

/**
 * Şasi numarası (VIN, ISO 3779): 17 karakter, I/O/Q harfleri kullanılmaz.
 * Kontrol basamağı (9. karakter) yalnızca Kuzey Amerika araçlarında zorunlu olduğu için
 * Avrupa/Türkiye araçlarında doğrulama ölçütü olarak kullanılmaz.
 */
export function normalizeVin(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function validateVin(raw: string): string | null {
  const vin = normalizeVin(raw);
  if (vin.length === 0) return null;
  if (vin.length !== 17) return 'Şasi numarası 17 karakter olmalı.';
  if (/[IOQ]/.test(vin)) return 'Şasi numarasında I, O ve Q harfleri bulunmaz. 1 ve 0 rakamlarını kontrol et.';
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return 'Şasi numarası yalnızca harf ve rakam içerir.';
  return null;
}

/** Ekranda gösterim için: ilk 3 (üretici kodu) ve son 4 karakter açık. */
export function maskVin(raw: string): string {
  const vin = normalizeVin(raw);
  if (vin.length < 8) return '•'.repeat(vin.length);
  return `${vin.slice(0, 3)}${'•'.repeat(vin.length - 7)}${vin.slice(-4)}`;
}

/**
 * Türkiye plakası: il kodu (01-81) + 1-3 harf + 2-4 rakam. Ç, Ğ, İ, Ö, Ş, Ü ve Q, W, X kullanılmaz.
 * Biçim kontrolü yalnızca yazım hatasını yakalamak içindir; plakanın gerçekliği doğrulanmaz.
 */
// Türkçe klavyede küçük "i" yazılınca tr-TR büyük harfi "İ" olur ve plaka biçimine uymaz;
// plakada Türkçe harf bulunmadığı için önce Latin karşılıklarına çevrilir.
function plateUpper(raw: string): string {
  return raw.replace(/i/g, 'I').replace(/ı/g, 'I').toUpperCase();
}

export function normalizePlate(raw: string): string {
  const compact = plateUpper(raw).replace(/\s+/g, '');
  const m = /^(\d{2})([A-Z]{1,3})(\d{2,4})$/.exec(compact);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : plateUpper(raw.trim());
}

export function validatePlate(raw: string): string | null {
  const compact = plateUpper(raw).replace(/\s+/g, '');
  if (compact.length === 0) return null;
  const m = /^(\d{2})([A-Z]{1,3})(\d{2,4})$/.exec(compact);
  if (!m) return /[ÇĞÖŞÜçğöşü]/.test(raw) ? 'Plakalarda Ç, Ğ, Ö, Ş, Ü harfleri kullanılmaz.' : 'Plaka biçimi 34 ABC 123 gibi olmalı.';
  const il = Number(m[1]);
  if (il < 1 || il > 81) return 'İl kodu 01 ile 81 arasında olmalı.';
  if (/[QWX]/.test(m[2]!)) return 'Plakalarda Q, W ve X harfleri kullanılmaz.';
  return null;
}

export interface OdometerCheck {
  error: string | null;
  /** Kayıt mümkün ama kullanıcıdan onay istenmeli */
  warning: string | null;
}

/** Kilometre geriye gidemez; olağan dışı büyük sıçramada onay istenir. */
export function checkOdometerUpdate(current: number, next: number | null): OdometerCheck {
  if (next == null || !Number.isFinite(next) || next < 0) return { error: 'Kilometreyi rakamla gir.', warning: null };
  if (next > 2_000_000) return { error: 'Kilometre 2.000.000 değerini geçemez.', warning: null };
  if (next < current)
    return { error: `Yeni değer son kayıttan (${formatNumber(current)} km) küçük olamaz.`, warning: null };
  if (next - current > 20_000)
    return { error: null, warning: `Son kayıttan ${formatNumber(next - current)} km fazla. Doğru mu?` };
  return { error: null, warning: null };
}

export function validateModelYear(year: number | null, now: Date = new Date()): string | null {
  const max = now.getFullYear() + 1;
  if (year == null || !Number.isInteger(year) || year < 1950 || year > max) return `Model yılı 1950 ile ${max} arasında olmalı.`;
  return null;
}

/**
 * Kullanıcının yazdığı sayıyı çözer. Türkçe biçimi destekler: "148.760" = 148760, "45,3" = 45.3.
 * Hem nokta hem virgül varsa nokta binlik, virgül ondalık kabul edilir.
 */
export function parseNumberTR(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!s) return null;
  let norm: string;
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, '');
  else norm = s;
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}
