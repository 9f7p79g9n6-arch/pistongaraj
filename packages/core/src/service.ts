/**
 * PISTON SERVİS iş kuralları: işletme, müşteri, servis kaydı, tutar hesabı ve kayıt durumları.
 * Tutarlar kuruş cinsinden tam sayıdır; ondalık hatası olmaz. Sunucudaki tetikleyici aynı hesabı yapar
 * (supabase/migrations/20261116000001_piston_servis.sql → private.service_totals).
 */
import { formatNumber } from './format';

// ---------------------------------------------------------------------------
// Türler
// ---------------------------------------------------------------------------

export type BusinessCategory =
  | 'private_service'
  | 'mechanic'
  | 'auto_electric'
  | 'body_paint'
  | 'tire'
  | 'auto_ac'
  | 'spare_parts'
  | 'appraisal'
  | 'other';

export const BUSINESS_CATEGORIES: { value: BusinessCategory; label: string }[] = [
  { value: 'private_service', label: 'Özel oto servis' },
  { value: 'mechanic', label: 'Mekanik servis' },
  { value: 'auto_electric', label: 'Oto elektrik' },
  { value: 'body_paint', label: 'Kaporta ve boya' },
  { value: 'tire', label: 'Lastikçi' },
  { value: 'auto_ac', label: 'Oto klima' },
  { value: 'spare_parts', label: 'Yedek parça' },
  { value: 'appraisal', label: 'Ekspertiz' },
  { value: 'other', label: 'Diğer' },
];

export type BusinessStatus = 'incomplete' | 'pending_verification' | 'active' | 'suspended';

export const BUSINESS_STATUS_LABEL: Record<BusinessStatus, string> = {
  incomplete: 'Başvuru tamamlanmadı',
  pending_verification: 'Doğrulama bekliyor',
  active: 'Aktif',
  suspended: 'Askıya alındı',
};

export type BusinessRole = 'owner' | 'manager' | 'technician' | 'front_desk';

export type BusinessPermission =
  | 'business.manage'
  | 'member.manage'
  | 'customer.manage'
  | 'record.view'
  | 'record.create'
  | 'record.edit'
  | 'record.complete';

/** Rol → izin tablosu. Sunucudaki private.role_permissions ile aynı olmalı (test kontrol eder). */
export const ROLE_PERMISSIONS: Record<BusinessRole, BusinessPermission[]> = {
  owner: ['business.manage', 'member.manage', 'customer.manage', 'record.view', 'record.create', 'record.edit', 'record.complete'],
  manager: ['customer.manage', 'record.view', 'record.create', 'record.edit', 'record.complete'],
  technician: ['record.view', 'record.create', 'record.edit'],
  front_desk: ['customer.manage', 'record.view', 'record.create'],
};

export function hasPermission(role: BusinessRole, perm: BusinessPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}

export interface Business {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string | null;
  city: string;
  district: string;
  address: string;
  category: BusinessCategory;
  taxOffice: string | null;
  taxNumber: string | null;
  logoUrl: string | null;
  status: BusinessStatus;
  role: BusinessRole;
  createdAt: string;
}

export interface BusinessCustomer {
  id: string;
  businessId: string;
  fullName: string;
  phone: string;
  email: string | null;
  createdAt: string;
}

export interface BusinessVehicle {
  id: string;
  businessId: string;
  customerId: string | null;
  plate: string;
  make: string;
  model: string;
  modelYear: number | null;
  engineLabel: string | null;
  lastOdometerKm: number | null;
  createdAt: string;
}

export type ServiceRecordStatus = 'awaiting_approval' | 'approved' | 'objected' | 'revised' | 'completed';

export const SERVICE_STATUS_LABEL: Record<ServiceRecordStatus, string> = {
  awaiting_approval: 'Müşteri onayı bekliyor',
  approved: 'Müşteri onayladı',
  objected: 'Müşteri itiraz etti',
  revised: 'Düzeltme gönderildi',
  completed: 'Kayıt tamamlandı',
};

export type FuelLevel = 'empty' | 'quarter' | 'half' | 'three_quarters' | 'full';

export const FUEL_LEVEL_LABEL: Record<FuelLevel, string> = {
  empty: 'Boş',
  quarter: '1/4',
  half: '1/2',
  three_quarters: '3/4',
  full: 'Dolu',
};

export interface ServiceItemInput {
  title: string;
  description: string | null;
  partName: string | null;
  partQty: number;
  /** Parça birim fiyatı, kuruş */
  partUnitKurus: number;
  /** İşçilik, kuruş */
  laborKurus: number;
  /** İndirim, kuruş (kalemin parça + işçilik toplamını geçemez) */
  discountKurus: number;
}

export interface ServiceItem extends ServiceItemInput {
  id: string;
}

export type ServiceFileKind = 'intake' | 'replaced_part' | 'work' | 'document';

