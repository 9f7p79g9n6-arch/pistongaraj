/**
 * DEMO veri katmanı. Veriler yalnızca bu cihazda (AsyncStorage) tutulur.
 * Sunucudaki kuralların aynısını uygular: araç sınırı, şasi maskeleme, kilometre ilerletme,
 * yapılan işlemin bakım kuralını güncellemesi. Örnek veriler açıkça "örnek" olarak işaretlidir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  addDays,
  addMonths,
  canAddVehicle,
  formatNumber,
  maskVin,
  normalizeVin,
  todayISO,
  type ExpenseRecord,
  type FuelRecord,
  type MaintenanceEvent,
  type MaintenanceRule,
  type Plan,
  type Vehicle,
} from '@piston/core';

import { analyzeWithArtifactClaude, ArtifactAiError } from '@/lib/artifact-ai';
import { RepoError, type Account, type LightIdentification, type LightRequest, type GarageRepo, type NewEvent, type NewExpense, type NewFuel, type NewRule, type NewVehicle, type VehicleBundle, type VehiclePatch } from './repo';

const KEY = 'piston-demo-v1';

interface DemoState {
  signedIn: boolean;
  plan: Plan;
  vehicles: (Vehicle & { archived: boolean })[];
  rules: MaintenanceRule[];
  events: MaintenanceEvent[];
  fuel: FuelRecord[];
  expenses: ExpenseRecord[];
  consents: { consent: string; granted: boolean; textVersion: string; at: string }[];
}

const id = () => Crypto.randomUUID();

function seed(): DemoState {
  const t = todayISO();
  const v1 = id();
  const rule = (p: Partial<MaintenanceRule> & Pick<MaintenanceRule, 'itemKey' | 'title'>): MaintenanceRule => ({
    id: id(), vehicleId: v1, kind: 'interval', everyKm: null, everyMonths: null, lastDoneKm: null, lastDoneOn: null,
    dueOn: null, source: 'user', remindBeforeKm: 1500, remindBeforeDays: 30, enabled: true, ...p,
  });
  const odo = 148760;
  const fuelRows: [number, number, number, number, boolean][] = [
    // [kaç gün önce, km, litre, birim fiyat, depo dolu]
    [76, 145100, 46.0, 60.8, true],
    [60, 145920, 44.3, 61.4, true],
    [45, 146810, 47.9, 62.1, true],
    [30, 147620, 45.1, 62.85, true],
    [15, 148530, 50.2, 63.2, true],
    [1, 148700, 10.0, 63.5, false],
  ];
  return {
    signedIn: false,
    plan: 'free',
    vehicles: [{
      id: v1, vehicleType: 'car', make: 'Ford', model: 'Focus (örnek)', modelYear: 2016, engineLabel: '1.5 TDCi 120 PS',
      fuelType: 'diesel', transmission: 'manual', odometerKm: odo, plate: null, vinMasked: null, photoUrl: null,
      createdAt: new Date().toISOString(), archived: false,
    }],
    rules: [
      rule({ itemKey: 'engine_oil', title: 'Motor yağı + yağ filtresi', everyKm: 15000, everyMonths: 12, lastDoneKm: odo - 12760, lastDoneOn: addMonths(t, -8) }),
      rule({ itemKey: 'air_filter', title: 'Hava filtresi', everyKm: 30000, lastDoneKm: odo - 27760, lastDoneOn: addMonths(t, -20), source: 'service' }),
      rule({ itemKey: 'cabin_filter', title: 'Polen filtresi', everyMonths: 12, lastDoneOn: addDays(addMonths(t, -12), -44) }),
      rule({ itemKey: 'timing_belt', title: 'Triger seti', everyKm: 150000, everyMonths: 120, lastDoneKm: odo - 58760, lastDoneOn: addMonths(t, -54) }),
      rule({ itemKey: 'brake_pads', title: 'Ön fren balatası', everyKm: 40000, lastDoneKm: odo - 860, lastDoneOn: addDays(t, -24), source: 'service' }),
      rule({ itemKey: 'inspection', title: 'Araç muayenesi', kind: 'due_date', dueOn: addDays(t, 18), source: 'legal' }),
      rule({ itemKey: 'traffic_insurance', title: 'Trafik sigortası', kind: 'due_date', dueOn: addDays(t, 98), source: 'legal' }),
    ],
    events: [
      { id: id(), vehicleId: v1, ruleId: null, title: 'Ön fren balatası değişti', performedOn: addDays(t, -24), odometerKm: odo - 860, cost: 1850, performedBy: 'Örnek Oto Servis', notes: null, hasDocument: true },
      { id: id(), vehicleId: v1, ruleId: null, title: 'Motor yağı + yağ filtresi', performedOn: addMonths(t, -8), odometerKm: odo - 12760, cost: 1980, performedBy: 'Kendim', notes: null, hasDocument: true },
    ],
    fuel: fuelRows.map(([ago, km, l, p, full]) => ({
      id: id(), vehicleId: v1, filledOn: addDays(t, -ago), odometerKm: km, quantity: l, unit: 'L' as const, unitPrice: p,
      totalAmount: Math.round(l * p * 100) / 100, isFullTank: full, fuelType: 'diesel' as const,
    })),
    expenses: [
      { id: id(), vehicleId: v1, category: 'parking', amount: 260, spentOn: addDays(t, -6), note: null },
      { id: id(), vehicleId: v1, category: 'wash', amount: 420, spentOn: addDays(t, -40), note: null },
      { id: id(), vehicleId: v1, category: 'insurance', amount: 6400, spentOn: addMonths(t, -4), note: 'Kasko taksiti' },
    ],
    consents: [],
  };
}

export class DemoRepo implements GarageRepo {
  readonly mode = 'demo' as const;
  private state: DemoState | null = null;
  private listeners = new Set<() => void>();

  private async load(): Promise<DemoState> {
    if (this.state) return this.state;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      this.state = raw ? (JSON.parse(raw) as DemoState) : seed();
    } catch {
      this.state = seed();
    }
    return this.state;
  }

  private async save() {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Depolama kapalıysa (ör. gizli sekme) demo bellek içinde çalışmaya devam eder
    }
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private async mutate<T>(fn: (s: DemoState) => T): Promise<T> {
    const s = await this.load();
    const r = fn(s);
    await this.save();
    return r;
  }

  async getAccount(): Promise<Account | null> {
    const s = await this.load();
    return s.signedIn ? { userId: 'demo', email: null, plan: s.plan, displayName: 'Demo kullanıcı' } : null;
  }

  onAuthChange(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async requestEmailCode() {
    throw new RepoError('DEMO', 'Demo modunda e-posta ile giriş yok. "Demo ile gez" düğmesini kullan.');
  }
  async verifyEmailCode() {
    throw new RepoError('DEMO', 'Demo modunda e-posta ile giriş yok.');
  }

  async startDemo() {
    await this.mutate((s) => { s.signedIn = true; });
    this.emit();
  }

  async signOut() {
    await this.mutate((s) => { s.signedIn = false; });
    this.emit();
  }

  async deleteAccount() {
    this.state = { ...seed(), signedIn: false };
    await this.save();
    this.emit();
  }

  async recordConsent(consent: string, granted: boolean, textVersion: string) {
    await this.mutate((s) => { s.consents.push({ consent, granted, textVersion, at: new Date().toISOString() }); });
  }

  async listVehicles() {
    const s = await this.load();
    return s.vehicles.filter((v) => !v.archived).map(({ archived: _a, ...v }) => v);
  }

  async addVehicle(input: NewVehicle) {
    return this.mutate((s) => {
      if (!canAddVehicle(s.plan, s.vehicles.filter((v) => !v.archived).length))
        throw new RepoError('VEHICLE_LIMIT', 'Ücretsiz planda en fazla 2 araç ekleyebilirsin.');
      const { vin, photoUri, ...rest } = input;
      const v: Vehicle & { archived: boolean } = {
        ...rest, id: id(), createdAt: new Date().toISOString(), archived: false,
        vinMasked: vin ? maskVin(normalizeVin(vin)) : null, photoUrl: photoUri,
      };
      s.vehicles.push(v);
      const { archived: _a, ...out } = v;
      return out;
    });
  }

  async updateVehicle(vid: string, patch: VehiclePatch) {
    await this.mutate((s) => {
      const v = s.vehicles.find((x) => x.id === vid);
      if (!v) throw new RepoError('NOT_FOUND', 'Araç bulunamadı.');
      if (patch.odometerKm != null) {
        const maxRecorded = Math.max(0, ...s.fuel.filter((f) => f.vehicleId === vid).map((f) => f.odometerKm),
          ...s.events.filter((e) => e.vehicleId === vid).map((e) => e.odometerKm ?? 0));
        if (patch.odometerKm < maxRecorded)
          throw new RepoError('ODOMETER_BELOW_HISTORY', `Kilometre, kayıtlı en yüksek değerin (${formatNumber(maxRecorded)} km) altına inemez.`);
      }
      Object.assign(v, patch);
    });
  }

  async archiveVehicle(vid: string) {
    await this.mutate((s) => {
      const v = s.vehicles.find((x) => x.id === vid);
      if (v) v.archived = true;
    });
  }

  async loadBundle(vid: string): Promise<VehicleBundle> {
    const s = await this.load();
    return {
      rules: s.rules.filter((r) => r.vehicleId === vid),
      events: s.events.filter((e) => e.vehicleId === vid).sort((a, b) => b.performedOn.localeCompare(a.performedOn)),
      fuel: s.fuel.filter((f) => f.vehicleId === vid).sort((a, b) => b.odometerKm - a.odometerKm),
      expenses: s.expenses.filter((e) => e.vehicleId === vid).sort((a, b) => b.spentOn.localeCompare(a.spentOn)),
    };
  }

  async upsertRule(rule: NewRule & { id?: string }) {
    await this.mutate((s) => {
      if (rule.source === 'manufacturer_verified') rule = { ...rule, source: 'user' };
      const i = rule.id ? s.rules.findIndex((r) => r.id === rule.id) : -1;
      if (i >= 0) s.rules[i] = { ...s.rules[i]!, ...rule, id: s.rules[i]!.id };
      else s.rules.push({ ...rule, id: id() });
    });
  }

  async deleteRule(rid: string) {
    await this.mutate((s) => { s.rules = s.rules.filter((r) => r.id !== rid); });
  }

  private bump(s: DemoState, vid: string, km: number | null) {
    const v = s.vehicles.find((x) => x.id === vid);
    if (v && km != null && km > v.odometerKm) v.odometerKm = km;
  }

  async addEvent(e: NewEvent) {
    await this.mutate((s) => {
      s.events.push({ ...e, id: id(), hasDocument: false });
      const r = e.ruleId ? s.rules.find((x) => x.id === e.ruleId) : undefined;
      if (r) {
        if (e.odometerKm != null && (r.lastDoneKm == null || e.odometerKm >= r.lastDoneKm)) r.lastDoneKm = e.odometerKm;
        if (r.lastDoneOn == null || e.performedOn >= r.lastDoneOn) r.lastDoneOn = e.performedOn;
      }
      this.bump(s, e.vehicleId, e.odometerKm);
    });
  }

  async addFuel(f: NewFuel) {
    await this.mutate((s) => {
      s.fuel.push({ ...f, id: id() });
      this.bump(s, f.vehicleId, f.odometerKm);
    });
  }

  async deleteFuel(fid: string) {
    await this.mutate((s) => { s.fuel = s.fuel.filter((f) => f.id !== fid); });
  }

  async addExpense(e: NewExpense) {
    await this.mutate((s) => { s.expenses.push({ ...e, id: id() }); });
  }

  async deleteExpense(eid: string) {
    await this.mutate((s) => { s.expenses = s.expenses.filter((e) => e.id !== eid); });
  }

  /**
   * Demo modunda kendi sunucumuz yok. claude.ai'de yayınlanan web sürümünde fotoğraf, sayfayı açan kişinin
   * Claude hesabıyla gerçekten analiz edilir. Bu mümkün değilse (telefon, yerel önizleme) akışı göstermek
   * için her fotoğrafa aynı ÖRNEK sonuç döner ve ekranda "örnek sonuç" olarak gösterilir.
   */
  async identifyWarningLights(req: LightRequest): Promise<LightIdentification> {
    try {
      const vehicleLine = req.vehicle ? `${req.vehicle.make} ${req.vehicle.model} ${req.vehicle.year} ${req.vehicle.fuel}` : '';
      const real = await analyzeWithArtifactClaude(req.imageBase64, req.mediaType, vehicleLine, req.note);
      if (real) return { ...real, isDemoSample: false, remaining: null, limit: null };
    } catch (e) {
      if (e instanceof ArtifactAiError) throw new RepoError(e.code.toUpperCase(), e.message);
      throw e;
    }
    await new Promise((r) => setTimeout(r, 900));
    return {
      quality: 'ok',
      isDemoSample: true,
      remaining: null,
      limit: null,
      lights: [
        { catalogId: 'check_engine', color: 'amber', blinking: 'unknown', confidence: 'high', description: 'Motor silüeti', meaningIfUnknown: '' },
        { catalogId: 'tpms', color: 'amber', blinking: 'unknown', confidence: 'medium', description: 'Ünlemli lastik kesiti', meaningIfUnknown: '' },
      ],
    };
  }

  async aiQuota() {
    return null;
  }

  async registerPushToken() {
    // Demo modunda sunucu yok
  }
}
