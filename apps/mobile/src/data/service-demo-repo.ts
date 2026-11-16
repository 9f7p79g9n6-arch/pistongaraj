/**
 * PISTON SERVİS DEMO veri katmanı. Veriler yalnızca bu cihazda (AsyncStorage) tutulur; sunucuya hiçbir şey gitmez.
 * Sunucudaki kuralların aynısını uygular: işletme sınırı, tekil telefon/plaka, tekrar kayıt engeli,
 * sunucuda tutar hesabı, durum geçişleri, sürüm kontrolü, silinmeyen onay geçmişi.
 *
 * Müşteri tarafını aynı cihazda denemek için: müşteri e-postası DEMO_CUSTOMER_EMAIL yazılırsa kayıt,
 * bireysel moddaki "Servis kayıtlarım" ekranına düşer. Gerçek sürümde eşleşme müşterinin kendi hesabıyla yapılır.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  computeServiceTotals,
  localDate,
  nextServiceStatus,
  validateExpense,
  type BusinessExpense,
  normalizePlate,
  paidKurus,
  validateServiceItem,
  type Business,
  type BusinessCustomer,
  type BusinessVehicle,
  type ServiceFile,
  type ServiceItem,
  type ServicePayment,
  type ServiceRecord,
  type ServiceRecordStatus,
  type ServiceResponse,
  type ServiceStatusChange,
} from '@piston/core';

import { RepoError } from './repo';
import { serviceError } from './service-errors';
import { ALLOWED_MIME, MAX_FILE_BYTES, type NewBusiness, type NewBusinessVehicle, type ExpensePatch, type NewCustomer, type NewExpense, type NewPayment, type PendingFile, type ServiceRecordDraft, type ServiceRepo } from './service-repo';

export const DEMO_CUSTOMER_EMAIL = 'demo@pistongarage.app';
const KEY = 'piston-servis-demo-v1';

interface StoredRecord {
  id: string;
  businessId: string;
  customerId: string;
  vehicleId: string;
  clientRequestId: string;
  status: ServiceRecordStatus;
  approvalVersion: number;
  intakeAt: string;
  odometerKm: number;
  complaint: string;
  initialNote: string | null;
  fuelLevel: ServiceRecord['fuelLevel'];
  existingDamage: string | null;
  vatRate: number | null;
  items: ServiceItem[];
  files: ServiceFile[];
  responses: ServiceResponse[];
  history: ServiceStatusChange[];
  /** Eski demo verisinde yok olabilir */
  payments?: (ServicePayment & { clientRequestId: string })[];
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

interface AuditEntry {
  recordId: string;
  at: string;
  before: unknown;
  after: unknown;
}

interface State {
  businesses: Omit<Business, 'role'>[];
  customers: BusinessCustomer[];
  vehicles: BusinessVehicle[];
  records: StoredRecord[];
  audit: AuditEntry[];
  expenses: (BusinessExpense & { businessId: string; clientRequestId: string })[];
}

const empty = (): State => ({ businesses: [], customers: [], vehicles: [], records: [], audit: [], expenses: [] });
const id = () => Crypto.randomUUID();
const now = () => new Date().toISOString();

export class ServiceDemoRepo implements ServiceRepo {
  readonly mode = 'demo' as const;
  private state: State | null = null;

