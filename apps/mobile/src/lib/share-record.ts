/**
 * Servis kaydını müşteriye gönderme: WhatsApp mesajı (özet metin) ve PDF.
 * Gönderimi kullanıcı kendisi yapar: WhatsApp sohbeti mesaj hazır açılır, PDF paylaşım menüsüyle seçilen uygulamaya gider.
 * Güvenli onay bağlantısı (tek kullanımlık, süreli) gerçek sunucu gerektirir; Aşama 2'de eklenecek. Burada bağlantı üretilmez.
 */
import {
  formatDate,
  formatKm,
  formatKurus,
  formatPhoneTR,
  SERVICE_STATUS_LABEL,
  type Business,
  type ServiceRecord,
} from '@piston/core';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function lines(r: ServiceRecord) {
  const parts = r.items.filter((i) => i.partQty > 0).map((i) => ({
    name: i.partQty > 1 ? `${i.partName} × ${i.partQty}` : i.partName ?? i.title,
    kurus: i.partQty * i.partUnitKurus,
  }));
  const labor = r.items.filter((i) => i.laborKurus > 0).map((i) => ({
    name: i.title === 'İşçilik' ? 'İşçilik ücreti' : `İşçilik — ${i.title}`,
    kurus: i.laborKurus,
  }));
  return { parts, labor };
}

/** WhatsApp mesajı: kısa özet. Sahte bağlantı içermez. */
export function whatsappMessage(r: ServiceRecord): string {
  const { parts, labor } = lines(r);
  const t = r.totals;
  const out = [
    `Merhaba ${r.customerName}, aracınız için ${r.businessName} tarafından servis kaydı oluşturuldu.`,
    '',
    `${r.plate} · ${r.vehicleLabel} · ${formatKm(r.odometerKm)}`,
    `Tarih: ${formatDate(r.intakeAt.slice(0, 10))}`,
    '',
    'Değişen parçalar:',
    ...(parts.length ? parts.map((p) => `• ${p.name}: ${formatKurus(p.kurus)}`) : ['• Parça değişmedi']),
    `Parça toplamı: ${formatKurus(t.partsKurus)}`,
    ...labor.map((l) => `${l.name}: ${formatKurus(l.kurus)}`),
    ...(t.discountKurus > 0 ? [`İndirim: −${formatKurus(t.discountKurus)}`] : []),
    ...(t.vatRate != null ? [`KDV (%${t.vatRate}): ${formatKurus(t.vatKurus)}`] : []),
    `Genel toplam: ${formatKurus(t.grandKurus)}`,
    '',
    'Kaydı PISTON GARAGE uygulamasında "Servis kayıtlarım" bölümünden görüp onaylayabilir ya da itiraz edebilirsiniz.',
  ];
  return out.join('\n');
}

/** Müşterinin numarasıyla WhatsApp sohbetini mesaj hazır açar. Gönder tuşuna kullanıcı basar. */
export async function openWhatsApp(phoneE164: string, text: string): Promise<boolean> {
  const url = `https://wa.me/${phoneE164.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export function recordHtml(r: ServiceRecord, b: Pick<Business, 'name' | 'phone' | 'address' | 'district' | 'city'>): string {
  const { parts, labor } = lines(r);
  const t = r.totals;
  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Servis kaydı ${esc(r.plate)}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 32px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 14px; margin: 20px 0 6px; color: #D32F2F; text-transform: uppercase; letter-spacing: .5px; }
  .muted { color: #555; } .head { display: flex; justify-content: space-between; border-bottom: 3px solid #D32F2F; padding-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; } td { padding: 6px 0; border-bottom: 1px solid #eee; }
  .num { text-align: right; white-space: nowrap; } .strong td { font-weight: 700; font-size: 15px; border-top: 2px solid #111; }
  .plate { font-size: 18px; font-weight: 700; letter-spacing: 1px; } .note { margin-top: 24px; font-size: 11px; color: #666; }
</style></head><body>
<div class="head"><div><h1>${esc(b.name)}</h1><div class="muted">${esc(b.address)}, ${esc(b.district)} / ${esc(b.city)}<br>${esc(formatPhoneTR(b.phone))}</div></div>
<div style="text-align:right"><div class="muted">SERVİS KAYDI</div><div>${esc(formatDate(r.intakeAt.slice(0, 10)))}</div><div class="muted">${esc(SERVICE_STATUS_LABEL[r.status])} · sürüm ${r.approvalVersion}</div></div></div>
<h2>Araç ve müşteri</h2>
<div class="plate">${esc(r.plate)}</div><div>${esc(r.vehicleLabel)} · ${esc(formatKm(r.odometerKm))}</div>
<div class="muted">${esc(r.customerName)} · ${esc(formatPhoneTR(r.customerPhone))}</div>
<div style="margin-top:6px"><b>Şikâyet / istenen iş:</b> ${esc(r.complaint)}</div>
<h2>Değişen parçalar</h2>
<table>${parts.length ? parts.map((p) => row(p.name, formatKurus(p.kurus))).join('') : row('Parça değişmedi', '')}
${row('Parça toplamı', formatKurus(t.partsKurus), false)}</table>
<h2>İşçilik ve toplam</h2>
<table>${labor.map((l) => row(l.name, formatKurus(l.kurus))).join('')}
${t.discountKurus > 0 ? row('İndirim', `−${formatKurus(t.discountKurus)}`) : ''}
${t.vatRate != null ? row(`KDV (%${t.vatRate})`, formatKurus(t.vatKurus)) : row('KDV', 'Uygulanmadı')}
${row('Genel toplam', formatKurus(t.grandKurus), true)}</table>
<div class="note">Bu belge bilgilendirme amaçlıdır; fatura veya vergi belgesi yerine geçmez. PISTON SERVİS ile oluşturuldu.</div>
</body></html>`;
}

/** PDF oluşturur ve paylaşım menüsünü açar (WhatsApp seçilebilir). Web'de yazdırma penceresi açılır. */
export async function shareRecordPdf(r: ServiceRecord, b: Parameters<typeof recordHtml>[1]): Promise<'shared' | 'printed' | 'unavailable'> {
  const html = recordHtml(r, b);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return 'printed';
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Servis kaydı ${r.plate}` });
  return 'shared';
}
