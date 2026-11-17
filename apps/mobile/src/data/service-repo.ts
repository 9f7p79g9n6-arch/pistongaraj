/**
 * PISTON SERVİS veri katmanı sözleşmesi. Bireysel taraftaki GarageRepo'dan ayrıdır; ekranlar yalnızca bunu kullanır.
 * Demo ve Supabase uygulamaları aynı kuralları uygular (tutar hesabı, durum geçişleri, tekrar kayıt engeli).
 */
import type {
  Business,
  BusinessExpense,
  BusinessCategory,
  BusinessCustomer,
  BusinessVehicle,
  FuelLevel,
  PaymentMethod,
  ServiceFileKind,
  ServiceItemInput,
  ServiceRecord,
} from '@piston/core';

export interface NewBusiness {
  name: string;
  contactName: string;
  /** +90 ile başlayan, normalleştirilmiş */
  phone: string;
  email: string | null;
  city: string;
  district: string;
  address: string;
  category: BusinessCategory;
  taxOffice: string | null;
  taxNumber: string | null;
}

export interface NewCustomer {
  businessId: string;
  fullName: string;
  phone: string;
  email: string | null;
}

export interface NewBusinessVehicle {
  businessId: string;
  customerId: string;
  plate: string;
  make: string;
  model: string;
  modelYear: number | null;
  engineLabel: string | null;
  odometerKm: number | null;
}

export interface PendingFile {
  uri: string;
  kind: ServiceFileKind;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
}

export interface ServiceRecordDraft {
  /** Düzenlemede dolu */
  id?: string;
  businessId: string;
  customerId: string;
  vehicleId: string;
  /** Sihirbaz açıldığında üretilir; aynı istek iki kez gönderilirse ikinci kayıt açılmaz */
  clientRequestId: string;
  intakeAt: string;
  odometerKm: number;
  complaint: string;
  initialNote: string | null;
  fuelLevel: FuelLevel | null;
  existingDamage: string | null;
  vatRate: number | null;
  items: ServiceItemInput[];
}

export interface NewPayment {
  recordId: string;
  amountKurus: number;
  method: PaymentMethod;
  /** null: şimdi */
  paidAt: string | null;
  note: string | null;
  /** Aynı ödeme iki kez gönderilirse ikinci kayıt açılmaz */
  clientRequestId: string;
}

export interface ExpensePatch {
  amountKurus: number;
  description: string | null;
  /** YYYY-MM-DD */
  spentOn: string;
}

export interface NewExpense extends ExpensePatch {
  businessId: string;
  /** Aynı gider iki kez gönderilirse ikinci kayıt açılmaz */
  clientRequestId: string;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'] as const;

export interface ServiceRepo {
  readonly mode: 'demo' | 'supabase';

  // İşletme
  listMyBusinesses(): Promise<Business[]>;
  createBusiness(input: NewBusiness): Promise<Business>;
  /**
   * İşletmeyi siler (yalnızca sahip; işletme adı yazılarak onaylanır). Veriler yasal saklama için sunucuda kalır
   * ama uygulamadan kimse erişemez; işletmenin forum içeriği kaldırılır.
   */
  deleteBusiness(businessId: string, confirmName: string): Promise<void>;
  updateBusiness(id: string, input: NewBusiness): Promise<void>;

  // Müşteri ve araç (yalnızca işletmenin kendi kayıtları)
  listCustomers(businessId: string): Promise<BusinessCustomer[]>;
  addCustomer(input: NewCustomer): Promise<BusinessCustomer>;
  listVehicles(businessId: string): Promise<BusinessVehicle[]>;
  addVehicle(input: NewBusinessVehicle): Promise<BusinessVehicle>;

  // Servis kaydı
  listRecords(businessId: string): Promise<ServiceRecord[]>;
  getRecord(id: string): Promise<ServiceRecord>;
  /** Kaydı ve kalemlerini tek işlemde yazar; tutarlar sunucuda hesaplanır. Kayıt kimliğini döndürür. */
  saveRecord(draft: ServiceRecordDraft): Promise<string>;
  addFiles(businessId: string, recordId: string, files: PendingFile[]): Promise<void>;
  /**
   * Kaydın PDF'ini sunucuya yükler ve müşteriye gönderilecek süreli (30 gün), tahmin edilemez bağlantıyı döner.
   * Demo sürümde sunucu olmadığı için null döner.
   */
  recordPdfLink(businessId: string, recordId: string, pdfUri: string): Promise<string | null>;
  /** Müşteri onayı gerekmez; açık kayıt tamamlanır ve ciroya girer */
  completeRecord(id: string): Promise<void>;
  /** Kayıt saklanır ama listelerden, müşteri görünümünden ve rapordan çıkar. Alınmış ödemesi varsa silinmez. */
  deleteRecord(id: string, reason: string | null): Promise<void>;

  // Tahsilat (ödeme silinmez; yanlışsa sebebiyle iptal edilir)
  addPayment(input: NewPayment): Promise<void>;
  voidPayment(paymentId: string, reason: string): Promise<void>;

  // Giderler (yalnızca tutar, açıklama, tarih). Düzenleme ve silmenin eski hâli denetim kaydında saklanır.
  listExpenses(businessId: string): Promise<BusinessExpense[]>;
  addExpense(input: NewExpense): Promise<void>;
  updateExpense(id: string, input: ExpensePatch): Promise<void>;
  deleteExpense(id: string): Promise<void>;

  // Müşteri tarafı (bireysel kullanıcı)
  myRecords(): Promise<ServiceRecord[]>;
  respond(recordId: string, version: number, action: 'approved' | 'objected', reason: string | null): Promise<void>;
}
