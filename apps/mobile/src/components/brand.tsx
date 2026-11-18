/**
 * Marka parçaları: logo (değişmez yeşil "P" + koyu yazı), koyu özel kart ve 2 sütunlu hızlı erişim kutusu.
 */
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadow, space } from '@/constants/theme';
import { Icon, type IconName } from './icons';
import { Pill, Text } from './ui';

/** OTOM logosu. Logo rengi markanın kendisidir; açık temada da aynen kalır.
 *  onGreen: logo yeşili zemin üzerinde; yeşil kare kaybolmasın diye ince koyu çerçeve alır. */
export function Logo({ size = 30, wordmark = true, sub, onGreen }: { size?: number; wordmark?: boolean; sub?: string; onGreen?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityRole="image" accessibilityLabel={sub ? `OTOM ${sub}` : 'OTOM'}>
      <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: colors.logo, alignItems: 'center', justifyContent: 'center', ...(onGreen ? { borderWidth: 1.5, borderColor: colors.onLogo } : null) }}>
        <Text v="title" color={colors.onLogo} style={{ fontSize: size * 0.62, lineHeight: size * 0.8, fontWeight: '800' }}>O</Text>
      </View>
      {wordmark && (
        <View>
          <Text v="smallStrong" color={colors.text} style={{ letterSpacing: 2, fontWeight: '800', fontSize: 14 }}>OTOM</Text>
          {sub ? <Text v="label" color={colors.brandDark} style={{ letterSpacing: 1.5, fontWeight: '700', fontSize: 10, lineHeight: 12 }}>{sub}</Text> : null}
        </View>
      )}
    </View>
  );
}

/** Koyu antrasit öne çıkan kart (tanıtım, hatırlatma). İçindeki metinler beyaz/açık gri. */
export function SpecialCard({ children, style, onPress, accessibilityLabel }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string;
}) {
  const st = [{ backgroundColor: colors.special, borderRadius: radius.lg, padding: 20, overflow: 'hidden' as const }, shadow, style];
  if (!onPress) return <View style={st}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [st, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

/** 2 sütunlu hızlı erişim kutusu. Açılmamış bölüm için `soon` verilir: dokunulamaz ve "Yakında" yazar. */
export function QuickTile({ icon, title, subtitle, onPress, soon, badge }: {
  icon: IconName; title: string; subtitle?: string; onPress?: () => void; soon?: boolean; badge?: number;
}) {
  const disabled = soon || !onPress;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
      accessibilityLabel={[title, subtitle, soon ? 'yakında' : null, badge ? `${badge} yeni` : null].filter(Boolean).join(', ')}
      style={({ pressed }) => [{
        flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.md,
        borderWidth: 1, borderColor: colors.line, minHeight: 112,
      }, shadow, pressed && { opacity: 0.7 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: soon ? colors.surface : '#FDECEE', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={21} color={soon ? colors.iconMuted : colors.brand} />
        </View>
        {soon ? <Pill tone="neutral">Yakında</Pill> : badge ? (
          <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text v="label" color={colors.onBrand} style={{ fontWeight: '700' }}>{String(badge)}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <Text v="bodyStrong" color={soon ? colors.textMuted : colors.text}>{title}</Text>
        {subtitle ? <Text v="small" color={colors.textMuted} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}
