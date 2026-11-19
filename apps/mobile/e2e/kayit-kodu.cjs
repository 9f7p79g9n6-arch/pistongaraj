// Kayıt kodu akışı (demo modu): işletme kayıt açar ve kodu görür; aynı cihazda bireysel moda geçen kullanıcı
// yanlış kodla reddedilir, doğru kodla kaydı "Servis kayıtlarım"a ekler.
// Kullanım: BASE_URL=http://localhost:8099 node apps/mobile/e2e/kayit-kodu.cjs   (SHOTS=1 ekran görüntüsü alır)
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
const assert = (c, m) => { if (!c) { console.error('BAŞARISIZ:', m); process.exitCode = 1; } else console.log('✓', m); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const shot = async (n) => { if (process.env.SHOTS) await p.screenshot({ path: path.join(__dirname, 'shots', `${n}.png`) }); };
  const f = (l, v) => p.getByRole('textbox', { name: l, exact: true }).last().fill(v);

  await p.goto(`${BASE}/`); await p.waitForTimeout(2500);
  await p.getByText('İşletmeyim').click();
  await p.getByRole('switch', { name: 'Aydınlatma metnini okudum' }).click();
  await p.getByText('Demo ile gez').click(); await p.waitForTimeout(2500);
  await f('İşletme adı', 'Yıldız Oto'); await p.getByText('Mekanik servis').click();
  await f('Yetkili kişinin adı soyadı', 'Ali Usta'); await f('Telefon', '0532 111 22 33');
  await f('Şehir', 'Konya'); await f('İlçe', 'Karatay'); await f('Açık adres', 'Sanayi 3. Sokak No 5');
  await p.getByText('İşletmeyi aç').click(); await p.waitForTimeout(2500);

  await p.getByText(/YENİ SERVİS KAYDI/i).first().click(); await p.waitForTimeout(2000);
  await f('Plaka', '42 AB 123'); await f('Kilometre', '86.300'); await f('Marka', 'Fiat'); await f('Model', 'Egea');
  await f('Müşteri adı soyadı', 'Ayşe Yılmaz'); await f('Telefon', '0533 000 88 88'); await f('Şikâyet / istenen iş', 'Periyodik bakım');
  await p.getByText('Devam', { exact: true }).last().click(); await p.waitForTimeout(1200);
  await f('Parça 1 adı', 'Yağ filtresi'); await f('Parça 1 fiyatı', '350'); await f('İşçilik ücreti (₺)', '650');
  await p.getByText('Devam', { exact: true }).last().click(); await p.waitForTimeout(1200);
  await p.getByText('Kaydı aç', { exact: true }).last().click(); await p.waitForTimeout(2500);
  await shot('k1-isletme-kayit');

  const body = await p.locator('body').innerText();
  const m = body.match(/\b([A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4})\b/);
  assert(m, 'İşletmenin kayıt ekranında kayıt kodu görünüyor');
  assert(body.includes('Müşteri kodu OTOM’da girince'), 'Kod henüz kullanılmadı olarak görünüyor');
  const code = m ? m[1] : 'XXXX-XXXX';

  // Bireysel taraf: aynı cihazda müşteri olarak
  await p.goto(`${BASE}/servis-kayitlarim`); await p.waitForTimeout(2000);
  assert(await p.getByText('Henüz servis kaydı yok').count() === 1, 'Kod girilmeden kayıt müşteriye görünmüyor');
  await p.getByText('Kayıt kodu gir').click(); await p.waitForTimeout(400);
  await f('Kod', 'ABCD-EFGH'); await p.getByText('Ekle', { exact: true }).click(); await p.waitForTimeout(800);
  assert(await p.getByText(/Kod bulunamadı/).count() === 1, 'Yanlış kod reddediliyor');
  await f('Kod', code.toLowerCase().replace('-', ' ')); await p.getByText('Ekle', { exact: true }).click(); await p.waitForTimeout(2500);
  await shot('k2-musteri-kayit');
  assert(/servis-kaydi\//.test(p.url()), 'Doğru kod (küçük harf, boşluklu) kaydı açıyor');
  await p.goto(`${BASE}/servis-kayitlarim`); await p.waitForTimeout(2000);
  assert(await p.getByText('42 AB 123').count() >= 1, 'Kayıt "Servis kayıtlarım"da görünüyor');

  assert(errs.length === 0, 'Konsolda hata yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
