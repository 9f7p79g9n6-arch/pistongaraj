/**
 * Rehber, teklif talepleri (servis + parça), yorumlar ve yönetici işlemleri için veri katmanı.
 * Gerçek sürümde Supabase RPC'leri kullanılır. Demo sürümde bu bölümler sunucu gerektirdiği için boş görünür.
 * Kurallar: packages/core/src/quotes.ts ve supabase/migrations/20261123000001_rehber_teklif.sql.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BusinessCategory,
  BusinessReview,
  BusinessStatus,
  IncomingQuoteRequest,
  PartCondition,
  PublicBusiness,
  QuoteKind,
  QuoteOffer,
  QuoteRequest,
} from '@piston/core';

import { env } from '@/lib/env';
import { RepoError } from './repo';
import { repo } from './store';
import type { SupabaseRepo } from './supabase-repo';

type Row = Record<string, any>;

/** Herkese açık işletme fotoğrafı adresi */
export function businessPhotoUrl(path: string | null | undefined): string | null {
  return path && env.supabaseUrl ? `${env.supabaseUrl}/storage/v1/object/public/business-photos/${path}` : null;
}

export interface NewQuoteRequest {
  kind: QuoteKind;
  category: BusinessCategory;
  city: string;
  vehicleLabel: string;
  title: string;
  description: string;
  partName: string;
  /** Rehberden seçilen işletmeler (en fazla 5). Boşsa şehirdeki ilgili kategorideki doğrulanmış işletmelere gider. */
  businessIds: string[];
  clientRequestId: string;
}

export interface NewQuoteOffer {
  businessId: string;
  requestId: string;
  partsKurus: number;
  laborKurus: number;
  partCondition: PartCondition | null;
  eta: string;
  note: string;
}

export interface AdminBusiness {
  id: string; name: string; category: BusinessCategory; city: string; district: string; address: string; phone: string;
  email: string | null; contactName: string; taxOffice: string | null; taxNumber: string | null; status: BusinessStatus;
  createdAt: string; recordCount: number;
}

export interface AdminReport {
  postId: string | null; commentId: string | null; businessName: string; text: string; deleted: boolean;
  reportCount: number; lastReportAt: string; reasons: string[];
}

const MESSAGES: Record<string, string> = {
  FORBIDDEN: 'Bu işlem için yetkin yok.',
  NOT_FOUND: 'Bulunamadı. Silinmiş ya da artık görünmüyor olabilir.',
  NO_BUSINESS: 'Bu şehirde bu alanda doğrulanmış işletme henüz yok. Rehberden başka bir işletme seçebilir ya da şehri değiştirebilirsin.',
  TOO_MANY_TARGETS: 'En fazla 5 işletme seçebilirsin.',
  RATE_LIMIT: 'Bugün çok fazla talep açtın. Yarın tekrar dene.',
  STATUS_INVALID: 'Bu talep artık açık değil.',
  PART_CONDITION_REQUIRED: 'Parçanın orijinal, muadil ya da çıkma olduğunu seç.',
  NOT_COMPLETED: 'Yalnızca tamamlanan servis kayıtları değerlendirilebilir.',
  RATING_INVALID: '1 ile 5 arasında puan ver.',
  DEMO: 'Bu bölüm sunucu bağlantısı gerektirir; demo sürümde kullanılamaz.',
};

