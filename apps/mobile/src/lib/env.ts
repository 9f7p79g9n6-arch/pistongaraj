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
  /** KVKK aydınlatma metninin sürümü; metin değişince artırılır ve kullanıcıdan yeniden onay alınır. */
  kvkkTextVersion: '2026-11-v1',
} as const;