export const SERVICE_FILE_KIND_LABEL: Record<ServiceFileKind, string> = {
  intake: 'Araç kabul',
  replaced_part: 'Değişen parça',
  work: 'Yapılan işlem',
  document: 'Belge',
};

export interface ServiceFile {
  id: string;
  kind: ServiceFileKind;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ServiceTotals {
  partsKurus: number;
  laborKurus: number;
  subtotalKurus: number;
  discountKurus: number;
  netKurus: number;
  /** null: KDV uygulanmıyor */
  vatRate: number | null;
  vatKurus: number;
  grandKurus: number;
}

export interface ServiceResponse {
  id: string;
  version: number;
  action: 'approved' | 'objected';
  reason: string | null;
  via: 'app' | 'link';
  at: string;
}

export interface ServiceStatusChange {
  status: ServiceRecordStatus;
  at: string;
  by: 'business' | 'customer';
}

export interface ServiceRecord {
  id: string;
  businessId: string;
  businessName: string;
  businessVerified: boolean;
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicleId: string;
  plate: string;
  vehicleLabel: string;
  status: ServiceRecordStatus;
  approvalVersion: number;
  intakeAt: string;
  odometerKm: number;
  complaint: string;
  initialNote: string | null;
  fuelLevel: FuelLevel | null;
  existingDamage: string | null;
  items: ServiceItem[];
  files: ServiceFile[];
  totals: ServiceTotals;
  responses: ServiceResponse[];
  history: ServiceStatusChange[];
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  /** Yalnızca demo verisinde true; ekranda "örnek" etiketi gösterilir */
  isSample?: boolean;
}

// ---------------------------------------------------------------------------
// Tutar hesabı
// ---------------------------------------------------------------------------

export const DEFAULT_VAT_RATE = 20;
export const VAT_RATES = [20, 10, 1] as const;

export function itemGrossKurus(i: Pick<ServiceItemInput, 'partQty' | 'partUnitKurus' | 'laborKurus'>): number {
  return i.partQty * i.partUnitKurus + i.laborKurus;
}

/**
 * Parça ve işçilik ayrı toplanır. İndirim KDV'den önce düşülür.
 * KDV = round(net × oran / 100); yarım kuruş yukarı yuvarlanır (tutarlar negatif olamaz).
 */
export function computeServiceTotals(items: readonly Pick<ServiceItemInput, 'partQty' | 'partUnitKurus' | 'laborKurus' | 'discountKurus'>[], vatRate: number | null): ServiceTotals {
  let parts = 0;
  let labor = 0;
  let discount = 0;
  for (const i of items) {
    parts += i.partQty * i.partUnitKurus;
    labor += i.laborKurus;
    discount += Math.min(i.discountKurus, itemGrossKurus(i));
  }
  const subtotal = parts + labor;
  const net = subtotal - discount;
  const vat = vatRate == null ? 0 : Math.round((net * vatRate) / 100);
  return {
    partsKurus: parts,
    laborKurus: labor,
    subtotalKurus: subtotal,
    discountKurus: discount,
    netKurus: net,
    vatRate,
    vatKurus: vat,
    grandKurus: net + vat,
  };
}

/** "1.250,50" gibi Türkçe tutarı kuruşa çevirir. Geçersizse null. */
export function parseKurus(raw: string): number | null {
  const s = raw.trim().replace(/\s|₺|TL/gi, '');
  if (!s) return 0;
  let norm: string;
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, '');
  else norm = s;
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  const [whole, frac = ''] = norm.split('.') as [string, string?];
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function formatKurus(kurus: number): string {
  return `${formatNumber(kurus / 100, 2)} ₺`;
}

// ---------------------------------------------------------------------------
// Telefon
// ---------------------------------------------------------------------------

/**
 * Türkiye telefonu: "0532 123 45 67", "5321234567", "+90 532 ..." → "+905321234567".
 * Sabit hat (2xx, 3xx, 4xx) ve cep (5xx) kabul edilir. Geçersizse null.
 */
export function normalizePhoneTR(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+90')) d = d.slice(3);
  else if (d.startsWith('0090')) d = d.slice(4);
  else if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!/^[2-5]\d{9}$/.test(d)) return null;
  return `+90${d}`;
}

export function validatePhoneTR(raw: string): string | null {
  if (!raw.trim()) return 'Telefon numarası gerekli.';
  return normalizePhoneTR(raw) ? null : 'Telefonu 0532 123 45 67 biçiminde yaz.';
}

/** "+905321234567" → "0532 123 45 67" */
export function formatPhoneTR(e164: string): string {
  const d = e164.replace(/^\+90/, '');
  if (d.length !== 10) return e164;
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

// ---------------------------------------------------------------------------
// E-posta
// ---------------------------------------------------------------------------

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (!e) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120 ? e : null;
}

// ---------------------------------------------------------------------------
// Kayıt durumları
// ---------------------------------------------------------------------------

export type ServiceActor = 'business' | 'customer';
export type ServiceEvent = 'edit' | 'approve' | 'object' | 'complete';

