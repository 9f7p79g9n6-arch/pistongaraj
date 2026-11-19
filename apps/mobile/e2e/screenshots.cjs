// App Store ekran görüntüsü taslakları: web demosundan 1320 × 2868 (6,9" iPhone). Çıktı: docs/app-store/
// Önce: EXPO_PUBLIC_DEMO_MODE=1 ile web dışa aktarımı ve BASE_URL'de sunucu (bkz. docs/APP-STORE.md).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
const OUT = path.join(__dirname, '..', '..', '..', 'docs', 'app-store');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
  const p = await ctx.newPage();
  const shot = async (name) => { await p.waitForTimeout(1200); await p.screenshot({ path: path.join(OUT, name + '.png') }); console.log('✓', name); };
  await p.goto(`${BASE}/`); await p.waitForTimeout(2500);
  await p.getByText('Araç sahibiyim').click();
  await p.getByRole('switch', { name: 'Aydınlatma metnini okudum' }).click();
  await p.getByText('Demo ile gez').click(); await p.waitForTimeout(2500);
  await p.goto(`${BASE}/garajim`); await shot('1-garajim');
  const vid = await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) { try { const v = JSON.parse(localStorage.getItem(k)); if (v && v.vehicles) return v.vehicles[0].id; } catch {} }
    return null;
  });
  await p.goto(`${BASE}/vehicle/${vid}/maintenance`); await shot('2-bakim');
  await p.goto(`${BASE}/vehicle/${vid}/fuel`); await shot('3-yakit-masraf');
  await p.goto(`${BASE}/vehicle/${vid}/fines`); await shot('4-cezalar');
  await p.goto(`${BASE}/bildirimler`); await shot('5-bildirimler');
  // Örnek işletme açılır, panel çekilir
  await p.goto(`${BASE}/servis/isletme-ac`); await p.waitForTimeout(1500);
  const fill = (l, v) => p.getByLabel(l, { exact: true }).fill(v);
  await fill('İşletme adı', 'Yıldız Oto Servis (örnek)');
  await p.getByText('Mekanik servis', { exact: true }).click();
  await fill('Yetkili kişinin adı soyadı', 'Mehmet Yıldız');
  await fill('Telefon', '0532 123 45 67');
  await fill('Şehir', 'Konya'); await fill('İlçe', 'Karatay');
  await fill('Açık adres', 'Sanayi sitesi 8. blok no 3');
  await p.getByText('İşletmeyi aç', { exact: true }).click(); await p.waitForTimeout(2500);
  await shot('6-otom-servis');
  await b.close();
})();
