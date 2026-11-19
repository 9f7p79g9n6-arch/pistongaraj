// Bildirimler: zil noktası, liste (örnek bildirimler), okundu, bağlantı açma; Ayarlar tercihleri ve Yardım.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
const assert = (c, m) => { if (!c) { console.error('BAŞARISIZ:', m); process.exitCode = 1; } else console.log('✓', m); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/`); await p.waitForTimeout(2500);
  await p.getByText('Araç sahibiyim').click();
  await p.getByRole('switch', { name: 'Aydınlatma metnini okudum' }).click();
  await p.getByText('Demo ile gez').click(); await p.waitForTimeout(2500);

  assert(await p.getByRole('button', { name: 'Bildirimler, 2 okunmamış' }).count() === 1, 'Ana sayfadaki zil 2 okunmamış bildirimi gösteriyor');
  await p.getByRole('button', { name: 'Bildirimler, 2 okunmamış' }).click(); await p.waitForTimeout(1500);
  assert(await p.getByText('Ceza indirimine 2 gün kaldı (örnek)').count() === 1 && await p.getByText('Yeni servis kaydı (örnek)').count() === 1, 'Liste örnek bildirimleri gösteriyor');
  assert(await p.getByText(/ · yeni$/).count() === 2, 'Okunmamışlar bu açılışta "yeni" olarak işaretli');
  await p.getByText('Ceza indirimine 2 gün kaldı (örnek)').click(); await p.waitForTimeout(1500);
  assert(/\/vehicle\/[^/]+\/fines$/.test(new URL(p.url()).pathname), 'Bildirime dokununca ceza ekranı açılıyor');
  await p.goBack(); await p.waitForTimeout(1200);
  assert(await p.getByText(/ · yeni$/).count() === 0, 'Tekrar açılınca hepsi okunmuş');
  await p.goBack(); await p.waitForTimeout(1200);
  assert(await p.getByRole('button', { name: 'Bildirimler', exact: true }).count() === 1, 'Zildeki nokta kalktı');

  await p.goto(`${BASE}/ayarlar`); await p.waitForTimeout(1500);
  const sw = p.getByRole('switch', { name: 'Topluluk' });
  assert(await sw.isChecked(), 'Topluluk bildirimi varsayılan açık');
  await sw.click(); await p.waitForTimeout(600);
  await p.reload(); await p.waitForTimeout(2500);
  assert(!(await p.getByRole('switch', { name: 'Topluluk' }).isChecked()), 'Kapatılan tercih kaydediliyor');
  assert(await p.getByText('Hesabımı sil').count() === 1 && await p.getByText('Gizlilik politikası').count() === 1, 'Ayarlarda hesap silme ve gizlilik politikası var');
  await p.getByText('Telefona bildirimleri aç').click(); await p.waitForTimeout(800);
  assert(await p.getByText(/Web önizlemesinde açılamaz/).count() === 1, 'Web’de bildirim açma anlaşılır bir mesaj veriyor');

  await p.getByText('Sık sorulan sorular').click(); await p.waitForTimeout(1200);
  await p.getByText('Kayıt kodu nedir, nereye girerim?').count();
  await p.getByText('Hesabımı nasıl silerim?').click(); await p.waitForTimeout(400);
  assert(await p.getByText(/Ayarlar → “Hesabımı sil”/).count() === 1, 'Yardım sorusu açılıyor');

  await p.goto(`${BASE}/profil`); await p.waitForTimeout(1500);
  assert(await p.getByText('Ayarlar', { exact: true }).count() === 1 && await p.getByText('Yardım', { exact: true }).count() === 1, 'Profilden Ayarlar ve Yardım açılabiliyor');
  assert(errs.length === 0, 'Konsolda hata yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
