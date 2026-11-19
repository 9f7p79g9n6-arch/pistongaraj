/**
 * Ortak arayüz bileşenleri. Ekranlar renk ve ölçüyü doğrudan değil, bu bileşenler üzerinden kullanır.
 */
import { router } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch as RNSwitch,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACCENT_PERSONAL, brandShadow, colors, MAX_WIDTH, radius, shadow, space, type, type Accent } from '@/constants/theme';
import { env } from '@/lib/env';
import { Icon, type IconName } from './icons';

type Variant = keyof typeof type;

/** Vurgu rengi bağlamı. Varsayılan bireysel mod (yeşil); OTOM SERVİS kendi bölümünü kırmızı ile sarar. */
const AccentCtx = createContext<Accent>(ACCENT_PERSONAL);
export function AccentProvider({ value, children }: { value: Accent; children: ReactNode }) {
  return <AccentCtx.Provider value={value}>{children}</AccentCtx.Provider>;
}
export function useAccent(): Accent {
  return useContext(AccentCtx);
}

export function Text({ v = 'body', color, style, children, ...rest }: { v?: Variant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode } & React.ComponentProps<typeof RNText>) {
  return (
    <RNText style={[type[v], { color: color ?? (v === 'label' ? colors.textMuted : colors.text) }, style]} {...rest}>
      {children}
    </RNText>
  );
}

export function Muted(props: { children: ReactNode; small?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text v={props.small ? 'small' : 'body'} color={colors.textMuted} style={props.style}>{props.children}</Text>;
}

export function DemoBadge() {
  if (!env.isDemo) return null;
  return (
    <View style={s.demo} accessibilityLabel="Demo modu: veriler yalnızca bu cihazda">
      <Text v="label" color={colors.text} style={{ fontSize: 11, fontWeight: '700' }}>DEMO</Text>
    </View>
  );
}

/**
 * Kaydırılabilir ekran iskeleti: güvenli alan, başlık, geri düğmesi.
 * band: ekranın üstünde, durum çubuğunun altına kadar uzanan logo yeşili şerit (ana sayfa logosu için).
 */
export function Screen({ title, back, right, children, scroll = true, footer, band }: {
  title?: string; back?: boolean; right?: ReactNode; children: ReactNode; scroll?: boolean; footer?: ReactNode; band?: ReactNode;
}) {
  // Sekme çubuğu olmayan ekranlarda alttaki ana ekran çizgisine (iPhone) düğme denk gelmesin
  const { bottom, top } = useSafeAreaInsets();
  const header = (title || back || right) && (
    <View style={s.header}>
      <View style={s.row}>
        {back && (
          <IconButton icon="back" label="Geri" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        )}
        {title ? <Text v="title" style={{ flexShrink: 1 }} accessibilityRole="header">{title}</Text> : null}
      </View>
      <View style={s.row}>
        <DemoBadge />
        {right}
      </View>
    </View>
  );
  return (
    <SafeAreaView style={s.screen} edges={band ? ['left', 'right'] : ['top', 'left', 'right']}>
      {band ? (
        <View style={[s.band, { paddingTop: top + space.sm }]}>
          <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>{band}</View>
        </View>
      ) : null}
      <KeyboardAvoidingView style={s.inner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header}
        {scroll ? (
          <ScrollView contentContainerStyle={[s.scroll, !footer && { paddingBottom: 40 + bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={!footer}>
            {children}
          </ScrollView>
        ) : (
          <View style={[s.scroll, { flex: 1 }]}>{children}</View>
        )}
        {footer ? <View style={[s.footer, { paddingBottom: Math.max(space.lg, bottom) }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, highlight, accessibilityLabel }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; highlight?: boolean; accessibilityLabel?: string;
}) {
  const accent = useAccent();
  const st = [s.card, highlight && { borderColor: accent.fill }, style];
  if (!onPress) return <InRowCtx.Provider value={false}><View style={st}>{children}</View></InRowCtx.Provider>;
  return (
    <InRowCtx.Provider value={false}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [st, pressed && s.pressed]}>
        {children}
      </Pressable>
    </InRowCtx.Provider>
  );
}

export function Button({ title, onPress, variant = 'secondary', loading, disabled, icon, small, style }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'; loading?: boolean;
  disabled?: boolean; icon?: IconName; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const accent = useAccent();
  const bg = { primary: accent.fill, secondary: colors.surface, outline: colors.card, ghost: 'transparent', danger: colors.danger }[variant];
  const fg = variant === 'primary' ? accent.onFill : variant === 'danger' ? colors.onBrand : variant === 'outline' ? accent.text : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg },
        variant === 'primary' && !small && brandShadow,
        variant === 'outline' && { borderWidth: 1, borderColor: accent.fill },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.line },
        (disabled || loading) && { opacity: 0.5 },
        pressed && (variant === 'primary' ? { backgroundColor: colors.brandDark } : s.pressed),
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={[s.row, { gap: space.sm }]}>
          {icon && <Icon name={icon} size={18} color={fg} />}
          <Text v={small ? 'smallStrong' : 'button'} color={fg}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, accent, dot }: { icon: IconName; label: string; onPress: () => void; accent?: boolean; dot?: boolean }) {
  const a = useAccent();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => [s.iconBtn, accent && { backgroundColor: a.fill }, pressed && s.pressed]}>
      <Icon name={icon} size={20} color={accent ? a.onFill : colors.text} />
      {dot && <View style={[s.dot, { backgroundColor: a.fill }]} />}
    </Pressable>
  );
}

