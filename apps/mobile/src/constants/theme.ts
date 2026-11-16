/**
 * PISTON GARAGE tasarım sistemi. Bütün ekranlar renk, yazı ve ölçüleri buradan alır.
 * Açık tema: beyaz ve açık gri yüzeyler, koyu antrasit yazı, ölçülü kırmızı marka vurgusu.
 * Kural: kırmızı yalnızca birincil aksiyon, aktif sekme/menü, bildirim ve marka vurgusu içindir.
 */
import { Platform } from 'react-native';

export const colors = {
  /** Ana arka plan */
  bg: '#F3F4F6',
  /** Kart arka planı */
  card: '#FFFFFF',
  /** İkincil kart, giriş alanı ve ikincil düğme zemini */
  surface: '#E9ECF0',
  /** Çizgi ve kenarlık */
  line: '#E3E6EA',
  /** Ana yazı (koyu antrasit) */
  text: '#242930',
  /** İkincil yazı */
  textMuted: '#737B85',
  /** Pasif ikon */
  iconMuted: '#929AA5',
  /** Marka kırmızısı (düğme, aktif durum, bildirim) */
  brand: '#E53945',
  /** Koyu kırmızı: beyaz zeminde kırmızı metin ve basılı durum */
  brandDark: '#C62835',
  onBrand: '#FFFFFF',
  success: '#269B68',
  warn: '#F0A52B',
  /** Uyarı rengi metin olarak beyaz zeminde okunmaz; uyarı metinleri bu koyu tonu kullanır */
  warnText: '#965F05',
  danger: '#D9363E',
  info: '#2F6FB5',
  /** Koyu özel alan (tanıtım ve öne çıkan kartlar) */
  special: '#20252B',
  onSpecial: '#FFFFFF',
  onSpecialMuted: '#B4BAC2',
  tabBar: '#FFFFFF',
  /** Grafikte nötr seri */
  neutral: '#7B838E',
  /** Logo rengi (değişmez): yeşil kare üzerinde koyu "P" */
  logo: '#B6F000',
  onLogo: '#17191D',
} as const;

/**
 * Vurgu rengi. Bireysel mod ve PISTON SERVİS aynı marka kırmızısını kullanır.
 * fill: düğme zemini (üzerindeki metin `onFill`), text: beyaz/açık zeminde kırmızı metin.
 */
export interface Accent { fill: string; onFill: string; text: string }
export const ACCENT_PERSONAL: Accent = { fill: colors.brand, onFill: colors.onBrand, text: colors.brandDark };
export const ACCENT_SERVIS: Accent = ACCENT_PERSONAL;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 12, md: 14, lg: 20, pill: 999 } as const;

/** Kartların hafif ve doğal gölgesi */
export const shadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(36,41,48,0.04), 0 4px 14px rgba(36,41,48,0.06)' },
  android: { elevation: 2 },
  default: { shadowColor: '#242930', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
}) as object;

/** Birincil düğmenin kırmızı gölgesi */
export const brandShadow = Platform.select({
  web: { boxShadow: '0 4px 12px rgba(229,57,69,0.25)' },
  android: { elevation: 3 },
  default: { shadowColor: colors.brand, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
}) as object;

/** iOS'ta SF Pro (System), Android'de Roboto, web'de sistem yazı tipi */
const font = Platform.select({ ios: 'System', android: undefined, default: 'system-ui, -apple-system, "Segoe UI", Inter, Roboto, sans-serif' });
const f = font ? { fontFamily: font } : {};

/** Yazı ölçeği: gövde metni en az 15 pt, rahat satır aralığı. */
export const type = {
  display: { ...f, fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.3 },
  title: { ...f, fontSize: 22, lineHeight: 28, fontWeight: '600' as const, letterSpacing: -0.2 },
  section: { ...f, fontSize: 17, lineHeight: 23, fontWeight: '600' as const },
  body: { ...f, fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { ...f, fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  button: { ...f, fontSize: 16, lineHeight: 21, fontWeight: '600' as const },
  small: { ...f, fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  smallStrong: { ...f, fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  label: { ...f, fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.2 },
  number: { ...f, fontSize: 22, lineHeight: 28, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
} as const;

/** Grafik serileri: beyaz zeminde renk körlüğü ve kontrast kontrolünden geçti (dataviz doğrulayıcı) */
export const chart = { a: '#D63A45', b: '#2F6FB5', other: '#7B838E' } as const;

export const MAX_WIDTH = 560;
