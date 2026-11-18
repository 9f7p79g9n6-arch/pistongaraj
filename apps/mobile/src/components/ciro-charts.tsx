/**
 * OTOM CİRO grafikleri. Sade, tek eksenli; değer bir sütuna dokununca görünür.
 * Renkler beyaz zeminde renk körlüğü ve kontrast kontrolünden geçti (dataviz doğrulayıcı):
 *   SERIES_A (ciro / parça / bu ay), SERIES_B (gider / işçilik / geçen ay). Değerler theme.ts > chart.
 * Rakamlar her zaman metin rengiyle yazılır; renk yalnızca işaretin kimliğini taşır.
 */
import { formatKurus, formatNumber, type SeriesPoint } from '@piston/core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg';

import { chart, colors, space } from '@/constants/theme';
import { Muted, Row, Stack, Text } from './ui';

export const SERIES_A = chart.a;
export const SERIES_B = chart.b;

function niceStep(max: number): number {
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
/** Eksen etiketi: 12.500 ₺ → "12,5b" */
const shortTL = (kurus: number) => {
  const tl = kurus / 100;
  if (tl >= 1_000_000) return `${formatNumber(tl / 1_000_000, 1)}m`;
  if (tl >= 1000) return `${formatNumber(tl / 1000, tl % 1000 ? 1 : 0)}b`;
  return formatNumber(tl);
};

/** Üstü 4 px yuvarlatılmış, tabana oturan sütun */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <Row gap={space.lg} style={{ flexWrap: 'wrap' }}>
      {items.map((i) => (
        <Row key={i.label} gap={6}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: i.color }} />
          <Muted small>{i.label}</Muted>
        </Row>
      ))}
    </Row>
  );
}

/** Tek seri sütun grafiği. Başlık seriyi adlandırdığı için gösterge kutusu yok. */
export function BarChart({ points, pick, color, emptyText, summary }: {
  points: SeriesPoint[];
  pick: (p: SeriesPoint) => number;
  color: string;
  emptyText: string;
  /** Erişilebilirlik ve tablo görünümü için kısa açıklama başı */
  summary: string;
}) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const vals = points.map(pick);
  const max = Math.max(0, ...vals);
  const H = 150, pl = 40, pb = 20, pt = 10;
  if (max === 0) return <Muted small>{emptyText}</Muted>;
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => H - pb - (v / top) * (H - pb - pt);
  const plotW = Math.max(0, w - pl);
  const slot = points.length ? plotW / points.length : 0;
  const bw = Math.max(2, Math.min(28, slot - 2)); // sütunlar arası en az 2 px boşluk
  const ticks: number[] = [];
  for (let t = 0; t <= top + 0.5; t += step) ticks.push(t);
  // Çok sütunda etiketleri seyrelt (en fazla ~10 etiket)
  const every = Math.max(1, Math.ceil(points.length / 10));
  const shown = sel ?? vals.lastIndexOf(max);
  const a11y = `${summary}: ` + points.map((p, i) => `${p.label} ${formatKurus(vals[i]!)}`).join(', ');

  return (
    <Stack gap={space.sm}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted small>{sel == null ? 'En yüksek' : points[sel]!.label}</Muted>
        <Text v="smallStrong">{formatKurus(vals[shown] ?? 0)}</Text>
      </Row>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel={a11y} style={{ height: H }}>
        {w > 0 && (
          <>
            <Svg width={w} height={H}>
              {ticks.map((t) => (
                <Line key={`g${t}`} x1={pl} x2={w} y1={y(t)} y2={y(t)} stroke={colors.surface} strokeWidth={1} />
              ))}
              {ticks.map((t) => (
                <SvgText key={`t${t}`} x={pl - 6} y={y(t) + 4} fill={colors.textMuted} fontSize={10} textAnchor="end">{shortTL(t)}</SvgText>
              ))}
              {points.map((p, i) => {
                const v = vals[i]!;
                const x = pl + i * slot + (slot - bw) / 2;
                const h = (H - pb) - y(v);
                return (
                  <G key={p.key}>
                    {v > 0 && <Path d={barPath(x, y(v), bw, h)} fill={color} opacity={sel == null || sel === i ? 1 : 0.45} />}
                    {i % every === 0 && (
                      <SvgText x={x + bw / 2} y={H - 5} fill={colors.textMuted} fontSize={10} textAnchor="middle">{p.label}</SvgText>
                    )}
                  </G>
                );
              })}
            </Svg>
            {/* Dokunma alanları sütundan geniş: tüm dilim */}
            <View style={{ position: 'absolute', left: pl, top: 0, right: 0, bottom: pb, flexDirection: 'row' }}>
              {points.map((p, i) => (
                <Pressable key={p.key} style={{ flex: 1 }} onPress={() => setSel(sel === i ? null : i)}
                  accessibilityRole="button" accessibilityLabel={`${p.label}: ${formatKurus(vals[i]!)}`} />
              ))}
            </View>
          </>
        )}
      </View>
    </Stack>
  );
}

/** İki parçalı yatay çubuk: parça ve işçilik geliri dağılımı (doğrudan etiketli) */
export function SplitBar({ a, b }: { a: { label: string; kurus: number }; b: { label: string; kurus: number } }) {
  const total = a.kurus + b.kurus;
  if (total <= 0) return <Muted small>Bu dönemde tamamlanan servis yok.</Muted>;
  const pa = Math.round((a.kurus / total) * 100);
  return (
    <Stack gap={space.sm}>
      <View style={{ flexDirection: 'row', height: 14, gap: 2 }} accessible
        accessibilityLabel={`${a.label} yüzde ${pa}, ${b.label} yüzde ${100 - pa}`}>
        {a.kurus > 0 && <View style={{ flex: a.kurus, backgroundColor: SERIES_A, borderRadius: 4 }} />}
        {b.kurus > 0 && <View style={{ flex: b.kurus, backgroundColor: SERIES_B, borderRadius: 4 }} />}
      </View>
      <Legend items={[{ label: `${a.label} · %${pa} · ${formatKurus(a.kurus)}`, color: SERIES_A }, { label: `${b.label} · %${100 - pa} · ${formatKurus(b.kurus)}`, color: SERIES_B }]} />
    </Stack>
  );
}

/** Bu ay ↔ geçen ay (aynı günlere kadar): ciro, gider, işletme sonucu */
export function CompareBars({ rows, currentLabel, previousLabel }: {
  rows: { label: string; current: number; previous: number }[];
  currentLabel: string;
  previousLabel: string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.current), Math.abs(r.previous)]));
  const bar = (v: number, color: string) => (
    <Row gap={space.sm}>
      <View style={{ flex: 1, height: 10, justifyContent: 'center' }}>
        <View style={{ width: `${Math.max(1, (Math.abs(v) / max) * 100)}%`, height: 10, borderRadius: 4, backgroundColor: color, opacity: v < 0 ? 0.55 : 1 }} />
      </View>
      <Text v="small" style={{ minWidth: 104, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{v < 0 ? `−${formatKurus(-v)}` : formatKurus(v)}</Text>
    </Row>
  );
  return (
    <Stack gap={space.md}>
      <Legend items={[{ label: currentLabel, color: SERIES_A }, { label: previousLabel, color: SERIES_B }]} />
      {rows.map((r) => (
        <Stack key={r.label} gap={4} >
          <Text v="smallStrong">{r.label}</Text>
          {bar(r.current, SERIES_A)}
          {bar(r.previous, SERIES_B)}
        </Stack>
      ))}
      <Muted small>Soluk çubuk eksi (zarar) değeri gösterir.</Muted>
    </Stack>
  );
}