export function Field({ label, error, hint, ...input }: { label: string; error?: string | null; hint?: string } & TextInputProps) {
  const [focus, setFocus] = useState(false);
  const accent = useAccent();
  const inRow = useContext(InRowCtx);
  return (
    <View style={[{ gap: 6 }, inRow && { flex: 1 }]}>
      <Text v="smallStrong" color={colors.text}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.iconMuted}
        accessibilityLabel={label}
        {...input}
        onFocus={(e) => { setFocus(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); input.onBlur?.(e); }}
        style={[s.input, focus && { borderColor: accent.fill }, !!error && { borderColor: colors.danger }, input.style]}
      />
      {error ? <Text v="small" color={colors.danger}>{error}</Text> : hint ? <Muted small>{hint}</Muted> : null}
    </View>
  );
}

/**
 * Field yan yana (Row içinde) kullanılınca alanları eşit genişliğe yaymak için flex:1 alır. Alt alta (Stack, Card,
 * ekran) kullanılınca almaz; aksi hâlde farklı yükseklikteki alanlar (çok satırlı, hata yazılı) eşit yüksekliğe sıkışır.
 */
const InRowCtx = createContext(false);
/** Row içinde mi (alan yan yana eşit genişliğe yayılsın diye) */
export const useInRow = () => useContext(InRowCtx);

