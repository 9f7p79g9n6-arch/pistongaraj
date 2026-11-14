/**
 * PISTON GARAGE tasarım sistemi. Bütün ekranlar renk ve ölçüleri buradan alır.
 * Kural: neon yeşil yalnızca birincil aksiyon ve önemli vurgu içindir.
 */
import { Platform } from 'react-native';

export const colors = {
  bg: '#17191D',
  card: '#252B35',
  surface: '#303640',
  line: '#3A414C',
  text: '#F4F5F6',
  textMuted: '#A3AAB4',
  neon: '#B6F000',
  onNeon: '#17191D',
  warn: '#FFB547',
  danger: '#FF6B5E',
  info: '#7CC4FF',
  tabBar: '#1B1E23',
  // Grafikte üçüncü seri için nötr ton
  neutral: '#6B7380',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;

const display = Platform.select({ ios: 'System', android: 'sans-serif-condensed', default: 'system-ui' });

/** Yazı ölçeği: erişilebilirlik için gövde metni en az 15 pt. */
export const type = {
  display: { fontFamily: display, fontSize: 28, lineHeight: 32, fontWeight: '700' as const, letterSpacing: 0.2 },
  title: { fontFamily: display, fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  section: { fontSize: 16, lineHeight: 22, fontWeight: '700' as const, letterSpacing: 0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 1.1, textTransform: 'uppercase' as const },
  number: { fontFamily: display, fontSize: 22, lineHeight: 26, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
} as const;

export const MAX_WIDTH = 560;
