/**
 * Trafik idari para cezası takibi.
 *
 * 2918 sayılı Karayolları Trafik Kanunu md. 115'e göre ceza, tebliğ tarihinden itibaren bir ay içinde ödenir;
 * ilk 15 gün içinde ödenirse %25 indirim uygulanır. Süre TEBLİĞ tarihinden başlar (ceza tarihinden değil).
 * Yerinde kesilen cezada tebliğ tarihi ceza tarihidir; posta ya da e-Tebligat ile gelen cezada tebliğ tarihi
 * evrakın teslim alındığı tarihtir.
 *
 * Uygulama gecikme zammını hesaplamaz; yalnızca sürenin geçtiğini söyler. Güncel tutar e-Devlet'ten kontrol edilmelidir.
 */
import { addDays, addMonths, daysBetween, type ISODate } from './dates';

export const FINE_DISCOUNT_DAYS = 15;
export const FINE_DISCOUNT_RATE = 0.25;

export interface TrafficFine {
  id: string;
  vehicleId: string;
  fineDate: ISODate;
  notifiedOn: ISODate;
  amount: number;
  description: string | null;
  paidOn: ISODate | null;
  paidAmount: number | null;
}

export type FineStatus = 'discount' | 'due' | 'overdue' | 'paid';

export interface FineInfo {
  status: FineStatus;
  /** İndirimli ödemenin son günü (dahil) */
  discountUntil: ISODate;
  /** Normal ödemenin son günü (dahil) */
  dueOn: ISODate;
  discountedAmount: number;
  /** İndirim süresinde kalan gün (son gün = 0); süre geçtiyse null */
  daysLeftForDiscount: number | null;
  daysLeftForDue: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Süreler tebliğ gününü takip eden günden başlar; 15 günlük süre tebliğden 15 gün sonra biter.
 * Bir aylık süre tebliğden bir ay sonraki aynı gün biter (ayda o gün yoksa ayın son günü).
 * Sürenin son günü resmî tatile denk gelirse süre uzayabilir; uygulama bunu hesaba katmaz,
 * bu yüzden kullanıcıya her zaman son günü değil, bir önceki günü hedeflemesi önerilir.
 */
export function fineInfo(f: Pick<TrafficFine, 'notifiedOn' | 'amount' | 'paidOn'>, today: ISODate): FineInfo {
  const discountUntil = addDays(f.notifiedOn, FINE_DISCOUNT_DAYS);
  const dueOn = addMonths(f.notifiedOn, 1);
  const discountedAmount = round2(f.amount * (1 - FINE_DISCOUNT_RATE));
  if (f.paidOn) return { status: 'paid', discountUntil, dueOn, discountedAmount, daysLeftForDiscount: null, daysLeftForDue: null };
  const dDisc = daysBetween(today, discountUntil);
  const dDue = daysBetween(today, dueOn);
  const status: FineStatus = dDisc >= 0 ? 'discount' : dDue >= 0 ? 'due' : 'overdue';
  return {
    status, discountUntil, dueOn, discountedAmount,
    daysLeftForDiscount: dDisc >= 0 ? dDisc : null,
    daysLeftForDue: dDue >= 0 ? dDue : null,
  };
}

export interface FineInput {
  fineDate: ISODate | null;
  notifiedOn: ISODate | null;
  amount: number | null;
}

export function validateFine(input: FineInput, today: ISODate): string[] {
  const e: string[] = [];
  if (!input.fineDate) e.push('Ceza tarihini GG.AA.YYYY biçiminde gir.');
  if (!input.notifiedOn) e.push('Tebliğ tarihini GG.AA.YYYY biçiminde gir.');
  if (input.amount == null || !(input.amount > 0) || input.amount > 1_000_000) e.push('Ceza tutarını gir.');
  if (input.fineDate && input.fineDate > today) e.push('Ceza tarihi ileri bir tarih olamaz.');
  if (input.notifiedOn && input.notifiedOn > today) e.push('Tebliğ tarihi ileri bir tarih olamaz.');
  if (input.fineDate && input.notifiedOn && input.notifiedOn < input.fineDate) e.push('Tebliğ tarihi ceza tarihinden önce olamaz.');
  return e;
}

/** Ödenmemiş cezaları en acil olandan sıralar (indirim süresi bitecek olan önce). */
export function sortFines<T extends Pick<TrafficFine, 'notifiedOn' | 'amount' | 'paidOn'>>(fines: T[], today: ISODate): T[] {
  const rank: Record<FineStatus, number> = { overdue: 0, discount: 1, due: 2, paid: 3 };
  return [...fines].sort((a, b) => {
    const ia = fineInfo(a, today), ib = fineInfo(b, today);
    return rank[ia.status] - rank[ib.status] || ia.discountUntil.localeCompare(ib.discountUntil);
  });
}

export const FINE_STATUS_LABEL: Record<FineStatus, string> = {
  discount: 'İndirimli ödeme süresi',
  due: 'İndirim süresi geçti',
  overdue: 'Ödeme süresi geçti',
  paid: 'Ödendi',
};