export function Row({ children, gap = space.md, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <InRowCtx.Provider value><View style={[s.row, { gap }, style]}>{children}</View></InRowCtx.Provider>;
}

export function Stack({ children, gap = space.md, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <InRowCtx.Provider value={false}><View style={[{ gap }, style]}>{children}</View></InRowCtx.Provider>;
}

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: ReactNode }) {
  const accent = useAccent();
  return (
    <View style={{ gap: space.md, marginTop: space.xl }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text v="section" accessibilityRole="header">{title}</Text>
        {action && onAction && (
          <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
            <Text v="smallStrong" color={accent.text}>{action}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

const PILL = {
  ok: { bg: '#E3F3EB', fg: '#1E7D53', bar: colors.success },
  warn: { bg: '#FDF1DC', fg: colors.warnText, bar: colors.warn },
  bad: { bg: '#FBE6E7', fg: colors.danger, bar: colors.danger },
  info: { bg: '#E3EDF8', fg: colors.info, bar: colors.info },
  neutral: { bg: colors.surface, fg: colors.textMuted, bar: colors.iconMuted },
};
export type Tone = keyof typeof PILL;

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <View style={[s.pill, { backgroundColor: PILL[tone].bg }]}>
      <Text v="label" color={PILL[tone].fg} style={{ fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

export function Progress({ ratio, tone }: { ratio: number; tone: Tone }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <View style={[s.barFill, { width: `${pct}%`, backgroundColor: PILL[tone].bar }]} />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const accent = useAccent();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [s.chip, selected && { borderColor: accent.fill, backgroundColor: '#FDECEE' }, pressed && s.pressed]}>
      <Text v="smallStrong" color={selected ? accent.text : colors.text}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.seg} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Pressable key={o.value} disabled={o.disabled} onPress={() => onChange(o.value)} accessibilityRole="radio"
          accessibilityState={{ checked: value === o.value, disabled: !!o.disabled }}
          style={[s.segItem, value === o.value && [{ backgroundColor: colors.card }, shadow], o.disabled && { opacity: 0.4 }]}>
          <Text v="smallStrong" color={value === o.value ? colors.text : colors.textMuted} style={{ textAlign: 'center' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const accent = useAccent();
  return (
    <View style={[s.row, { justifyContent: 'space-between', paddingVertical: space.sm }]}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <Text v="bodyStrong">{label}</Text>
        {hint ? <Muted small>{hint}</Muted> : null}
      </View>
      <RNSwitch value={value} onValueChange={onChange} accessibilityLabel={label}
        trackColor={{ false: '#D5D9DF', true: accent.fill }} thumbColor="#FFFFFF"
        ios_backgroundColor="#D5D9DF"
        {...({ activeThumbColor: accent.onFill, activeTrackColor: accent.fill } as object)} />
    </View>
  );
}

export function ListItem({ icon, title, subtitle, right, onPress, danger }: {
  icon?: IconName; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; danger?: boolean;
}) {
  const content = (
    <View style={[s.row, { paddingVertical: space.md, gap: space.md }]}>
      {icon && <View style={s.ic}><Icon name={icon} size={18} color={danger ? colors.danger : colors.text} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text v="bodyStrong" color={danger ? colors.danger : colors.text} numberOfLines={1}>{title}</Text>
        {subtitle ? <Muted small>{subtitle}</Muted> : null}
      </View>
      {right ?? (onPress ? <Icon name="chev" size={16} color={colors.iconMuted} /> : null)}
    </View>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && s.pressed}>{content}</Pressable>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />;
}

export function Empty({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.sm }}>
      <Text v="bodyStrong">{title}</Text>
      <Muted small style={{ textAlign: 'center' }}>{body}</Muted>
      {action && onAction && <Button title={action} onPress={onAction} variant="primary" small style={{ marginTop: space.sm }} />}
    </Card>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text v="smallStrong" color={colors.danger} accessibilityLiveRegion="polite">{children}</Text>;
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <Muted small>{label}</Muted>
      <Text v="number">{value}</Text>
      {note ? <Muted small>{note}</Muted> : null}
    </Card>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  band: { backgroundColor: colors.logo, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.logoLine },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: space.md },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 40 },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.line, ...shadow },
  pressed: { opacity: 0.7 },
  btn: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 38, paddingHorizontal: space.md, borderRadius: 11 },
  iconBtn: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 8, right: 9, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.surface, backgroundColor: colors.brand },
  input: { backgroundColor: colors.card, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontSize: 16, borderWidth: 1, borderColor: '#D5D9DF' },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  bar: { height: 6, borderRadius: 6, backgroundColor: colors.surface, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.sm, padding: 3 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 9 },
  ic: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  demo: { backgroundColor: '#FDF1DC', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
});
