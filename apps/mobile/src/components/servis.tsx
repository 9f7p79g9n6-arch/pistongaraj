/**
 * PISTON SERVİS ortak bileşenleri: durum etiketi, kayıt kartı, tutar dökümü, işlem listesi.
 * Hem işletme ekranlarında hem müşterinin onay ekranında kullanılır; müşteri ve işletme aynı dökümü görür.
 */
import {
  formatDate,
  formatKm,
  formatKurus,
  FUEL_LEVEL_LABEL,
  itemGrossKurus,
  SERVICE_FILE_KIND_LABEL,
  SERVICE_STATUS_LABEL,
  type ServiceItemInput,
  type ServiceRecord,
  type ServiceRecordStatus,
  type ServiceTotals,
} from '@piston/core';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { colors, space } from '@/constants/theme';
import { DEMO_CUSTOMER_EMAIL } from '@/data/service-demo-repo';
import { env } from '@/lib/env';
import { Icon, type IconName } from './icons';
import { Card, Divider, Muted, Pill, Row, Stack, Text, useAccent, type Tone } from './ui';

export const STATUS_TONE: Record<ServiceRecordStatus, Tone> = {
  awaiting_approval: 'warn',
  revised: 'warn',
  approved: 'ok',
  completed: 'ok',
  objected: 'bad',
};

export function StatusPill({ status }: { status: ServiceRecordStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{SERVICE_STATUS_LABEL[status]}</Pill>;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${formatDate(local)} ${hh}:${mm}`;
}

/** Listede bir servis kaydı */
export function RecordCard({ r, onPress, showCustomer = true }: { r: ServiceRecord; onPress: () => void; showCustomer?: boolean }) {
  return (
    <Card onPress={onPress} style={{ gap: 6 }} accessibilityLabel={`${r.plate} servis kaydı, ${SERVICE_STATUS_LABEL[r.status]}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="bodyStrong" style={{ letterSpacing: 1 }}>{r.plate}</Text>
        <StatusPill status={r.status} />
      </Row>
      <Muted small>{[r.vehicleLabel, showCustomer ? r.customerName : r.businessName].filter(Boolean).join(' · ')}</Muted>
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted small>{formatDateTime(r.intakeAt)}</Muted>
        <Text v="smallStrong">{formatKurus(r.totals.grandKurus)}</Text>
      </Row>
    </Card>
  );
}

function Line({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text v={strong ? 'bodyStrong' : 'body'} color={color ?? (strong ? colors.text : colors.textMuted)}>{label}</Text>
      <Text v={strong ? 'bodyStrong' : 'body'} color={color} style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
    </Row>
  );
}

/** Parça ve işçilik ayrı; indirim KDV'den önce; KDV oranı ve tutarı açık */
export function TotalsCard({ totals }: { totals: ServiceTotals }) {
  return (
    <Card style={{ gap: space.sm }}>
      <Line label="Parça toplamı" value={formatKurus(totals.partsKurus)} />
      <Line label="İşçilik toplamı" value={formatKurus(totals.laborKurus)} />
      <Line label="Ara toplam" value={formatKurus(totals.subtotalKurus)} />
      {totals.discountKurus > 0 && <Line label="İndirim" value={`−${formatKurus(totals.discountKurus)}`} color={colors.warn} />}
      {totals.vatRate != null ? (
        <Line label={`KDV (%${totals.vatRate})`} value={formatKurus(totals.vatKurus)} />
      ) : (
        <Line label="KDV" value="Uygulanmadı" />
      )}
      <Divider />
      <Line label="Genel toplam" value={formatKurus(totals.grandKurus)} strong />
      <Muted small>Bu döküm bilgilendirme amaçlıdır; fatura veya vergi belgesi yerine geçmez.</Muted>
    </Card>
  );
}

export function ItemsList({ items, onPress }: { items: (ServiceItemInput & { id?: string })[]; onPress?: (index: number) => void }) {
  if (items.length === 0) return <Muted small>Henüz işlem eklenmedi.</Muted>;
  return (
    <Stack gap={space.sm}>
      {items.map((i, idx) => {
        const parts = i.partQty * i.partUnitKurus;
        const body = (
          <Card style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text v="bodyStrong" style={{ flex: 1 }}>{i.title}</Text>
              <Text v="bodyStrong">{formatKurus(itemGrossKurus(i) - Math.min(i.discountKurus, itemGrossKurus(i)))}</Text>
            </Row>
            {i.description ? <Muted small>{i.description}</Muted> : null}
            {i.partQty > 0 && <Muted small>{`Parça: ${i.partName} × ${i.partQty} = ${formatKurus(parts)}`}</Muted>}
            {i.laborKurus > 0 && <Muted small>{`İşçilik: ${formatKurus(i.laborKurus)}`}</Muted>}
            {i.discountKurus > 0 && <Text v="small" color={colors.warn}>{`İndirim: −${formatKurus(i.discountKurus)}`}</Text>}
          </Card>
        );
        return onPress ? (
          <Pressable key={i.id ?? idx} onPress={() => onPress(idx)} accessibilityRole="button" accessibilityLabel={`${i.title} işlemini düzenle`}>
            {body}
          </Pressable>
        ) : <View key={i.id ?? idx}>{body}</View>;
      })}
    </Stack>
  );
}

