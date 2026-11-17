/**
 * Supabase veri katmanı. Satır biçimi (snake_case) ↔ uygulama biçimi (camelCase) dönüşümü burada yapılır.
 * Yetki kontrolünü veritabanındaki RLS politikaları yapar; burada ayrıca sahiplik filtresi yazılmaz.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, FunctionsHttpError, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { normalizePlate, type TrafficFine, type ExpenseRecord, type FuelRecord, type MaintenanceEvent, type MaintenanceRule, type Vehicle } from '@piston/core';
import { Platform } from 'react-native';

import { env } from '@/lib/env';
import { RepoError, type Account, type LightIdentification, type LightRequest, type NewFine, type GarageRepo, type NewEvent, type NewExpense, type NewFuel, type NewRule, type NewVehicle, type VehicleBundle, type VehiclePatch } from './repo';

type Row = Record<string, any>;

const MESSAGES: Record<string, string> = {
  VEHICLE_LIMIT: 'Ücretsiz planda en fazla 2 araç ekleyebilirsin. Plus ile sınırsız araç eklenir.',
  ODOMETER_BELOW_HISTORY: 'Kilometre, kayıtlı en yüksek değerin altına inemez.',
  MODEL_YEAR_INVALID: 'Model yılını kontrol et.',
  VIN_INVALID: 'Şasi numarası geçersiz.',
  SOURCE_NOT_ALLOWED: 'Bu kaynak etiketi yalnızca doğrulanmış katalogdan atanabilir.',
};

function fail(err: PostgrestError | Error | null): never {
  const msg = err?.message ?? 'Bilinmeyen hata';
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (code) throw new RepoError(code, MESSAGES[code]!);
  if (msg.includes('Failed to fetch') || msg.includes('Network request failed'))
    throw new RepoError('NETWORK', 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
  throw new RepoError('UNKNOWN', 'İşlem tamamlanamadı. Biraz sonra tekrar dene.');
}

const toVehicle = (r: Row, photoUrl: string | null): Vehicle => ({
  id: r.id, vehicleType: r.vehicle_type, make: r.make, model: r.model, modelYear: r.model_year,
  engineLabel: r.engine_label, fuelType: r.fuel_type, transmission: r.transmission, odometerKm: r.odometer_km,
  plate: r.plate, vinMasked: r.vin_masked, photoUrl, createdAt: r.created_at,
});
const toRule = (r: Row): MaintenanceRule => ({
  id: r.id, vehicleId: r.vehicle_id, itemKey: r.item_key, title: r.title, kind: r.kind, everyKm: r.every_km,
  everyMonths: r.every_months, lastDoneKm: r.last_done_km, lastDoneOn: r.last_done_on, dueOn: r.due_on,
  source: r.source, remindBeforeKm: r.remind_before_km, remindBeforeDays: r.remind_before_days, enabled: r.enabled,
});
const toEvent = (r: Row): MaintenanceEvent => ({
  id: r.id, vehicleId: r.vehicle_id, ruleId: r.rule_id, title: r.title, performedOn: r.performed_on,
  odometerKm: r.odometer_km, cost: r.cost == null ? null : Number(r.cost), performedBy: r.performed_by,
  notes: r.notes, hasDocument: r.document_id != null,
});
const toFuel = (r: Row): FuelRecord => ({
  id: r.id, vehicleId: r.vehicle_id, filledOn: r.filled_on, odometerKm: r.odometer_km, quantity: Number(r.quantity),
  unit: r.unit, unitPrice: Number(r.unit_price), totalAmount: Number(r.total_amount), isFullTank: r.is_full_tank, fuelType: r.fuel_type,
});
const toExpense = (r: Row): ExpenseRecord => ({
  id: r.id, vehicleId: r.vehicle_id, category: r.category, amount: Number(r.amount), spentOn: r.spent_on, note: r.note,
});

const toFine = (r: Row): TrafficFine => ({
  id: r.id, vehicleId: r.vehicle_id, fineDate: r.fine_date, notifiedOn: r.notified_on, amount: Number(r.amount),
  description: r.description, paidOn: r.paid_on, paidAmount: r.paid_amount == null ? null : Number(r.paid_amount),
});

export class SupabaseRepo implements GarageRepo {
  readonly mode = 'supabase' as const;
  readonly sb: SupabaseClient;

  constructor() {
    this.sb = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
  }

  private async uid(): Promise<string> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user.id;
    if (!u) throw new RepoError('AUTH', 'Oturumun sona erdi. Tekrar giriş yap.');
    return u;
  }

  async getAccount(): Promise<Account | null> {
    const { data } = await this.sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const [{ data: p }, { data: roles }] = await Promise.all([
      this.sb.from('profiles').select('plan, display_name, phone').eq('id', user.id).maybeSingle(),
      this.sb.from('user_roles').select('role').eq('user_id', user.id),
    ]);
    return { userId: user.id, email: user.email ?? null, plan: (p?.plan as Account['plan']) ?? 'free', displayName: p?.display_name ?? null, phone: p?.phone ?? null, isAdmin: (roles ?? []).some((r: { role: string }) => r.role === 'admin') };
  }

  async updateMyPhone(phoneE164: string | null) {
    const { data } = await this.sb.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) throw new RepoError('AUTH', 'Oturum kapanmış. Yeniden giriş yap.');
    const { error } = await this.sb.from('profiles').update({ phone: phoneE164 }).eq('id', uid);
    if (error) throw new RepoError('INVALID', 'Telefon kaydedilemedi. Numarayı 05XX XXX XX XX biçiminde yaz.');
  }

  onAuthChange(cb: () => void) {
    // supabase-js: bu geri çağrının içinden başka Supabase çağrısı yapmak kilitlenmeye yol açabilir; bir sonraki tura ertele
    const { data } = this.sb.auth.onAuthStateChange(() => { setTimeout(cb, 0); });
    return () => data.subscription.unsubscribe();
  }

  async requestEmailCode(email: string) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      if (error.status === 429) throw new RepoError('RATE', 'Çok sık kod istendi. Bir dakika sonra tekrar dene.');
      fail(error);
    }
  }

  async verifyEmailCode(email: string, code: string) {
    const { error } = await this.sb.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw new RepoError('OTP', 'Kod hatalı ya da süresi dolmuş. Yeni kod iste.');
  }

  async startDemo() {
    throw new RepoError('NOT_DEMO', 'Bu sürüm gerçek sunucuya bağlı; demo kapalı.');
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  async deleteAccount() {
    const { error } = await this.sb.functions.invoke('delete-account', { method: 'POST' });
    if (error) throw new RepoError('DELETE', 'Hesap silinemedi. Tekrar dene ya da destek ile iletişime geç.');
    await this.sb.auth.signOut();
  }

  async recordConsent(consent: 'kvkk_notice' | 'marketing' | 'analytics' | 'ai_processing', granted: boolean, textVersion: string) {
    const { error } = await this.sb.from('consents').insert({ consent, granted, text_version: textVersion });
    if (error) fail(error);
  }

  private async photoUrl(path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data } = await this.sb.storage.from('vehicle-photos').createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  }

  async listVehicles() {
    const { data, error } = await this.sb.from('vehicles').select('*').is('archived_at', null).order('created_at');
    if (error) fail(error);
    return Promise.all((data ?? []).map(async (r) => toVehicle(r, await this.photoUrl(r.photo_path))));
  }

  async addVehicle(input: NewVehicle) {
    const uid = await this.uid();
    const { data, error } = await this.sb.from('vehicles').insert({
      vehicle_type: input.vehicleType, make: input.make, model: input.model, model_year: input.modelYear,
      engine_label: input.engineLabel, fuel_type: input.fuelType, transmission: input.transmission,
      odometer_km: input.odometerKm, plate: input.plate ? normalizePlate(input.plate) : null,
    }).select('*').single();
    if (error) fail(error);
    if (input.vin) {
      const { error: vinErr } = await this.sb.rpc('set_vehicle_vin', { p_vehicle_id: data.id, p_vin: input.vin });
      if (vinErr) fail(vinErr);
    }
    if (input.photoUri) {
      const path = `${uid}/${data.id}.jpg`;
      const body = await (await fetch(input.photoUri)).arrayBuffer();
      const { error: upErr } = await this.sb.storage.from('vehicle-photos').upload(path, body, { contentType: 'image/jpeg', upsert: true });
      if (!upErr) await this.sb.from('vehicles').update({ photo_path: path }).eq('id', data.id);
    }
    const { data: fresh } = await this.sb.from('vehicles').select('*').eq('id', data.id).single();
    return toVehicle(fresh ?? data, await this.photoUrl(fresh?.photo_path ?? null));
  }

  async updateVehicle(id: string, patch: VehiclePatch) {
    const row: Row = {};
    if (patch.odometerKm != null) row.odometer_km = patch.odometerKm;
    if (patch.plate !== undefined) row.plate = patch.plate ? normalizePlate(patch.plate) : null;
    if (patch.make) row.make = patch.make;
    if (patch.model) row.model = patch.model;
    if (patch.modelYear) row.model_year = patch.modelYear;
    if (patch.engineLabel !== undefined) row.engine_label = patch.engineLabel;
    if (patch.fuelType) row.fuel_type = patch.fuelType;
    if (patch.transmission) row.transmission = patch.transmission;
    if (patch.vehicleType) row.vehicle_type = patch.vehicleType;
    const { error } = await this.sb.from('vehicles').update(row).eq('id', id);
    if (error) fail(error);
  }

  async archiveVehicle(id: string) {
    const { error } = await this.sb.from('vehicles').update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (error) fail(error);
  }

  async loadBundle(vehicleId: string): Promise<VehicleBundle> {
    const [rules, events, fuel, expenses, fines] = await Promise.all([
      this.sb.from('maintenance_rules').select('*').eq('vehicle_id', vehicleId),
      this.sb.from('maintenance_events').select('*').eq('vehicle_id', vehicleId).order('performed_on', { ascending: false }).limit(200),
      this.sb.from('fuel_records').select('*').eq('vehicle_id', vehicleId).order('odometer_km', { ascending: false }).limit(500),
      this.sb.from('expense_records').select('*').eq('vehicle_id', vehicleId).order('spent_on', { ascending: false }).limit(500),
      this.sb.from('traffic_fines').select('*').eq('vehicle_id', vehicleId).order('notified_on', { ascending: false }).limit(200),
    ]);
    for (const r of [rules, events, fuel, expenses, fines]) if (r.error) fail(r.error);
    return {
      rules: (rules.data ?? []).map(toRule),
      events: (events.data ?? []).map(toEvent),
      fuel: (fuel.data ?? []).map(toFuel),
      expenses: (expenses.data ?? []).map(toExpense),
      fines: (fines.data ?? []).map(toFine),
    };
  }

  async upsertRule(rule: NewRule & { id?: string }) {
    const row = {
      ...(rule.id ? { id: rule.id } : {}),
      vehicle_id: rule.vehicleId, item_key: rule.itemKey, title: rule.title, kind: rule.kind, every_km: rule.everyKm,
      every_months: rule.everyMonths, last_done_km: rule.lastDoneKm, last_done_on: rule.lastDoneOn, due_on: rule.dueOn,
      source: rule.source === 'manufacturer_verified' ? undefined : rule.source,
      remind_before_km: rule.remindBeforeKm, remind_before_days: rule.remindBeforeDays, enabled: rule.enabled,
    };
    const { error } = await this.sb.from('maintenance_rules').upsert(row);
    if (error) fail(error);
  }

  async deleteRule(id: string) {
    const { error } = await this.sb.from('maintenance_rules').delete().eq('id', id);
    if (error) fail(error);
  }

  async addEvent(e: NewEvent) {
    const { error } = await this.sb.from('maintenance_events').insert({
      vehicle_id: e.vehicleId, rule_id: e.ruleId, title: e.title, performed_on: e.performedOn, odometer_km: e.odometerKm,
      cost: e.cost, performed_by: e.performedBy, notes: e.notes,
    });
    if (error) fail(error);
  }

  async addFuel(f: NewFuel) {
    const { error } = await this.sb.from('fuel_records').insert({
      vehicle_id: f.vehicleId, filled_on: f.filledOn, odometer_km: f.odometerKm, quantity: f.quantity, unit: f.unit,
      unit_price: f.unitPrice, total_amount: f.totalAmount, is_full_tank: f.isFullTank, fuel_type: f.fuelType,
    });
    if (error) fail(error);
  }

  async deleteFuel(id: string) {
    const { error } = await this.sb.from('fuel_records').delete().eq('id', id);
    if (error) fail(error);
  }

  async addExpense(e: NewExpense) {
    const { error } = await this.sb.from('expense_records').insert({
      vehicle_id: e.vehicleId, category: e.category, amount: e.amount, spent_on: e.spentOn, note: e.note,
    });
    if (error) fail(error);
  }

  async addFine(f: NewFine) {
    const { error } = await this.sb.from('traffic_fines').insert({
      vehicle_id: f.vehicleId, fine_date: f.fineDate, notified_on: f.notifiedOn, amount: f.amount, description: f.description,
    });
    if (error) fail(error);
  }

  async payFine(id: string, paidOn: string, paidAmount: number) {
    const { data: fine, error: e1 } = await this.sb.from('traffic_fines').select('*').eq('id', id).single();
    if (e1 || !fine) fail(e1);
    if (fine.paid_on) return;
    // Önce masraf, sonra ceza: ikinci adım başarısız olursa masraf geri alınır
    const { data: exp, error: e2 } = await this.sb.from('expense_records')
      .insert({ vehicle_id: fine.vehicle_id, category: 'fine', amount: paidAmount, spent_on: paidOn, note: fine.description })
      .select('id').single();
    if (e2 || !exp) fail(e2);
    const { error: e3 } = await this.sb.from('traffic_fines').update({ paid_on: paidOn, paid_amount: paidAmount, expense_id: exp.id }).eq('id', id);
    if (e3) {
      await this.sb.from('expense_records').delete().eq('id', exp.id);
      fail(e3);
    }
  }

  async deleteFine(id: string) {
    const { error } = await this.sb.from('traffic_fines').delete().eq('id', id);
    if (error) fail(error);
  }

  async deleteExpense(id: string) {
    const { error } = await this.sb.from('expense_records').delete().eq('id', id);
    if (error) fail(error);
  }

  async identifyWarningLights(req: LightRequest): Promise<LightIdentification> {
    const { data, error } = await this.sb.functions.invoke('identify-warning-light', {
      method: 'POST',
      body: { image: req.imageBase64, mediaType: req.mediaType, vehicle: req.vehicle, note: req.note },
    });
    if (error) {
      let code = 'ai_unavailable';
      let limit: number | null = null;
      if (error instanceof FunctionsHttpError) {
        try {
          const b = await error.context.json();
          code = b.error ?? code;
          limit = b.limit ?? null;
        } catch {
          // gövde okunamadıysa genel hata
        }
      }
      const msg: Record<string, string> = {
        consent_required: 'Fotoğrafı analiz edebilmemiz için izin vermen gerekiyor.',
        quota_exceeded: `Bu ayki ${limit ?? ''} tanıma hakkın doldu. Listeden seçerek devam edebilirsin.`.replace('  ', ' '),
        image_too_large: 'Fotoğraf çok büyük. Daha yakından ve tekrar çek.',
        image_rejected: 'Fotoğraf işlenemedi. Başka bir fotoğrafla dene.',
        refused: 'Bu fotoğraf analiz edilemedi. Listeden seçerek devam edebilirsin.',
        busy: 'Sistem şu an yoğun. Biraz sonra tekrar dene ya da listeden seç.',
        not_configured: 'Fotoğraf tanıma henüz açılmadı. Listeden seçebilirsin.',
      };
      throw new RepoError(code.toUpperCase(), msg[code] ?? 'Fotoğraf şu an analiz edilemedi. Listeden seçerek devam edebilirsin.');
    }
    return { quality: data.quality, lights: data.lights, remaining: data.remaining ?? null, limit: data.limit ?? null, isDemoSample: false };
  }

  async aiQuota() {
    const { data, error } = await this.sb.rpc('ai_quota', { p_feature: 'warning_light' }).single();
    if (error || !data) return null;
    const row = data as { used: number; monthly_limit: number };
    return { used: row.used, limit: row.monthly_limit };
  }

  async registerPushToken(token: string, platform: 'ios' | 'android' | 'web') {
    const { error } = await this.sb.rpc('register_device_token', { p_token: token, p_platform: platform });
    if (error) fail(error);
  }
}
