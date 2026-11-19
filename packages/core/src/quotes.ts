/**
 * Servis rehberi, teklif talepleri (servis ve parça) ve onaylı yorumlar.
 * Araç sahibi talep açar; OTOM SERVİS'teki doğrulanmış işletmeler teklif verir. Ödeme uygulama dışında yapılır.
 * Kurallar sunucuda da aynen uygulanır (supabase/migrations/*_rehber_teklif.sql).
 */
import type { BusinessCategory } from './service';

export type QuoteKind = 'service' | 'part';
export type QuoteStatus = 'open' | 'accepted' | 'closed';
export type PartCondition = 'original' | 'equivalent' | 'used';

export const QUOTE_KIND_LABEL: Record<QuoteKind, string> = { service: 'Servis', part: 'Parça' };
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = { open: 'Teklif bekleniyor', accepted: 'Teklif kabul edildi', closed: 'Kapatıldı' };
export const PART_CONDITION_LABEL: Record<PartCondition, string> = { original: 'Orijinal', equivalent: 'Muadil (yan sanayi)', used: 'Çıkma' };

/** Rehberde ve talepte seçilebilen servis kategorileri (parça talebi her zaman "Yedek parça"ya gider) */
export const SERVICE_DIRECTORY_CATEGORIES: BusinessCategory[] = ['private_service', 'mechanic', 'auto_electric', 'body_paint', 'tire', 'auto_ac', 'tuning', 'appraisal'];

export const QUOTE_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  descriptionMax: 1500,
  partNameMax: 120,
  noteMax: 500,
  etaMax: 60,
  maxTargets: 20,
  maxPickedBusinesses: 5,
  reviewCommentMax: 500,
} as const;

export interface PublicBusiness {
  id: string;
  name: string;
  category: BusinessCategory;
  city: string;
  district: string;
  address: string;
  phone: string;
  description: string | null;
  workingHours: string | null;
  /** İşletme fotoğrafının dosya yolu (herkese açık klasör) */
  logoPath: string | null;
  ratingAvg: number | null;
  ratingCount: number;
}

export interface BusinessReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface QuoteOffer {
  id: string;
  requestId: string;
  businessId: string;
  businessName: string;
  businessCity: string;
  /** Talep sahibine her zaman görünür; işletme teklif verdiyse müşteri arayabilir */
  businessPhone: string;
  partsKurus: number;
  laborKurus: number;
  totalKurus: number;
  partCondition: PartCondition | null;
  eta: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteRequest {
  id: string;
  kind: QuoteKind;
  category: BusinessCategory;
  city: string;
  vehicleLabel: string;
  title: string;
  description: string | null;
  partName: string | null;
  status: QuoteStatus;
  acceptedOfferId: string | null;
  targetCount: number;
  createdAt: string;
  offers: QuoteOffer[];
}

/** İşletmenin gördüğü talep: talep sahibinin iletişim bilgisi yalnızca kendi teklifi kabul edilince görünür */
export interface IncomingQuoteRequest extends Omit<QuoteRequest, 'offers' | 'targetCount'> {
  myOffer: QuoteOffer | null;
  /** Kendi teklifi kabul edildiyse talep sahibinin telefonu (profilinde varsa) */
  customerPhone: string | null;
  acceptedMine: boolean;
  seen: boolean;
}

export function validateQuoteRequest(r: { kind: string; title: string; description: string; partName: string; city: string; vehicleLabel: string }): string | null {
  if (r.kind !== 'service' && r.kind !== 'part') return 'Talep türü seç.';
  if (r.vehicleLabel.trim().length < 2) return 'Aracını seç.';
  if (r.city.trim().length < 2) return 'Şehir yaz.';
  const title = r.title.trim();
  if (title.length < QUOTE_LIMITS.titleMin) return r.kind === 'part' ? 'Hangi parçayı aradığını yaz.' : 'Sorunu ya da istediğin işi kısaca yaz.';
  if (title.length > QUOTE_LIMITS.titleMax) return `Başlık en fazla ${QUOTE_LIMITS.titleMax} karakter olabilir.`;
  if (r.description.trim().length > QUOTE_LIMITS.descriptionMax) return `Açıklama en fazla ${QUOTE_LIMITS.descriptionMax} karakter olabilir.`;
  if (r.partName.trim().length > QUOTE_LIMITS.partNameMax) return 'Parça adı çok uzun.';
  return null;
}

export function validateQuoteOffer(o: { kind: QuoteKind; partsKurus: number | null; laborKurus: number | null; partCondition: string | null; note: string; eta: string }): string | null {
  const parts = o.partsKurus ?? 0;
  const labor = o.laborKurus ?? 0;
  if (parts < 0 || labor < 0 || !Number.isInteger(parts) || !Number.isInteger(labor)) return 'Tutarları doğru yaz.';
  if (parts + labor <= 0) return 'Parça ya da işçilik tutarı yaz.';
  if (parts + labor > 100_000_000_00) return 'Tutar çok büyük.';
  if (o.kind === 'part' && !o.partCondition) return 'Parçanın orijinal, muadil ya da çıkma olduğunu seç.';
  if (o.note.trim().length > QUOTE_LIMITS.noteMax) return `Not en fazla ${QUOTE_LIMITS.noteMax} karakter olabilir.`;
  if (o.eta.trim().length > QUOTE_LIMITS.etaMax) return 'Süre çok uzun yazıldı.';
  return null;
}

export function validateReview(r: { rating: number; comment: string }): string | null {
  if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5) return '1 ile 5 arasında puan ver.';
  if (r.comment.trim().length > QUOTE_LIMITS.reviewCommentMax) return `Yorum en fazla ${QUOTE_LIMITS.reviewCommentMax} karakter olabilir.`;
  return null;
}

/** En uygun teklif önce; eşitse önce gelen */
export function sortOffers(offers: readonly QuoteOffer[]): QuoteOffer[] {
  return [...offers].sort((a, b) => a.totalKurus - b.totalKurus || a.createdAt.localeCompare(b.createdAt));
}

/** "4,6 (12)" ya da "Henüz yorum yok" */
export function ratingText(avg: number | null, count: number): string {
  if (!count || avg == null) return 'Henüz yorum yok';
  return `${avg.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${count})`;
}

/** Harita uygulamasında adres araması (konum paylaşılmaz, yalnızca işletmenin adresi aranır) */
export function mapsSearchUrl(b: Pick<PublicBusiness, 'name' | 'address' | 'district' | 'city'>): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name}, ${b.address}, ${b.district}/${b.city}`)}`;
}
