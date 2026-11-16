/**
 * Muhasebe raporunu dışa aktarma: PDF (okunur özet) ve CSV (Excel'de açılır tablo).
 * Dosya cihazda oluşturulur ve paylaşım menüsü açılır (WhatsApp, e-posta, Dosyalar). Web'de PDF yazdırılır, CSV indirilir.
 */
import {
  formatKurus,
  formatPhoneTR,
  PAYMENT_METHOD_LABEL,
  reportCsv,
  type Business,
  type Debtor,
  type PaymentMethod,
  type ServiceRecord,
  type ServiceReport,
} from '@piston/core';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fileSafe = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

export function reportHtml(rep: ServiceReport, b: Pick<Business, 'name' | 'phone' | 'district' | 'city'>, debtorsList: Debtor[]): string {
  const row = (l: string, v: string, strong = false) => `<tr${strong ? ' class="strong"' : ''}><td>${esc(l)}</td><td class="num">${esc(v)}</td></tr>`;
  const r = rep.revenue;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Rapor ${esc(rep.period.label)}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 13px; margin: 18px 0 6px; color: #D32F2F; text-transform: uppercase; letter-spacing: .5px; }
  .muted { color: #555; } .head { border-bottom: 3px solid #D32F2F; padding-bottom: 10px; display: flex; justify-content: space-between; }
  table { width: 100%; border-collapse: collapse; } td, th { padding: 5px 4px; border-bottom: 1px solid #eee; text-align: left; }
  .num { text-align: right; white-space: nowrap; } .strong td { font-weight: 700; border-top: 2px solid #111; }
  .note { margin-top: 20px; font-size: 10px; color: #666; }
</style></head><body>
<div class="head"><div><h1>${esc(b.name)}</h1><div class="muted">${esc(b.district)} / ${esc(b.city)} · ${esc(formatPhoneTR(b.phone))}</div></div>
<div style="text-align:right"><div class="muted">MUHASEBE RAPORU</div><b>${esc(rep.period.label)}</b><div class="muted">${esc(rep.period.from)} – ${esc(rep.period.to)}</div></div></div>
<h2>Ciro (müşterinin onayladığı ve tamamlanan kayıtlar)</h2>
<table>${row('Servis sayısı', String(r.count))}${row('Parça toplamı', formatKurus(r.partsKurus))}${row('İşçilik toplamı', formatKurus(r.laborKurus))}
${row('İndirim', formatKurus(r.discountKurus))}${row('KDV', formatKurus(r.vatKurus))}${row('Genel ciro', formatKurus(r.grandKurus), true)}</table>
<h2>Tahsilat (ödemenin alındığı tarihe göre)</h2>
<table>${(Object.keys(rep.collected.byMethod) as PaymentMethod[]).map((m) => row(PAYMENT_METHOD_LABEL[m], formatKurus(rep.collected.byMethod[m]))).join('')}
${row('Toplam tahsilat', formatKurus(rep.collected.totalKurus), true)}</table>
<h2>Alacak</h2>
<table>${row('Bu dönemin cirosundan tahsil edilmeyen', formatKurus(rep.periodUnpaidKurus))}${row('Bugün itibarıyla toplam alacak', formatKurus(rep.receivableKurus), true)}</table>
<h2>Ciroya sayılmayanlar</h2>
<table>${row(`Müşteri onayı bekleyen (${rep.awaiting.count})`, formatKurus(rep.awaiting.grandKurus))}${row(`İtiraz edilen (${rep.objected.count})`, formatKurus(rep.objected.grandKurus))}</table>
${debtorsList.length ? `<h2>Borçlu müşteriler</h2><table><tr><th>Müşteri</th><th>Telefon</th><th>En eski</th><th class="num">Borç</th></tr>
${debtorsList.map((d) => `<tr><td>${esc(d.customerName)}</td><td>${esc(formatPhoneTR(d.customerPhone))}</td><td>${esc(d.oldestDate)}</td><td class="num">${esc(formatKurus(d.debtKurus))}</td></tr>`).join('')}</table>` : ''}
${rep.topParts.length ? `<h2>En çok değişen parçalar</h2><table>${rep.topParts.map((p) => row(`${p.name} (${p.count} adet)`, formatKurus(p.totalKurus))).join('')}</table>` : ''}
<div class="note">Bu rapor bilgilendirme amaçlıdır; fatura, e-arşiv veya resmi defter yerine geçmez. PISTON SERVİS ile oluşturuldu.</div>
</body></html>`;
}

export async function shareReportPdf(rep: ServiceReport, b: Business, debtorsList: Debtor[]): Promise<'shared' | 'printed' | 'unavailable'> {
  const html = reportHtml(rep, b, debtorsList);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return 'printed';
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Rapor ${rep.period.label}` });
  return 'shared';
}

export async function shareReportCsv(records: readonly ServiceRecord[], rep: ServiceReport, b: Business): Promise<'shared' | 'downloaded' | 'unavailable'> {
  const csv = reportCsv(records, rep.period);
  const name = `piston-${fileSafe(b.name)}-${rep.period.from}-${rep.period.to}.csv`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(csv);
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: `Rapor ${rep.period.label}` });
  return 'shared';
}
