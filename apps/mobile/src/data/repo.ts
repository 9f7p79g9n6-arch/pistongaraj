import type {
  DetectedLight,
  ExpenseRecord,
  FuelRecord,
  MaintenanceEvent,
  MaintenanceRule,
  Plan,
  TrafficFine,
  Vehicle,
} from '@piston/core';

export type NewVehicle = Omit<Vehicle, 'id' | 'createdAt' | 'vinMasked' | 'photoUrl'> & {
  vin: string | null;
  photoUri: string | null;
};
export type VehiclePatch = Partial<Pick<Vehicle, 'odometerKm' | 'plate' | 'make' | 'model' | 'modelYear' | 'engineLabel' | 'fuelType' | 'transmission' | 'vehicleType'>>;
export type NewRule = Omit<MaintenanceRule, 'id'>;
export type NewEvent = Omit<MaintenanceEvent, 'id' | 'hasDocument'>;
export type NewFuel = Omit<FuelRecord, 'id'>;
export type NewExpense = Omit<ExpenseRecord, 'id'>;
export type NewFine = Omit<TrafficFine, 'id' | 'paidOn' | 'paidAmount'>;

export type ConsentType = 'kvkk_notice' | 'marketing' | 'analytics' | 'ai_processing' | 'terms';

export interface Account {
  userId: string;
  email: string | null;
  plan: Plan;
  displayName: string | null;
  /** Kullanıcının kendi telefonu (+90…). Teklif kabul edilince işletmeye gösterilir; kayıt eşleşmesinde kullanılmaz. */
  phone: string | null;
  /** Yönetici (işletme doğrulama, forum şikâyetleri) */
  isAdmin: boolean;
}

export interface LightIdentification {
  quality: 'ok' | 'blurry' | 'too_dark' | 'glare' | 'no_dashboard';
  lights: DetectedLight[];
  remaining: number | null;
  limit: number | null;
  /** Demo modunda sabit örnek sonuç döner; ekranda belirtilir */
  isDemoSample: boolean;
}

export interface LightRequest {
  imageBase64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  vehicle: { make: string; model: string; year: string; fuel: string } | null;
  note: string;
}

export interface VehicleBundle {
  rules: MaintenanceRule[];
  events: MaintenanceEvent[];
  fuel: FuelRecord[];
  expenses: ExpenseRecord[];
  fines: TrafficFine[];
}

/** Kullanıcıya gösterilebilir hata. `code` sunucudaki hata adlarıyla eşleşir. */
export class RepoError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Veri katmanı sözleşmesi. Ekranlar yalnızca bunu kullanır; Supabase ve demo uygulamaları
 * aynı sözleşmeyi yerine getirir. Böylece demo ortamı gerçek akışın birebir aynısıdır.
 */
export interface GarageRepo {
  readonly mode: 'demo' | 'supabase';

  // Oturum
  getAccount(): Promise<Account | null>;
  /** Profildeki telefon numarası (null: kaldır). Teklif kabul edilince işletmeye gösterilir. */
  updateMyPhone(phoneE164: string | null): Promise<void>;
  onAuthChange(cb: () => void): () => void;
  requestEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  startDemo(): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  recordConsent(consent: ConsentType, granted: boolean, textVersion: string): Promise<void>;
  /** Bu metin sürümü için en son verilen onay "evet" mi */
  hasConsent(consent: ConsentType, textVersion: string): Promise<boolean>;

  // Garaj
  listVehicles(): Promise<Vehicle[]>;
  addVehicle(input: NewVehicle): Promise<Vehicle>;
  updateVehicle(id: string, patch: VehiclePatch): Promise<void>;
  archiveVehicle(id: string): Promise<void>;
  loadBundle(vehicleId: string): Promise<VehicleBundle>;

  // Bakım
  upsertRule(rule: NewRule & { id?: string }): Promise<void>;
  deleteRule(id: string): Promise<void>;
  addEvent(event: NewEvent): Promise<void>;

  // Yakıt ve masraf
  addFuel(record: NewFuel): Promise<void>;
  deleteFuel(id: string): Promise<void>;
  addExpense(record: NewExpense): Promise<void>;
  deleteExpense(id: string): Promise<void>;

  // Trafik cezası
  addFine(fine: NewFine): Promise<void>;
  /** Ödendi olarak işaretler ve tutarı "Ceza" masrafı olarak yıllık giderlere ekler */
  payFine(id: string, paidOn: string, paidAmount: number): Promise<void>;
  deleteFine(id: string): Promise<void>;

  // Gösterge ışığı tanıma (yapay zekâ)
  identifyWarningLights(req: LightRequest): Promise<LightIdentification>;
  aiQuota(): Promise<{ used: number; limit: number } | null>;

  // Bildirim
  registerPushToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<void>;
}
