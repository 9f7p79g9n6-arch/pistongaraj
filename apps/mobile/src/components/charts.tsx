import { formatNumber, monthShort, type ConsumptionPoint, type MonthTotals } from '@piston/core';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { chart, colors, space } from '@/constants/theme';
import { Muted, Row, Text } from './ui';

const SERIES = [
  { key: 'fuel' as const, label: 'Yakıt', color: chart.a },
  { key: 'maintenance' as const, label: 'Bakım', color: chart.b },
  { key: 'other' as const, label: 'Diğer', color: chart.other },
];

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
const shortTL = (v: number) => (v >= 1000 ? `${formatNumber(v / 1000, v % 1000 ? 1 : 0)}b` : formatNumber(v));

/** Aylık gider yığılmış sütun grafiği */
export function MonthlyBars({ rows }: { rows: MonthTotals[] }) {
  const [w, setW] = useState(320);
  const H = 160, pl = 36, pb = 22, pt = 8;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => H - pb - (v / top) * (H - pb - pt);
  const bw = (w - pl - 4) / rows.length;
  const ticks: number[] = [];
  for (let t = 0; t <= top + 0.001; t += step) ticks.push(t);
  const label = rows.map((r) => `${monthShort(r.month)} ${formatNumber(r.total)} TL`).join(', ');
  // İlk ölçümden önce (genişlik bilinmezken) çizme
  if (w < 120) return <View style={{ height: H + 24 }} onLayout={(e) => setW(e.nativeEvent.layout.width)} />;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel={`Aylık giderler: ${label}`}>
      <Svg width={w} height={H}>
        {ticks.map((t) => (
          <Line key={`g${t}`} x1={pl} x2={w} y1={y(t)} y2={y(t)} stroke={colors.surface} strokeWidth={1} />
        ))}
        {ticks.map((t) => (
          <SvgText key={`t${t}`} x={pl - 6} y={y(t) + 4} fill={colors.textMuted} fontSize={10} textAnchor="end">{shortTL(t)}</SvgText>
        ))}
        {rows.map((r, i) => {
          const x = pl + i * bw + bw * 0.22;
          const bwid = bw * 0.56;
          let acc = 0;
          return (
            <G key={r.month}>
              {SERIES.map((sr) => {
                const v = r[sr.key];
                if (!v) return null;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return <Rect key={sr.key} x={x} y={y1} width={bwid} height={Math.max(0, y0 - y1 - 1)} rx={2} fill={sr.color} />;
              })}
              <SvgText x={x + bwid / 2} y={H - 6} fill={colors.textMuted} fontSize={10.5} textAnchor="middle">{monthShort(r.month)}</SvgText>
            </G>
          );
        })}
      </Svg>
      <Row gap={space.lg} style={{ marginTop: space.xs }}>
        {SERIES.map((sr) => (
          <Row key={sr.key} gap={6}>
            <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: sr.color }} />
            <Muted small>{sr.label}</Muted>
          </Row>
        ))}
      </Row>
    </View>
  );
}

/** 100 km tüketim çizgi grafiği */
export function ConsumptionLine({ points, unit }: { points: ConsumptionPoint[]; unit: string }) {
  const [w, setW] = useState(320);
  if (points.length < 2)
    return <Muted small>Grafik için en az üç tam depo kaydı gerekir. İlk tam dolum başlangıç noktasıdır.</Muted>;
  const pts = points.slice(-8);
  const H = 130, pl = 36, pb = 20, pt = 14;
  if (w < 120) return <View style={{ height: H + 20 }} onLayout={(e) => setW(e.nativeEvent.layout.width)} />;
  const vals = pts.map((p) => p.per100);
  const lo = Math.floor(Math.min(...vals) * 2) / 2 - 0.5;
  const hi = Math.ceil(Math.max(...vals) * 2) / 2 + 0.5;
  const x = (i: number) => pl + 10 + i * ((w - pl - 26) / (pts.length - 1));
  const y = (v: number) => H - pb - ((v - lo) / (hi - lo)) * (H - pb - pt);
  const line = pts.map((p, i) => `${x(i)},${y(p.per100)}`).join(' ');
  const area = `${x(0)},${H - pb} ${line} ${x(pts.length - 1)},${H - pb}`;
  const last = pts[pts.length - 1]!;
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible
      accessibilityLabel={`Tüketim: ${pts.map((p) => formatNumber(p.per100, 1)).join(', ')} ${unit} / 100 km`}>
      <Svg width={w} height={H}>
        {ticks.map((t) => (
          <Line key={`g${t}`} x1={pl} x2={w} y1={y(t)} y2={y(t)} stroke={colors.surface} strokeWidth={1} />
        ))}
        {ticks.map((t) => (
          <SvgText key={`t${t}`} x={pl - 6} y={y(t) + 4} fill={colors.textMuted} fontSize={10} textAnchor="end">{formatNumber(t, 1)}</SvgText>
        ))}
        <Polygon points={area} fill="rgba(214,58,69,0.08)" />
        <Polyline points={line} fill="none" stroke={chart.a} strokeWidth={2} />
        {pts.map((p, i) => (
          <Circle key={i} cx={x(i)} cy={y(p.per100)} r={i === pts.length - 1 ? 4 : 2.5}
            fill={i === pts.length - 1 ? chart.a : colors.card} stroke={chart.a} strokeWidth={1.5} />
        ))}
        <SvgText x={x(pts.length - 1)} y={y(last.per100) - 9} fill={colors.text} fontSize={11} fontWeight="700" textAnchor="end">
          {formatNumber(last.per100, 2)}
        </SvgText>
      </Svg>
      <Text v="small" color={colors.textMuted}>{unit} / 100 km · son {pts.length} ölçüm</Text>
    </View>
  );
}