/**
 * Bir olayın kaydı hangi duruma götüreceği. null: bu olay bu durumda yapılamaz.
 * - Müşteri yalnızca onay bekleyen ya da düzeltilmiş kaydı onaylar veya itiraz eder.
 * - İşletmenin düzenlemesi, onay bekleyen kaydı aynı durumda bırakır; onaylanmış ya da itiraz edilmiş kaydı
 *   "düzeltme gönderildi" durumuna alır ve yeniden onay ister.
 * - Kayıt yalnızca müşteri onayından sonra tamamlanır. Tamamlanan kayıt değiştirilemez.
 */
export function nextServiceStatus(current: ServiceRecordStatus, event: ServiceEvent): ServiceRecordStatus | null {
  switch (event) {
    case 'approve':
      return current === 'awaiting_approval' || current === 'revised' ? 'approved' : null;
    case 'object':
      return current === 'awaiting_approval' || current === 'revised' ? 'objected' : null;
    case 'edit':
      if (current === 'awaiting_approval' || current === 'revised') return current;
      if (current === 'approved' || current === 'objected') return 'revised';
      return null;
    case 'complete':
      return current === 'approved' ? 'completed' : null;
  }
}

export function needsCustomerAction(status: ServiceRecordStatus): boolean {
  return status === 'awaiting_approval' || status === 'revised';
}

// ---------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------

export interface BusinessInput {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  address: string;
  category: BusinessCategory | null;
  taxOffice: string;
  taxNumber: string;
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

function len(v: string, min: number, max: number, label: string): string | undefined {
  const t = v.trim();
  if (t.length < min) return min <= 1 ? `${label} gerekli.` : `${label} en az ${min} karakter olmalı.`;
  if (t.length > max) return `${label} en fazla ${max} karakter olabilir.`;
  return undefined;
}

/** Vergi kimlik no 10 hane (tüzel), TC kimlik no 11 hane (şahıs). İsteğe bağlı. */
export function validateTaxNumber(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return /^\d{10,11}$/.test(t) ? null : 'Vergi numarası 10, TC kimlik numarası 11 haneli olmalı.';
}

export function validateBusiness(b: BusinessInput): FieldErrors<keyof BusinessInput> {
  const e: FieldErrors<keyof BusinessInput> = {};
  e.name = len(b.name, 2, 80, 'İşletme adı');
  e.contactName = len(b.contactName, 3, 60, 'Yetkili adı soyadı');
  e.phone = validatePhoneTR(b.phone) ?? undefined;
  if (b.email.trim() && !normalizeEmail(b.email)) e.email = 'E-posta adresini kontrol et.';
  e.city = len(b.city, 2, 40, 'Şehir');
  e.district = len(b.district, 2, 40, 'İlçe');
  e.address = len(b.address, 5, 240, 'Açık adres');
  if (!b.category) e.category = 'İşletme kategorisini seç.';
  if (b.taxOffice.trim().length > 60) e.taxOffice = 'Vergi dairesi en fazla 60 karakter olabilir.';
  e.taxNumber = validateTaxNumber(b.taxNumber) ?? undefined;
  return clean(e);
}

export interface CustomerInput {
  fullName: string;
  phone: string;
  email: string;
}

export function validateCustomer(c: CustomerInput): FieldErrors<keyof CustomerInput> {
  const e: FieldErrors<keyof CustomerInput> = {};
  e.fullName = len(c.fullName, 3, 80, 'Müşteri adı soyadı');
  e.phone = validatePhoneTR(c.phone) ?? undefined;
  if (c.email.trim() && !normalizeEmail(c.email)) e.email = 'E-posta adresini kontrol et.';
  return clean(e);
}

export function validateServiceItem(i: ServiceItemInput): string | null {
  const t = i.title.trim();
  if (t.length < 2) return 'İşlem adı gerekli.';
  if (t.length > 120) return 'İşlem adı en fazla 120 karakter olabilir.';
  if ((i.description ?? '').length > 500) return 'Açıklama en fazla 500 karakter olabilir.';
  if ((i.partName ?? '').length > 120) return 'Parça adı en fazla 120 karakter olabilir.';
  if (!Number.isInteger(i.partQty) || i.partQty < 0 || i.partQty > 999) return 'Parça adedi 0 ile 999 arasında olmalı.';
  if (i.partQty > 0 && !(i.partName ?? '').trim()) return 'Parça adedi girildiyse parça adını da yaz.';
  for (const v of [i.partUnitKurus, i.laborKurus, i.discountKurus])
    if (!Number.isInteger(v) || v < 0 || v > 100_000_000) return 'Tutarlar 0 ile 1.000.000 ₺ arasında olmalı.';
  if (i.discountKurus > itemGrossKurus(i)) return 'İndirim, parça ve işçilik toplamından büyük olamaz.';
  return null;
}

function clean<T extends Record<string, string | undefined>>(e: T): T {
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  return e;
}