function fail(err: { message?: string; code?: string } | null): never {
  const msg = err?.message ?? '';
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (code) throw new RepoError(code, MESSAGES[code]!);
  if (err?.code === '23514' || msg.includes('check constraint')) throw new RepoError('INVALID', 'Girilen bilgilerden biri geçersiz. Kontrol et.');
  if (msg.includes('Failed to fetch') || msg.includes('Network request failed')) throw new RepoError('NETWORK', 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
  throw new RepoError('UNKNOWN', 'İşlem tamamlanamadı. Biraz sonra tekrar dene.');
}

const toBusiness = (j: Row): PublicBusiness => ({
  id: j.id, name: j.name, category: j.category, city: j.city, district: j.district, address: j.address, phone: j.phone,
  description: j.description ?? null, workingHours: j.working_hours ?? null, logoPath: j.logo_path ?? null,
  ratingAvg: j.rating_avg == null ? null : Number(j.rating_avg), ratingCount: Number(j.rating_count ?? 0),
});
const toOffer = (j: Row): QuoteOffer => ({
  id: j.id, requestId: j.request_id, businessId: j.business_id, businessName: j.business_name, businessCity: j.business_city,
  businessPhone: j.business_phone, partsKurus: Number(j.parts_kurus), laborKurus: Number(j.labor_kurus), totalKurus: Number(j.total_kurus),
  partCondition: j.part_condition ?? null, eta: j.eta ?? null, note: j.note ?? null, createdAt: j.created_at, updatedAt: j.updated_at,
});
const baseRequest = (j: Row) => ({
  id: j.id, kind: j.kind, category: j.category, city: j.city, vehicleLabel: j.vehicle_label, title: j.title,
  description: j.description ?? null, partName: j.part_name ?? null, status: j.status, acceptedOfferId: j.accepted_offer_id ?? null,
  createdAt: j.created_at,
});

class MarketRepo {
  constructor(private readonly sb: SupabaseClient | null) {}

  private async rpc(name: string, args: Row = {}): Promise<any> {
    if (!this.sb) throw new RepoError('DEMO', MESSAGES.DEMO!);
    const { data, error } = await this.sb.rpc(name, args);
    if (error) fail(error);
    return data;
  }

  get available() { return !!this.sb; }

  async listBusinesses(city: string | null, category: BusinessCategory | null, query: string | null): Promise<PublicBusiness[]> {
    if (!this.sb) return [];
    return ((await this.rpc('public_businesses', { p_city: city || null, p_category: category, p_query: query || null })) as Row[]).map(toBusiness);
  }

  async getBusiness(id: string): Promise<PublicBusiness & { reviews: BusinessReview[] }> {
    const j = (await this.rpc('public_business', { p_id: id })) as Row;
    return { ...toBusiness(j), reviews: (j.reviews as Row[]).map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, createdAt: r.created_at })) };
  }

  async createRequest(r: NewQuoteRequest): Promise<string> {
    return (await this.rpc('create_quote_request', {
      p: {
        kind: r.kind, category: r.category, city: r.city, vehicle_label: r.vehicleLabel, title: r.title, description: r.description,
        part_name: r.partName, business_ids: r.businessIds, client_request_id: r.clientRequestId,
      },
    })) as string;
  }

  async myRequests(): Promise<QuoteRequest[]> {
    if (!this.sb) return [];
    return ((await this.rpc('my_quote_requests')) as Row[]).map((j) => ({
      ...baseRequest(j), targetCount: Number(j.target_count), offers: (j.offers as Row[]).map(toOffer),
    }));
  }

  acceptOffer(offerId: string) { return this.rpc('accept_quote_offer', { p_offer_id: offerId }); }
  closeRequest(requestId: string) { return this.rpc('close_quote_request', { p_request_id: requestId }); }

  async businessRequests(businessId: string): Promise<IncomingQuoteRequest[]> {
    if (!this.sb) return [];
    return ((await this.rpc('business_quote_requests', { p_business_id: businessId })) as Row[]).map((j) => ({
      ...baseRequest(j), myOffer: j.my_offer ? toOffer(j.my_offer) : null, customerPhone: j.customer_phone ?? null,
      acceptedMine: !!j.accepted_mine, seen: !!j.seen,
    }));
  }

  markSeen(businessId: string, requestId: string) { return this.rpc('mark_quote_seen', { p_business_id: businessId, p_request_id: requestId }); }

  submitOffer(o: NewQuoteOffer) {
    return this.rpc('submit_quote_offer', {
      p: {
        business_id: o.businessId, request_id: o.requestId, parts_kurus: o.partsKurus, labor_kurus: o.laborKurus,
        part_condition: o.partCondition, eta: o.eta, note: o.note,
      },
    });
  }

  addReview(recordId: string, rating: number, comment: string) {
    return this.rpc('add_business_review', { p_record_id: recordId, p_rating: rating, p_comment: comment });
  }

  async myReview(recordId: string): Promise<{ rating: number; comment: string | null } | null> {
    if (!this.sb) return null;
    return ((await this.rpc('my_review_for_record', { p_record_id: recordId })) as { rating: number; comment: string | null } | null) ?? null;
  }

  /** İşletmenin rehberde görünen tanıtımı ve çalışma saatleri (yetki: işletme yönetimi, sunucu kuralı) */
  async updatePublicProfile(businessId: string, description: string, workingHours: string) {
    if (!this.sb) throw new RepoError('DEMO', MESSAGES.DEMO!);
    const { error } = await this.sb.from('businesses')
      .update({ description: description.trim() || null, working_hours: workingHours.trim() || null }).eq('id', businessId);
    if (error) fail(error);
  }

  /** İşletme fotoğrafı yükler (yalnızca sahip); eski fotoğraf yolunun yerine yazılır. null: fotoğrafı kaldır. */
  async setBusinessPhoto(businessId: string, uri: string | null): Promise<void> {
    if (!this.sb) throw new RepoError('DEMO', MESSAGES.DEMO!);
    let path: string | null = null;
    if (uri) {
      path = `${businessId}/${Date.now()}.jpg`;
      const body = await (await fetch(uri)).arrayBuffer();
      const { error: up } = await this.sb.storage.from('business-photos').upload(path, body, { contentType: 'image/jpeg', upsert: false });
      if (up) fail(up);
    }
    const { error } = await this.sb.from('businesses').update({ logo_path: path }).eq('id', businessId);
    if (error) fail(error);
  }

  async adminBusinesses(status: BusinessStatus | null): Promise<AdminBusiness[]> {
    return ((await this.rpc('admin_businesses', { p_status: status })) as Row[]).map((j) => ({
      id: j.id, name: j.name, category: j.category, city: j.city, district: j.district, address: j.address, phone: j.phone,
      email: j.email ?? null, contactName: j.contact_name, taxOffice: j.tax_office ?? null, taxNumber: j.tax_number ?? null,
      status: j.status, createdAt: j.created_at, recordCount: Number(j.record_count),
    }));
  }

  adminSetStatus(businessId: string, status: BusinessStatus) {
    return this.rpc('admin_set_business_status', { p_business_id: businessId, p_status: status });
  }

  async adminReports(): Promise<AdminReport[]> {
    return ((await this.rpc('admin_forum_reports')) as Row[]).map((j) => ({
      postId: j.post_id ?? null, commentId: j.comment_id ?? null, businessName: j.business_name, text: j.text, deleted: !!j.deleted,
      reportCount: Number(j.report_count), lastReportAt: j.last_report_at, reasons: (j.reasons ?? []) as string[],
    }));
  }

  adminRemove(postId: string | null, commentId: string | null) {
    return this.rpc('admin_remove_forum_content', { p_post_id: postId, p_comment_id: commentId });
  }
}

export const marketRepo = new MarketRepo(env.isDemo ? null : (repo as SupabaseRepo).sb);
