import { addMonths, daysBetween, type ISODate } from './dates';
import type { MaintenanceRule } from './types';

export type DueStatus = 'overdue' | 'due_soon' | 'ok' | 'unknown';

export interface DueInfo {
  status: DueStatus;
  /** Bir sonraki bakımın kilometresi (km tabanlı kural yoksa null) */
  nextDueKm: number | null;
  /** Bir sonraki bakımın tarihi (tarih tabanlı kural yoksa null) */
  nextDueOn: ISODate | null;
  kmLeft: number | null;
  daysLeft: number | null;
  /** 0..1+ arası; aralığın ne kadarının kullanıldığı (ilerleme çubuğu için) */
  usedRatio: number;
}

/**
 * Bir bakım kuralının durumunu hesaplar. "Hangisi önce dolarsa" mantığı:
 * km veya tarih koşullarından biri gecikmişse gecikmiş, biri hatırlatma eşiğindeyse yaklaşıyor.
 *
 * Bu fonksiyon `supabase/migrations` içindeki `maintenance_due` görünümüyle aynı sonucu üretmelidir;
 * ikisi aynı test vakalarıyla doğrulanır.
 */
export function computeDue(rule: MaintenanceRule, odometerKm: number, today: ISODate): DueInfo {
  let nextDueKm: number | null = null;
  let nextDueOn: ISODate | null = null;
  let usedRatio = 0;

  if (rule.kind === 'due_date') {
    nextDueOn = rule.dueOn;
  } else {
    if (rule.everyKm != null && rule.lastDoneKm != null) {
      nextDueKm = rule.lastDoneKm + rule.everyKm;
      usedRatio = Math.max(usedRatio, (odometerKm - rule.lastDoneKm) / rule.everyKm);
    }
    if (rule.everyMonths != null && rule.lastDoneOn != null) {
      nextDueOn = addMonths(rule.lastDoneOn, rule.everyMonths);
      const span = daysBetween(rule.lastDoneOn, nextDueOn);
      if (span > 0) usedRatio = Math.max(usedRatio, daysBetween(rule.lastDoneOn, today) / span);
    }
  }

  const kmLeft = nextDueKm != null ? nextDueKm - odometerKm : null;
  const daysLeft = nextDueOn != null ? daysBetween(today, nextDueOn) : null;

  if (rule.kind === 'due_date' && daysLeft != null) {
    // Tarih kurallarında ilerleme: hatırlatma penceresinin ne kadarı geçti
    const window = Math.max(rule.remindBeforeDays, 1) * 4;
    usedRatio = Math.min(1, Math.max(0, 1 - daysLeft / window));
  }

  let status: DueStatus;
  if (kmLeft == null && daysLeft == null) status = 'unknown';
  else if ((kmLeft != null && kmLeft < 0) || (daysLeft != null && daysLeft < 0)) status = 'overdue';
  else if (
    (kmLeft != null && kmLeft <= rule.remindBeforeKm) ||
    (daysLeft != null && daysLeft <= rule.remindBeforeDays)
  )
    status = 'due_soon';
  else status = 'ok';

  return { status, nextDueKm, nextDueOn, kmLeft, daysLeft, usedRatio: Math.max(0, usedRatio) };
}

const STATUS_ORDER: Record<DueStatus, number> = { overdue: 0, due_soon: 1, ok: 2, unknown: 3 };

/** Önce gecikmişler, sonra yaklaşanlar; aynı gruptakiler aciliyete göre. */
export function sortByUrgency<T extends { due: DueInfo }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => STATUS_ORDER[a.due.status] - STATUS_ORDER[b.due.status] || b.due.usedRatio - a.due.usedRatio,
  );
}

export interface RuleInput {
  kind: MaintenanceRule['kind'];
  title: string;
  everyKm: number | null;
  everyMonths: number | null;
  lastDoneKm: number | null;
  lastDoneOn: ISODate | null;
  dueOn: ISODate | null;
}

