/**
 * Rehber ve teklif bileşenleri: işletme kartı, yıldız puanı, teklif kartı, talep kartı.
 */
import {
  BUSINESS_CATEGORIES,
  formatKurus,
  formatPhoneTR,
  PART_CONDITION_LABEL,
  QUOTE_KIND_LABEL,
  QUOTE_STATUS_LABEL,
  ratingText,
  timeAgoTR,
  type BusinessCategory,
  type PublicBusiness,
  type QuoteOffer,
  type QuoteRequest,
  type QuoteStatus,
} from '@piston/core';
import { Pressable, View } from 'react-native';

import { colors, space } from '@/constants/theme';
import { Icon } from './icons';
import { Card, Muted, Pill, Row, Text, type Tone } from './ui';

export const categoryLabel = (c: BusinessCategory) => BUSINESS_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export const QUOTE_STATUS_TONE: Record<QuoteStatus, Tone> = { open: 'warn', accepted: 'ok', closed: 'neutral' };

/** Yalnızca gösterim: ★★★★☆ */
export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessible accessibilityLabel={`5 üzerinden ${rating.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} v="small" color={i <= Math.round(rating) ? colors.warn : '#D5D9DF'} style={{ fontSize: size, lineHeight: size + 4 }}>★</Text>
      ))}
    </View>
  );
}

/** Puan seçici (1–5) */
export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.xs }} accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(i)} accessibilityRole="radio" accessibilityState={{ checked: value === i }}
          accessibilityLabel={`${i} yıldız`} hitSlop={4}>
          <Text v="display" color={i <= value ? colors.warn : '#D5D9DF'} style={{ fontSize: 34, lineHeight: 40 }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function BusinessCard({ b, onPress, selected, right }: { b: PublicBusiness; onPress: () => void; selected?: boolean; right?: React.ReactNode }) {
  return (
    <Card onPress={onPress} highlight={selected} style={{ gap: 6 }}
      accessibilityLabel={`${b.name}, ${categoryLabel(b.category)}, ${b.district} ${b.city}, ${ratingText(b.ratingAvg, b.ratingCount)}`}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="bodyStrong" numberOfLines={1}>{b.name}</Text>
          <Muted small>{`${categoryLabel(b.category)} · ${b.district} / ${b.city}`}</Muted>
        </View>
        {right ?? <Pill tone="ok">Doğrulandı</Pill>}
      </Row>
      <Row gap={6}>
        {b.ratingCount > 0 && <Stars rating={b.ratingAvg ?? 0} />}
        <Muted small>{ratingText(b.ratingAvg, b.ratingCount)}</Muted>
        {b.workingHours ? <Text v="small" color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>{`· ${b.workingHours}`}</Text> : null}
      </Row>
    </Card>
  );
}

export function OfferCard({ o, kind, accepted, action, showPhone }: {
  o: QuoteOffer; kind: QuoteRequest['kind']; accepted?: boolean; action?: React.ReactNode; showPhone?: boolean;
}) {
  return (
    <Card highlight={accepted} style={{ gap: space.sm }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="bodyStrong">{o.businessName}</Text>
          <Muted small>{`${o.businessCity} · ${timeAgoTR(o.updatedAt)}`}</Muted>
        </View>
        <Text v="number" color={colors.text}>{formatKurus(o.totalKurus)}</Text>
      </Row>
      <View style={{ gap: 2 }}>
        {o.partsKurus > 0 && <Row style={{ justifyContent: 'space-between' }}><Muted small>Parça</Muted><Text v="small">{formatKurus(o.partsKurus)}</Text></Row>}
        {o.laborKurus > 0 && <Row style={{ justifyContent: 'space-between' }}><Muted small>İşçilik</Muted><Text v="small">{formatKurus(o.laborKurus)}</Text></Row>}
        {kind === 'part' && o.partCondition && <Row style={{ justifyContent: 'space-between' }}><Muted small>Parça türü</Muted><Text v="small">{PART_CONDITION_LABEL[o.partCondition]}</Text></Row>}
        {o.eta ? <Row style={{ justifyContent: 'space-between' }}><Muted small>Süre</Muted><Text v="small">{o.eta}</Text></Row> : null}
      </View>
      {o.note ? <Text v="small">{o.note}</Text> : null}
      {accepted && <Pill tone="ok">Kabul ettin</Pill>}
      {showPhone && <Muted small>{`Telefon: ${formatPhoneTR(o.businessPhone)}`}</Muted>}
      {action}
    </Card>
  );
}

export function RequestCard({ r, onPress, badge }: { r: Pick<QuoteRequest, 'kind' | 'title' | 'vehicleLabel' | 'status' | 'createdAt' | 'city'> & { offerCount?: number }; onPress: () => void; badge?: string }) {
  return (
    <Card onPress={onPress} style={{ gap: 6 }} accessibilityLabel={`${r.title}, ${QUOTE_STATUS_LABEL[r.status]}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6}>
          <Pill tone="neutral">{QUOTE_KIND_LABEL[r.kind]}</Pill>
          <Pill tone={QUOTE_STATUS_TONE[r.status]}>{QUOTE_STATUS_LABEL[r.status]}</Pill>
        </Row>
        {badge ? <Pill tone="bad">{badge}</Pill> : null}
      </Row>
      <Text v="bodyStrong">{r.title}</Text>
      <Row gap={6}>
        <Icon name="car" size={14} color={colors.iconMuted} />
        <Muted small style={{ flexShrink: 1 }}>{`${r.vehicleLabel} · ${r.city} · ${timeAgoTR(r.createdAt)}`}</Muted>
      </Row>
      {r.offerCount != null && <Text v="smallStrong" color={r.offerCount > 0 ? colors.brandDark : colors.textMuted}>{r.offerCount > 0 ? `${r.offerCount} teklif geldi` : 'Henüz teklif yok'}</Text>}
    </Card>
  );
}
