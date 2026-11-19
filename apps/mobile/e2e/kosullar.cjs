// Kullanım koşulları: girişte onay; onayı olmayan mevcut kullanıcıya açılışta onay ekranı; hukuk sayfaları.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
const assert = (c, m) => { if (!c) { console.error('BAŞARISIZ:', m); process.exitCode = 1; } else console.log('✓', m); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/`); await p.waitForTimeout(2500);
  await p.getByText('Araç sahibiyim').click();
  await p.getByText('Demo ile gez').click(); await p.waitForTimeout(500);
  assert(await p.getByText(/kullanım koşullarını ve aydınlatma metnini onayla/).count() === 1, 'Onaysız giriş engelleniyor');
  await p.getByRole('switch', { name: 'Aydınlatma metnini okudum' }).click();
  await p.getByText('Demo ile gez').click(); await p.waitForTimeout(2500);
  assert(await p.getByText('Okudum, kabul ediyorum').count() === 0, 'Girişte onay verilen kullanıcıya tekrar sorulmuyor');

  // Mevcut kullanıcı: onay kaydı yok (eski sürüm) → açılışta onay ekranı
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      try { const v = JSON.parse(localStorage.getItem(k)); if (v && Array.isArray(v.consents)) { v.consents = v.consents.filter((c) => c.consent !== 'terms'); localStorage.setItem(k, JSON.stringify(v)); } } catch {}
    }
  });
  await p.reload(); await p.waitForTimeout(2500);
  assert(await p.getByText('Okudum, kabul ediyorum').count() === 1, 'Onayı olmayan kullanıcıya açılışta onay ekranı çıkıyor');
  await p.getByText('Kullanım koşullarını oku').click(); await p.waitForTimeout(1200);
  assert(await p.getByText(/^Sürüm 2026/).count() === 1 && await p.getByText('3. Paylaşım kuralları ve sıfır tolerans').count() === 1, 'Onay ekranından kullanım koşulları belgesi açılıyor');
  await p.goBack(); await p.waitForTimeout(1500);
  await p.getByText('Okudum, kabul ediyorum').click(); await p.waitForTimeout(2000);
  assert(await p.getByText('Okudum, kabul ediyorum').count() === 0, 'Kabul edince uygulama açılıyor');
  await p.reload(); await p.waitForTimeout(2500);
  assert(await p.getByText('Okudum, kabul ediyorum').count() === 0, 'Kabulden sonra tekrar sorulmuyor');

  for (const [path, h] of [['gizlilik', '1. Veri sorumlusu'], ['kvkk', 'Hukuki sebepler']]) {
    await p.goto(`${BASE}/legal/${path}`); await p.waitForTimeout(1500);
    assert(await p.getByText(h, { exact: true }).count() === 1, `/legal/${path} belgesi açılıyor`);
  }
  assert(errs.length === 0, 'Konsolda hata yok' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