/** Kural formunu doğrular; hata mesajlarını kullanıcıya gösterilecek biçimde döndürür. */
export function validateRule(input: RuleInput, odometerKm: number): string[] {
  const errors: string[] = [];
  if (!input.title.trim()) errors.push('Bakım kalemine bir ad ver.');
  if (input.kind === 'due_date') {
    if (!input.dueOn) errors.push('Son tarihi seç.');
    return errors;
  }
  if (input.everyKm == null && input.everyMonths == null)
    errors.push('Kilometre ya da ay olarak en az bir aralık gir.');
  if (input.everyKm != null && (input.everyKm < 500 || input.everyKm > 500_000))
    errors.push('Kilometre aralığı 500 ile 500.000 arasında olmalı.');
  if (input.everyMonths != null && (input.everyMonths < 1 || input.everyMonths > 240))
    errors.push('Ay aralığı 1 ile 240 arasında olmalı.');
  if (input.everyKm != null && input.lastDoneKm == null)
    errors.push('Son yapıldığı kilometreyi gir. Bilmiyorsan bugünkü kilometreyi yaz.');
  if (input.everyMonths != null && input.lastDoneOn == null)
    errors.push('Son yapıldığı tarihi gir.');
  if (input.lastDoneKm != null && input.lastDoneKm > odometerKm)
    errors.push('Son yapıldığı kilometre, aracın güncel kilometresinden büyük olamaz.');
  return errors;
}

/**
 * Takip edilebilecek kalemler. Bilerek varsayılan aralık İÇERMEZ: doğrulanmamış üretici aralığını
 * kesin bilgi gibi sunmamak için aralığı kullanıcı girer. `kind` yalnızca formun biçimini belirler.
 */
export const MAINTENANCE_ITEMS: ReadonlyArray<{ key: string; title: string; kind: MaintenanceRule['kind']; source: MaintenanceRule['source'] }> = [
  { key: 'engine_oil', title: 'Motor yağı', kind: 'interval', source: 'user' },
  { key: 'oil_filter', title: 'Yağ filtresi', kind: 'interval', source: 'user' },
  { key: 'air_filter', title: 'Hava filtresi', kind: 'interval', source: 'user' },
  { key: 'cabin_filter', title: 'Polen filtresi', kind: 'interval', source: 'user' },
  { key: 'fuel_filter', title: 'Yakıt filtresi', kind: 'interval', source: 'user' },
  { key: 'timing_belt', title: 'Triger seti', kind: 'interval', source: 'user' },
  { key: 'brake_pads', title: 'Fren balatası', kind: 'interval', source: 'user' },
  { key: 'brake_discs', title: 'Fren diskleri', kind: 'interval', source: 'user' },
  { key: 'tyres', title: 'Lastikler', kind: 'interval', source: 'user' },
  { key: 'battery', title: 'Akü', kind: 'interval', source: 'user' },
  { key: 'gearbox_oil', title: 'Şanzıman yağı', kind: 'interval', source: 'user' },
  { key: 'inspection', title: 'Araç muayenesi', kind: 'due_date', source: 'legal' },
  { key: 'traffic_insurance', title: 'Trafik sigortası', kind: 'due_date', source: 'legal' },
  { key: 'casco', title: 'Kasko', kind: 'due_date', source: 'user' },
  { key: 'mtv', title: 'MTV taksiti', kind: 'due_date', source: 'legal' },
  { key: 'custom', title: 'Diğer', kind: 'interval', source: 'user' },
];

export const SOURCE_LABEL: Record<MaintenanceRule['source'], string> = {
  user: 'Sizin tanımınız',
  service: 'Servis önerisi',
  manufacturer_verified: 'Üretici (doğrulanmış)',
  legal: 'Belge tarihi',
  seasonal: 'Mevsimsel öneri',
};

export const STATUS_LABEL: Record<DueStatus, string> = {
  overdue: 'Gecikmiş',
  due_soon: 'Yaklaşıyor',
  ok: 'Zamanında',
  unknown: 'Bilgi eksik',
};
