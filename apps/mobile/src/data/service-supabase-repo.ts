/**
 * PISTON SERVİS Supabase veri katmanı. Yetki kontrolünü veritabanı yapar (RLS + security definer fonksiyonlar);
 * servis kaydı yalnızca save_service_record ile yazılır, tutarlar sunucuda hesaplanır.
 * Not: Gerçek bir Supabase projesine bağlanıp uçtan uca denenene kadar bu katman "test edildi" sayılmaz.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import {
  computeServiceTotals,
  normalizePlate,
  type Business,
  type BusinessCustomer,
  type BusinessExpense,
  type BusinessVehicle,
  type ServiceRecord,
} from '@piston/core';

import { RepoError } from './repo';
import { SERVICE_MESSAGES, serviceError } from './service-errors';
import { ALLOWED_MIME, MAX_FILE_BYTES, type NewBusiness, type NewBusinessVehicle, type ExpensePatch, type NewCustomer, type NewExpense, type NewPayment, type PendingFile, type ServiceRecordDraft, type ServiceRepo } from './service-repo';

type Row = Record<string, any>;
const BUCKET = 'service-files';
/** Müşteriye giden PDF bağlantısının geçerlilik süresi: 30 gün */
const PDF_LINK_SECONDS = 30 * 24 * 60 * 60;