/** Kaydın araç kabul bilgileri */
export function IntakeCard({ r }: { r: ServiceRecord }) {
  return (
    <Card style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="title" style={{ letterSpacing: 1 }}>{r.plate}</Text>
        <StatusPill status={r.status} />
      </Row>
      <Muted>{r.vehicleLabel}</Muted>
      <Muted small>{`Kabul: ${formatDateTime(r.intakeAt)} · ${formatKm(r.odometerKm)}`}</Muted>
      {r.fuelLevel ? <Muted small>{`Yakıt seviyesi: ${FUEL_LEVEL_LABEL[r.fuelLevel]}`}</Muted> : null}
      <Divider />
      <Text v="smallStrong">Müşterinin şikâyeti</Text>
      <Text>{r.complaint}</Text>
      {r.initialNote ? (<><Text v="smallStrong">İlk gözlem</Text><Text>{r.initialNote}</Text></>) : null}
      {r.existingDamage ? (<><Text v="smallStrong">Teslimde görülen hasarlar</Text><Text>{r.existingDamage}</Text></>) : null}
    </Card>
  );
}

export function FilesGrid({ files }: { files: ServiceRecord['files'] }) {
  if (files.length === 0) return <Muted small>Fotoğraf veya belge eklenmedi.</Muted>;
  return (
    <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
      {files.map((f) => (
        <View key={f.id} style={{ width: 104, gap: 4 }}>
          {f.mimeType.startsWith('image/') ? (
            <Image source={{ uri: f.url }} style={{ width: 104, height: 104, borderRadius: 12, backgroundColor: colors.surface }} contentFit="cover"
              accessibilityLabel={SERVICE_FILE_KIND_LABEL[f.kind]} />
          ) : (
            <View style={{ width: 104, height: 104, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="doc" size={28} color={colors.textMuted} />
            </View>
          )}
          <Muted small>{SERVICE_FILE_KIND_LABEL[f.kind]}</Muted>
        </View>
      ))}
    </Row>
  );
}

/** Onay ve itiraz geçmişi (silinmez) */
export function ResponsesList({ r }: { r: ServiceRecord }) {
  if (r.responses.length === 0) return <Muted small>Müşteri henüz yanıt vermedi.</Muted>;
  return (
    <Stack gap={space.sm}>
      {r.responses.map((a) => (
        <Card key={a.id} style={{ gap: 4, borderColor: a.action === 'objected' ? colors.danger : 'transparent' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pill tone={a.action === 'approved' ? 'ok' : 'bad'}>{a.action === 'approved' ? 'Onaylandı' : 'İtiraz'}</Pill>
            <Muted small>{`${formatDateTime(a.at)} · sürüm ${a.version}`}</Muted>
          </Row>
          {a.reason ? <Text>{a.reason}</Text> : null}
        </Card>
      ))}
    </Stack>
  );
}

export function HistoryList({ r }: { r: ServiceRecord }) {
  return (
    <Stack gap={6}>
      {r.history.map((h, i) => (
        <Row key={i} style={{ justifyContent: 'space-between' }}>
          <Text v="small">{SERVICE_STATUS_LABEL[h.status]}</Text>
          <Muted small>{`${h.by === 'customer' ? 'Müşteri' : 'İşletme'} · ${formatDateTime(h.at)}`}</Muted>
        </Row>
      ))}
    </Stack>
  );
}

/** Ana panelin büyük, kolay dokunulan eylem düğmesi */
export function BigAction({ title, subtitle, icon, onPress, primary }: { title: string; subtitle?: string; icon: IconName; onPress: () => void; primary?: boolean }) {
  const a = useAccent();
  const fg = primary ? a.onFill : colors.text;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [{
        minHeight: primary ? 76 : 60, borderRadius: 18, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md,
        backgroundColor: primary ? a.fill : colors.card, borderWidth: primary ? 0 : 1, borderColor: colors.line,
      }, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={primary ? 28 : 22} color={fg} />
      <View style={{ flex: 1 }}>
        <Text v={primary ? 'title' : 'section'} color={fg}>{title}</Text>
        {subtitle ? <Text v="small" color={primary ? fg : colors.textMuted}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Sayaç kutusu (dokunulabilir) */
export function CountTile({ label, value, tone, onPress }: { label: string; value: number; tone?: 'warn' | 'bad' | 'ok'; onPress?: () => void }) {
  const color = tone === 'warn' ? colors.warn : tone === 'bad' ? colors.danger : tone === 'ok' ? colors.neon : colors.text;
  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: 140, gap: 2 }} accessibilityLabel={`${label}: ${value}`}>
      <Text v="number" color={value > 0 ? color : colors.text}>{String(value)}</Text>
      <Muted small>{label}</Muted>
    </Card>
  );
}

/** Müşteri e-postasının ne işe yaradığı (demo ve gerçek sürümde farklı) */
export function CustomerEmailHint() {
  return (
    <Muted small>
      {env.isDemo
        ? `Demo: müşteri ekranını bu cihazda denemek için e-posta olarak ${DEMO_CUSTOMER_EMAIL} yaz; kayıt bireysel moddaki "Servis kayıtlarım" ekranına düşer.`
        : 'Müşteri bu e-postayla PISTON GARAGE hesabı açtıysa, servis kaydını kendi uygulamasında görür ve onaylar.'}
    </Muted>
  );
}

export function NextStageCard({ title, stage, body }: { title: string; stage: string; body: string }): ReactNode {
  return (
    <Card style={{ gap: 4, opacity: 0.8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="bodyStrong">{title}</Text>
        <Pill tone="neutral">{stage}</Pill>
      </Row>
      <Muted small>{body}</Muted>
    </Card>
  );
}
