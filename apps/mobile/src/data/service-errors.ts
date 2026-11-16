/** PISTON SERVİS hata kodları → kullanıcıya gösterilecek metin. Kodlar sunucudaki exception adlarıyla aynıdır. */
import { RepoError } from './repo';

export const SERVICE_MESSAGES: Record<string, string> = {
  BUSINESS_LIMIT: 'Bir hesapla en fazla 3 işletme açılabilir.',
  BUSINESS_SUSPENDED: 'İşletme hesabı askıya alındığı için yeni kayıt açılamıyor.',
  DUPLICATE_PHONE: 'Bu telefon numarasıyla kayıtlı bir müşteri zaten var. Listeden seç.',
  DUPLICATE_PLATE: 'Bu plaka zaten kayıtlı. Araç listesinden seç.',
  ITEMS_REQUIRED: 'En az bir işlem ekle.',
  ITEMS_TOO_MANY: 'Bir kayıtta en fazla 50 işlem olabilir.',
  VEHICLE_CUSTOMER_MISMATCH: 'Seçilen araç bu müşteriye ait değil.',
  RECORD_LOCKED: 'Tamamlanan kayıt değiştirilemez.',
  STATUS_INVALID: 'Kaydın durumu değişmiş. Sayfayı yenileyip tekrar dene.',
  VERSION_CHANGED: 'İşletme kaydı sen bakarken güncelledi. Yeni hâlini görüp tekrar karar ver.',
  REASON_REQUIRED: 'İtiraz sebebini en az 5 karakterle yaz.',
  RATE_LIMIT: 'Bugün çok fazla kayıt açıldı. Yarın tekrar dene ya da destek ile iletişime geç.',
  FORBIDDEN: 'Bu işlem için yetkin yok.',
  NOT_FOUND: 'Kayıt bulunamadı.',
  FILE_TOO_LARGE: 'Dosya en fazla 10 MB olabilir.',
  FILE_TYPE: 'Yalnızca JPEG, PNG fotoğraf ve PDF belge eklenebilir.',
};

export function serviceError(code: keyof typeof SERVICE_MESSAGES | string): RepoError {
  return new RepoError(code, SERVICE_MESSAGES[code] ?? 'İşlem tamamlanamadı. Tekrar dene.');
}