function fail(err: { message?: string; code?: string } | null): never {
  const msg = err?.message ?? '';
  if (err?.code === '23505' || msg.includes('duplicate key')) {
    if (msg.includes('plate')) throw serviceError('DUPLICATE_PLATE');
    if (msg.includes('phone')) throw serviceError('DUPLICATE_PHONE');
  }
  const code = Object.keys(SERVICE_MESSAGES).find((k) => msg.includes(k));
  if (code) throw serviceError(code);
  if (err?.code === '23514' || msg.includes('check constraint')) throw new RepoError('INVALID', 'Girilen bilgilerden biri geçersiz. Alanları kontrol et.');
  if (msg.includes('Failed to fetch') || msg.includes('Network request failed'))
    throw new RepoError('NETWORK', 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
  throw new RepoError('UNKNOWN', 'İşlem tamamlanamadı. Biraz sonra tekrar dene.');
}

const toBusiness = (r: Row, role: Business['role'], logoUrl: string | null): Business => ({
  id: r.id, name: r.name, contactName: r.contact_name, phone: r.phone, email: r.email, city: r.city, district: r.district,
  address: r.address, category: r.category, taxOffice: r.tax_office, taxNumber: r.tax_number, logoUrl, status: r.status,
  description: r.description ?? null, workingHours: r.working_hours ?? null,
  role, createdAt: r.created_at,
});
const toCustomer = (r: Row): BusinessCustomer => ({
  id: r.id, businessId: r.business_id, fullName: r.full_name, phone: r.phone, email: r.email, createdAt: r.created_at,
});
const toVehicle = (r: Row): BusinessVehicle => ({
  id: r.id, businessId: r.business_id, customerId: r.customer_id, plate: r.plate, make: r.make, model: r.model,
  modelYear: r.model_year, engineLabel: r.engine_label, lastOdometerKm: r.last_odometer_km, createdAt: r.created_at,
});

export class ServiceSupabaseRepo implements ServiceRepo {
  readonly mode = 'supabase' as const;
  constructor(private readonly sb: SupabaseClient) {}

  private async signed(path: string): Promise<string> {
    const { data } = await this.sb.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
    return data?.signedUrl ?? '';
  }

  /** business_service_record / my_service_records çıktısını uygulama biçimine çevirir */
  private async fromView(j: Row): Promise<ServiceRecord> {
    const items = (j.items as Row[]).map((i) => ({
      id: i.id, title: i.title, description: i.description, partName: i.part_name, partQty: i.part_qty,
      partUnitKurus: Number(i.part_unit_kurus), laborKurus: Number(i.labor_kurus), discountKurus: Number(i.discount_kurus),
    }));
    const totals = computeServiceTotals(items, j.vat_rate);
    // Sunucudaki tutar esastır; uygulamadaki hesap yalnızca alt kırılımlar için kullanılır ve aynı sonucu vermelidir.
    totals.grandKurus = Number(j.grand_kurus);
    return {
      id: j.id, businessId: j.business_id, businessName: j.business_name, businessVerified: j.business_verified,
      customerId: j.customer_id, customerName: j.customer_name, customerPhone: j.customer_phone,
      vehicleId: j.vehicle_id, plate: j.plate, vehicleLabel: j.vehicle_label, status: j.status, approvalVersion: j.approval_version,
      intakeAt: j.intake_at, odometerKm: j.odometer_km, complaint: j.complaint, initialNote: j.initial_note, fuelLevel: j.fuel_level,
      existingDamage: j.existing_damage, items, totals,
      files: await Promise.all((j.files as Row[]).map(async (f) => ({ id: f.id, kind: f.kind, url: await this.signed(f.storage_path), mimeType: f.mime_type, sizeBytes: f.size_bytes }))),
      responses: (j.responses as Row[]).map((a) => ({ id: a.id, version: a.version, action: a.action, reason: a.reason, via: a.via, at: a.created_at })),
      history: (j.history as Row[]).map((h) => ({ status: h.status, by: h.actor, at: h.created_at })),
      payments: ((j.payments as Row[] | undefined) ?? []).map((p) => ({
        id: p.id, amountKurus: Number(p.amount_kurus), method: p.method, paidAt: p.paid_at, note: p.note,
        voidedAt: p.voided_at, voidReason: p.void_reason,
      })),
      createdAt: j.created_at, updatedAt: j.updated_at, approvedAt: j.approved_at,
    };
  }

  async listMyBusinesses() {
    const { data: auth } = await this.sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return [];
    const { data, error } = await this.sb.from('business_members').select('role, businesses(*)').eq('user_id', uid);
    if (error) fail(error);
    return (data ?? []).filter((m: Row) => m.businesses).map((m: Row) => toBusiness(m.businesses, m.role, null));
  }

  async deleteBusiness(businessId: string, confirmName: string) {
    const { error } = await this.sb.rpc('delete_business', { p_business_id: businessId, p_confirm_name: confirmName });
    if (error) fail(error);
  }

  async createBusiness(b: NewBusiness) {
    const { data, error } = await this.sb.rpc('create_business', {
      p_name: b.name, p_contact_name: b.contactName, p_phone: b.phone, p_email: b.email, p_city: b.city, p_district: b.district,
      p_address: b.address, p_category: b.category, p_tax_office: b.taxOffice, p_tax_number: b.taxNumber,
    });
    if (error) fail(error);
    const { data: row, error: e2 } = await this.sb.from('businesses').select('*').eq('id', data).single();
    if (e2) fail(e2);
    return toBusiness(row, 'owner', null);
  }

  async updateBusiness(id: string, b: NewBusiness) {
    const { error } = await this.sb.from('businesses').update({
      name: b.name, contact_name: b.contactName, phone: b.phone, email: b.email, city: b.city, district: b.district,
      address: b.address, category: b.category, tax_office: b.taxOffice, tax_number: b.taxNumber,
    }).eq('id', id);
    if (error) fail(error);
  }

  async listCustomers(businessId: string) {
    const { data, error } = await this.sb.from('business_customers').select('*').eq('business_id', businessId).order('full_name');
    if (error) fail(error);
    return (data ?? []).map(toCustomer);
  }

  async addCustomer(c: NewCustomer) {
    const { data, error } = await this.sb.from('business_customers')
      .insert({ business_id: c.businessId, full_name: c.fullName.trim(), phone: c.phone, email: c.email?.toLowerCase() ?? null })
      .select('*').single();
    if (error) fail(error);
    return toCustomer(data);
  }

  async listVehicles(businessId: string) {
    const { data, error } = await this.sb.from('business_vehicles').select('*').eq('business_id', businessId).order('plate');
    if (error) fail(error);
    return (data ?? []).map(toVehicle);
  }

  async addVehicle(v: NewBusinessVehicle) {
    const { data, error } = await this.sb.from('business_vehicles').insert({
      business_id: v.businessId, customer_id: v.customerId, plate: normalizePlate(v.plate), make: v.make.trim(), model: v.model.trim(),
      model_year: v.modelYear, engine_label: v.engineLabel, last_odometer_km: v.odometerKm,
    }).select('*').single();
    if (error) fail(error);
    return toVehicle(data);
  }

  async listRecords(businessId: string) {
    const { data, error } = await this.sb.from('service_records').select('id').eq('business_id', businessId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(200);
    if (error) fail(error);
    return Promise.all((data ?? []).map((r: Row) => this.getRecord(r.id)));
  }

  async getRecord(id: string) {
    const { data, error } = await this.sb.rpc('business_service_record', { p_record_id: id });
    if (error) fail(error);
    if (!data) throw serviceError('NOT_FOUND');
    return this.fromView(data);
  }

  async saveRecord(d: ServiceRecordDraft) {
    const { data, error } = await this.sb.rpc('save_service_record', {
      p: {
        id: d.id ?? null, business_id: d.businessId, customer_id: d.customerId, vehicle_id: d.vehicleId,
        client_request_id: d.clientRequestId, intake_at: d.intakeAt, odometer_km: d.odometerKm, complaint: d.complaint,
        initial_note: d.initialNote, fuel_level: d.fuelLevel, existing_damage: d.existingDamage, vat_rate: d.vatRate,
        items: d.items.map((i) => ({
          title: i.title, description: i.description, part_name: i.partName, part_qty: i.partQty,
          part_unit_kurus: i.partUnitKurus, labor_kurus: i.laborKurus, discount_kurus: i.discountKurus,
        })),
      },
    });
    if (error) fail(error);
    return data as string;
  }

  /**
   * PDF, kaydın kendi klasörüne (<işletme>/<kayıt>/) yüklenir; yükleme yetkisi storage kuralıyla kontrol edilir.
   * Bağlantı 30 gün geçerli imzalı adrestir; tahmin edilemez, süresi dolunca açılmaz.
   */
  async recordPdfLink(businessId: string, recordId: string, pdfUri: string) {
    const path = `${businessId}/${recordId}/kayit-${Date.now()}.pdf`;
    const body = await (await fetch(pdfUri)).arrayBuffer();
    if (body.byteLength > MAX_FILE_BYTES) throw serviceError('FILE_TOO_LARGE');
    const { error: upErr } = await this.sb.storage.from(BUCKET).upload(path, body, { contentType: 'application/pdf', upsert: false });
    if (upErr) fail(upErr);
    const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrl(path, PDF_LINK_SECONDS);
    if (error || !data?.signedUrl) fail(error);
    return data.signedUrl;
  }

  async addFiles(businessId: string, recordId: string, files: PendingFile[]) {
    for (const f of files) {
      if (f.sizeBytes > MAX_FILE_BYTES) throw serviceError('FILE_TOO_LARGE');
      if (!(ALLOWED_MIME as readonly string[]).includes(f.mimeType)) throw serviceError('FILE_TYPE');
      const ext = f.mimeType === 'application/pdf' ? 'pdf' : f.mimeType === 'image/png' ? 'png' : 'jpg';
      const path = `${businessId}/${recordId}/${Crypto.randomUUID()}.${ext}`;
      const body = await (await fetch(f.uri)).arrayBuffer();
      const { error: upErr } = await this.sb.storage.from(BUCKET).upload(path, body, { contentType: f.mimeType, upsert: false });
      if (upErr) fail(upErr);
      const { error } = await this.sb.from('service_files').insert({
        record_id: recordId, business_id: businessId, kind: f.kind, storage_path: path, mime_type: f.mimeType, size_bytes: body.byteLength,
      });
      if (error) fail(error);
    }
  }

  async completeRecord(id: string) {
    const { error } = await this.sb.rpc('complete_service_record', { p_record_id: id });
    if (error) fail(error);
  }

  async deleteRecord(id: string, reason: string | null) {
    const { error } = await this.sb.rpc('delete_service_record', { p_record_id: id, p_reason: reason });
    if (error) fail(error);
  }

  async addPayment(p: NewPayment) {
    const { error } = await this.sb.rpc('add_service_payment', {
      p_record_id: p.recordId, p_amount_kurus: p.amountKurus, p_method: p.method, p_paid_at: p.paidAt,
      p_note: p.note, p_client_request_id: p.clientRequestId,
    });
    if (error) fail(error);
  }

  async voidPayment(paymentId: string, reason: string) {
    const { error } = await this.sb.rpc('void_service_payment', { p_payment_id: paymentId, p_reason: reason });
    if (error) fail(error);
  }

  async listExpenses(businessId: string): Promise<BusinessExpense[]> {
    const { data, error } = await this.sb.from('business_expenses').select('id, amount_kurus, description, spent_on, created_at')
      .eq('business_id', businessId).order('spent_on', { ascending: false }).order('created_at', { ascending: false });
    if (error) fail(error);
    return (data ?? []).map((r: Row) => ({ id: r.id, amountKurus: Number(r.amount_kurus), description: r.description, spentOn: r.spent_on, createdAt: r.created_at }));
  }

  async addExpense(x: NewExpense) {
    const { error } = await this.sb.from('business_expenses').insert({
      business_id: x.businessId, amount_kurus: x.amountKurus, description: x.description, spent_on: x.spentOn, client_request_id: x.clientRequestId,
    });
    // Aynı istek ikinci kez gönderildiyse gider zaten kaydedilmiştir
    if (error && !(error.code === '23505' && error.message.includes('client_request_id'))) fail(error);
  }

  async updateExpense(id: string, x: ExpensePatch) {
    const { error } = await this.sb.from('business_expenses').update({ amount_kurus: x.amountKurus, description: x.description, spent_on: x.spentOn }).eq('id', id);
    if (error) fail(error);
  }

  async deleteExpense(id: string) {
    const { error } = await this.sb.from('business_expenses').delete().eq('id', id);
    if (error) fail(error);
  }

  async myRecords() {
    const { data, error } = await this.sb.rpc('my_service_records');
    if (error) fail(error);
    return Promise.all(((data as Row[]) ?? []).map((j) => this.fromView(j)));
  }

  async respond(recordId: string, version: number, action: 'approved' | 'objected', reason: string | null) {
    const { error } = await this.sb.rpc('respond_to_service_record', { p_record_id: recordId, p_version: version, p_action: action, p_reason: reason });
    if (error) fail(error);
  }
}
