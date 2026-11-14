import {
  describeLeft,
  formatDate,
  formatNumber,
  SOURCE_LABEL,
  STATUS_LABEL,
  type DueStatus,
  type FuelType,
  type Transmission,
  type VehicleType,
} from '@piston/core';
import { Image } from 'expo-image';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, space } from '@/constants/theme';
import type { RuleWithDue } from '@/data/store';
import { Icon } from './icons';
import { Card, Muted, Pill, Progress, Row, Text, type Tone } from './ui';

export const FUEL_LABEL: Record<FuelType, string> = {
  gasoline: 'Benzin', diesel: 'Dizel', lpg: 'LPG', gasoline_lpg: 'Benzin + LPG', hybrid: 'Hibrit', plugin_hybrid: 'Şarj edilebilir hibrit', electric: 'Elektrik',
};
export const GEAR_LABEL: Record<Transmission, string> = { manual: 'Manuel', automatic: 'Otomatik', dct: 'Çift kavrama (DCT)', cvt: 'CVT' };
export const TYPE_LABEL: Record<VehicleType, string> = { car: 'Otomobil', commercial: 'Ticari', motorcycle: 'Motosiklet' };
export const STATUS_TONE: Record<DueStatus, Tone> = { overdue: 'bad', due_soon: 'warn', ok: 'ok', unknown: 'neutral' };

/** Araç fotoğrafı yoksa kullanılan çizim */
export function CarArt({ accent = colors.neon, photoUrl, height = 110 }: { accent?: string; photoUrl?: string | null; height?: number }) {
  if (photoUrl)
    return <Image source={{ uri: photoUrl }} style={{ width: '100%', height: height + 30, borderRadius: 14 }} contentFit="cover" accessibilityLabel="Araç fotoğrafı" />;
  return (
    <Svg width="100%" height={height} viewBox="0 0 320 110" accessibilityLabel="Araç çizimi">
      <Defs>
        <LinearGradient id="body" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#4a5361" />
          <Stop offset="1" stopColor="#2a3039" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={160} cy={98} rx={140} ry={7} fill="#0d0f12" opacity={0.7} />
      <Path d="M22 78 C22 66 30 60 46 57 L92 50 C108 34 128 24 160 22 L206 22 C230 23 246 32 262 48 L290 54 C302 57 306 64 306 74 L306 80 C306 84 303 86 299 86 L28 86 C24 86 22 83 22 78Z" fill="url(#body)" />
      <Path d="M104 50 C118 36 134 30 160 29 L200 29 C220 30 234 38 246 50Z" fill="#1b1f25" />
      <Path d="M176 29 L176 50" stroke="#2c323c" strokeWidth={3} />
      <Path d="M28 70 L62 66" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      <Path d="M286 62 L302 66" stroke={colors.danger} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
      <Circle cx={82} cy={86} r={19} fill="#111317" />
      <Circle cx={82} cy={86} r={10} fill="#3a414c" />
      <Circle cx={246} cy={86} r={19} fill="#111317" />
      <Circle cx={246} cy={86} r={10} fill="#3a414c" />
    </Svg>
  );
}

export function intervalText(r: RuleWithDue['rule']): string {
  if (r.kind === 'due_date') return r.dueOn ? `Son tarih ${formatDate(r.dueOn)}` : 'Tarih yok';
  const parts: string[] = [];
  if (r.everyKm) parts.push(`her ${formatNumber(r.everyKm)} km`);
  if (r.everyMonths) parts.push(r.everyMonths % 12 === 0 ? `${r.everyMonths / 12} yıl` : `${r.everyMonths} ay`);
  return parts.join(' veya ');
}

export function MaintenanceCard({ item, onPress, showSource = true }: { item: RuleWithDue; onPress?: () => void; showSource?: boolean }) {
  const { rule, due } = item;
  const tone = STATUS_TONE[due.status];
  return (
    <Card onPress={onPress} accessibilityLabel={`${rule.title}, ${STATUS_LABEL[due.status]}, ${describeLeft(due.kmLeft, due.daysLeft)}`}>
      <Row>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={rule.kind === 'due_date' ? 'shield' : rule.itemKey.includes('oil') ? 'oil' : 'gear'} size={19} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{rule.title}</Text>
            <Pill tone={tone}>{STATUS_LABEL[due.status]}</Pill>
          </Row>
          <Muted small>{describeLeft(due.kmLeft, due.daysLeft)}</Muted>
        </View>
      </Row>
      <View style={{ marginTop: space.md }}>
        <Progress ratio={due.usedRatio} tone={tone} />
      </View>
      {showSource && (
        <Muted small style={{ marginTop: space.sm }}>
          {intervalText(rule)} · Kaynak: {SOURCE_LABEL[rule.source]}
        </Muted>
      )}
    </Card>
  );
}