  private async load(): Promise<State> {
    if (this.state) return this.state;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      this.state = raw ? { ...empty(), ...(JSON.parse(raw) as State) } : empty();
    } catch {
      this.state = empty();
    }
    return this.state;
  }

  private async save() {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Depolama kapalıysa demo bellek içinde çalışmaya devam eder
    }
  }

  /** Demo hesabı silindiğinde işletme verisi de silinir */
  async reset() {
    this.state = empty();
    await this.save();
  }

  private biz(s: State, businessId: string) {
    const b = s.businesses.find((x) => x.id === businessId);
    if (!b) throw serviceError('FORBIDDEN');
    return b;
  }

  private writable(s: State, businessId: string) {
    const b = this.biz(s, businessId);
    if (b.status === 'suspended' || b.status === 'incomplete') throw serviceError('BUSINESS_SUSPENDED');
  }

  private view(s: State, stored: StoredRecord): ServiceRecord {
    // Ekrana her zaman yeni bir kopya verilir: depodaki diziler yerinde değiştiği için aynı referans
    // verilirse React (React Compiler önbelleği) değişikliği görmez.
    const r = JSON.parse(JSON.stringify(stored)) as StoredRecord;
    const b = this.biz(s, r.businessId);
    const c = s.customers.find((x) => x.id === r.customerId);
    const v = s.vehicles.find((x) => x.id === r.vehicleId);
    return {
      id: r.id, businessId: r.businessId, businessName: b.name, businessVerified: b.status === 'active',
      customerId: r.customerId, customerName: c?.fullName ?? '', customerPhone: c?.phone ?? '',
      vehicleId: r.vehicleId, plate: v?.plate ?? '', vehicleLabel: v ? [v.make, v.model, v.modelYear].filter(Boolean).join(' ') : '',
      status: r.status, approvalVersion: r.approvalVersion, intakeAt: r.intakeAt, odometerKm: r.odometerKm,
      complaint: r.complaint, initialNote: r.initialNote, fuelLevel: r.fuelLevel, existingDamage: r.existingDamage,
      items: r.items, files: r.files, totals: computeServiceTotals(r.items, r.vatRate),
      responses: r.responses, history: r.history, createdAt: r.createdAt, updatedAt: r.updatedAt, approvedAt: r.approvedAt,
      payments: (r.payments ?? []).map(({ clientRequestId: _c, ...p }) => p),
    };
  }

  // ---------------- İşletme ----------------

  async listMyBusinesses(): Promise<Business[]> {
    const s = await this.load();
    return s.businesses.map((b) => ({ ...b, role: 'owner' as const })); // yeni nesneler (yerinde değişiklik ekrana yansısın)
  }

  async createBusiness(input: NewBusiness): Promise<Business> {
    const s = await this.load();
    if (s.businesses.length >= 3) throw serviceError('BUSINESS_LIMIT');
    const b = { id: id(), ...input, logoUrl: null, status: 'pending_verification' as const, createdAt: now() };
    s.businesses.push(b);
    await this.save();
    return { ...b, role: 'owner' };
  }

  async updateBusiness(businessId: string, input: NewBusiness) {
    const s = await this.load();
    const b = this.biz(s, businessId);
    Object.assign(b, input);
    await this.save();
  }

  // ---------------- Müşteri ve araç ----------------

  async listCustomers(businessId: string) {
    const s = await this.load();
    return s.customers.filter((c) => c.businessId === businessId).map((c) => ({ ...c })).sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
  }

  async addCustomer(input: NewCustomer) {
    const s = await this.load();
    this.writable(s, input.businessId);
    if (s.customers.some((c) => c.businessId === input.businessId && c.phone === input.phone)) throw serviceError('DUPLICATE_PHONE');
    const c: BusinessCustomer = { id: id(), ...input, email: input.email?.toLowerCase() ?? null, createdAt: now() };
    s.customers.push(c);
    await this.save();
    return c;
  }

  async listVehicles(businessId: string) {
    const s = await this.load();
    return s.vehicles.filter((v) => v.businessId === businessId).map((v) => ({ ...v })).sort((a, b) => a.plate.localeCompare(b.plate));
  }

  async addVehicle(input: NewBusinessVehicle) {
    const s = await this.load();
    this.writable(s, input.businessId);
    const plate = normalizePlate(input.plate);
    if (s.vehicles.some((v) => v.businessId === input.businessId && v.plate === plate)) throw serviceError('DUPLICATE_PLATE');
    if (!s.customers.some((c) => c.id === input.customerId && c.businessId === input.businessId)) throw serviceError('VEHICLE_CUSTOMER_MISMATCH');
    const v: BusinessVehicle = {
      id: id(), businessId: input.businessId, customerId: input.customerId, plate, make: input.make.trim(), model: input.model.trim(),
      modelYear: input.modelYear, engineLabel: input.engineLabel, lastOdometerKm: input.odometerKm, createdAt: now(),
    };
    s.vehicles.push(v);
    await this.save();
    return v;
  }

  // ---------------- Servis kaydı ----------------

  async listRecords(businessId: string) {
    const s = await this.load();
    this.biz(s, businessId);
    return s.records.filter((r) => r.businessId === businessId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => this.view(s, r));
  }

  async getRecord(recordId: string) {
    const s = await this.load();
    const r = s.records.find((x) => x.id === recordId);
    if (!r) throw serviceError('NOT_FOUND');
    return this.view(s, r);
  }

  async saveRecord(d: ServiceRecordDraft): Promise<string> {
    const s = await this.load();
    if (d.items.length === 0) throw serviceError('ITEMS_REQUIRED');
    if (d.items.length > 50) throw serviceError('ITEMS_TOO_MANY');
    for (const i of d.items) {
      const err = validateServiceItem(i);
      if (err) throw new RepoError('INVALID', err);
    }
    if (d.complaint.trim().length < 2) throw new RepoError('INVALID', 'Müşterinin şikâyetini yaz.');
    const items: ServiceItem[] = d.items.map((i) => ({ ...i, id: id() }));
    const t = now();

    if (!d.id) {
      this.writable(s, d.businessId);
      const existing = s.records.find((r) => r.businessId === d.businessId && r.clientRequestId === d.clientRequestId);
      if (existing) return existing.id;
      const v = s.vehicles.find((x) => x.id === d.vehicleId && x.businessId === d.businessId);
      if (!v || v.customerId !== d.customerId) throw serviceError('VEHICLE_CUSTOMER_MISMATCH');
      const r: StoredRecord = {
        id: id(), businessId: d.businessId, customerId: d.customerId, vehicleId: d.vehicleId, clientRequestId: d.clientRequestId,
        status: 'awaiting_approval', approvalVersion: 1, intakeAt: d.intakeAt, odometerKm: d.odometerKm, complaint: d.complaint.trim(),
        initialNote: d.initialNote, fuelLevel: d.fuelLevel, existingDamage: d.existingDamage, vatRate: d.vatRate, items,
        files: [], responses: [], history: [{ status: 'awaiting_approval', at: t, by: 'business' }], createdAt: t, updatedAt: t, approvedAt: null,
      };
      s.records.push(r);
      v.lastOdometerKm = Math.max(v.lastOdometerKm ?? 0, d.odometerKm);
      s.audit.push({ recordId: r.id, at: t, before: null, after: r });
      await this.save();
      return r.id;
    }

    const r = s.records.find((x) => x.id === d.id);
    if (!r) throw serviceError('NOT_FOUND');
    this.writable(s, r.businessId);
    const next = nextServiceStatus(r.status, 'edit');
    if (!next) throw serviceError('RECORD_LOCKED');
    const before = JSON.parse(JSON.stringify(r)) as StoredRecord;
    Object.assign(r, {
      intakeAt: d.intakeAt, odometerKm: d.odometerKm, complaint: d.complaint.trim(), initialNote: d.initialNote,
      fuelLevel: d.fuelLevel, existingDamage: d.existingDamage, vatRate: d.vatRate, items,
      status: next, approvalVersion: r.approvalVersion + 1, approvedAt: null, updatedAt: t,
    });
    if (next !== before.status) r.history.push({ status: next, at: t, by: 'business' });
    s.audit.push({ recordId: r.id, at: t, before, after: JSON.parse(JSON.stringify(r)) });
    await this.save();
    return r.id;
  }

  async addFiles(businessId: string, recordId: string, files: PendingFile[]) {
    const s = await this.load();
    const r = s.records.find((x) => x.id === recordId && x.businessId === businessId);
    if (!r) throw serviceError('NOT_FOUND');
    for (const f of files) {
      if (f.sizeBytes > MAX_FILE_BYTES) throw serviceError('FILE_TOO_LARGE');
      if (!(ALLOWED_MIME as readonly string[]).includes(f.mimeType)) throw serviceError('FILE_TYPE');
    }
    r.files.push(...files.map((f) => ({ id: id(), kind: f.kind, url: f.uri, mimeType: f.mimeType, sizeBytes: f.sizeBytes })));
    await this.save();
  }

  async completeRecord(recordId: string) {
    const s = await this.load();
    const r = s.records.find((x) => x.id === recordId);
    if (!r) throw serviceError('NOT_FOUND');
    const next = nextServiceStatus(r.status, 'complete');
    if (!next) throw serviceError('STATUS_INVALID');
    r.status = next;
    r.updatedAt = now();
    r.history.push({ status: next, at: r.updatedAt, by: 'business' });
    await this.save();
  }

  // ---------------- Tahsilat ----------------

  async addPayment(p: NewPayment) {
    const s = await this.load();
    const r = s.records.find((x) => x.id === p.recordId);
    if (!r) throw serviceError('NOT_FOUND');
    this.writable(s, r.businessId);
    const list = (r.payments ??= []);
    if (list.some((x) => x.clientRequestId === p.clientRequestId)) return;
    if (p.paidAt && new Date(p.paidAt).getTime() > Date.now() + 3600_000) throw serviceError('PAID_AT_FUTURE');
    const grand = computeServiceTotals(r.items, r.vatRate).grandKurus;
    if (!Number.isInteger(p.amountKurus) || p.amountKurus <= 0 || paidKurus(list) + p.amountKurus > grand) throw serviceError('OVERPAYMENT');
    list.push({
      id: id(), amountKurus: p.amountKurus, method: p.method, paidAt: p.paidAt ?? now(), note: p.note?.trim() || null,
      voidedAt: null, voidReason: null, clientRequestId: p.clientRequestId,
    });
    s.audit.push({ recordId: r.id, at: now(), before: null, after: { payment: list[list.length - 1] } });
    await this.save();
  }

  async voidPayment(paymentId: string, reason: string) {
    const s = await this.load();
    for (const r of s.records) {
      const p = r.payments?.find((x) => x.id === paymentId);
      if (!p) continue;
      if (p.voidedAt) throw serviceError('ALREADY_VOIDED');
      if (reason.trim().length < 3) throw new RepoError('REASON_REQUIRED', 'İptal sebebini yaz.');
      const before = { ...p };
      p.voidedAt = now();
      p.voidReason = reason.trim();
      s.audit.push({ recordId: r.id, at: now(), before, after: { ...p } });
      await this.save();
      return;
    }
    throw serviceError('NOT_FOUND');
  }

  // ---------------- Giderler ----------------

  private checkExpense(x: ExpensePatch) {
    const e = validateExpense(x.amountKurus, x.spentOn, x.description ?? '', localDate(new Date()));
    if (e.date && x.spentOn > localDate(new Date())) throw serviceError('EXPENSE_DATE_FUTURE');
    const first = e.amount ?? e.date ?? e.description;
    if (first) throw new RepoError('INVALID', first);
  }

  async listExpenses(businessId: string): Promise<BusinessExpense[]> {
    const s = await this.load();
    this.biz(s, businessId);
    return s.expenses.filter((x) => x.businessId === businessId)
      .map(({ businessId: _b, clientRequestId: _c, ...x }) => ({ ...x }))
      .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt));
  }

  async addExpense(x: NewExpense) {
    const s = await this.load();
    this.writable(s, x.businessId);
    if (s.expenses.some((e) => e.businessId === x.businessId && e.clientRequestId === x.clientRequestId)) return;
    this.checkExpense(x);
    const row = { id: id(), businessId: x.businessId, clientRequestId: x.clientRequestId, amountKurus: x.amountKurus, description: x.description?.trim() || null, spentOn: x.spentOn, createdAt: now() };
    s.expenses.push(row);
    s.audit.push({ recordId: row.id, at: now(), before: null, after: { expense: { ...row } } });
    await this.save();
  }

  async updateExpense(expenseId: string, x: ExpensePatch) {
    const s = await this.load();
    const row = s.expenses.find((e) => e.id === expenseId);
    if (!row) throw serviceError('NOT_FOUND');
    this.writable(s, row.businessId);
    this.checkExpense(x);
    const before = { ...row };
    Object.assign(row, { amountKurus: x.amountKurus, description: x.description?.trim() || null, spentOn: x.spentOn });
    s.audit.push({ recordId: row.id, at: now(), before: { expense: before }, after: { expense: { ...row } } });
    await this.save();
  }

  async deleteExpense(expenseId: string) {
    const s = await this.load();
    const i = s.expenses.findIndex((e) => e.id === expenseId);
    if (i < 0) throw serviceError('NOT_FOUND');
    const [row] = s.expenses.splice(i, 1);
    s.audit.push({ recordId: expenseId, at: now(), before: { expense: row }, after: null });
    await this.save();
  }

  // ---------------- Müşteri tarafı ----------------

  private isMine(s: State, r: StoredRecord) {
    return s.customers.find((c) => c.id === r.customerId)?.email === DEMO_CUSTOMER_EMAIL;
  }

  async myRecords() {
    const s = await this.load();
    return s.records.filter((r) => this.isMine(s, r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => this.view(s, r));
  }

  async respond(recordId: string, version: number, action: 'approved' | 'objected', reason: string | null) {
    const s = await this.load();
    const r = s.records.find((x) => x.id === recordId);
    if (!r || !this.isMine(s, r)) throw serviceError('FORBIDDEN');
    const next = nextServiceStatus(r.status, action === 'approved' ? 'approve' : 'object');
    if (!next) throw serviceError('STATUS_INVALID');
    if (r.approvalVersion !== version) throw serviceError('VERSION_CHANGED');
    if (action === 'objected' && (reason ?? '').trim().length < 5) throw serviceError('REASON_REQUIRED');
    const t = now();
    r.responses.push({ id: id(), version, action, reason: reason?.trim() || null, via: 'app', at: t });
    r.status = next;
    r.approvedAt = next === 'approved' ? t : null;
    r.history.push({ status: next, at: t, by: 'customer' });
    await this.save();
  }
}
