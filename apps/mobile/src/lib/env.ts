/**
 * Ortam ayarları. Supabase adresi ve anahtarı yoksa uygulama DEMO modunda çalışır:
 * veriler yalnızca cihazda tutulur ve ekranda "DEMO" etiketi görünür.
 * Brif kuralı: örnek veriler yalnızca demo ortamında gösterilir.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  isDemo: !url || !anonKey || process.env.EXPO_PUBLIC_DEMO_MODE === '1',
  /**
   * App Store inceleme hesabı: incelemeci e-postaya gelen kodu alamaz. Bu adres girilince kod yerine şifre sorulur.
   * Hesap ve şifresi Supabase panelinde oluşturulur; şifre koda ve depoya yazılmaz (docs/APP-STORE.md).
   */
  reviewEmail: (process.env.EXPO_PUBLIC_REVIEW_EMAIL ?? '').trim().toLowerCase(),
  /** KVKK aydınlatma metninin sürümü; metin değişince artırılır ve kullanıcıdan yeniden onay alınır. */
  kvkkTextVersion: '2026-11-v1',
} as const;
