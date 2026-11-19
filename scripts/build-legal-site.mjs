// Hukuk metinlerinden ve destek bilgisinden herkese açık web sayfaları üretir (App Store'un istediği
// gizlilik politikası ve destek bağlantıları). Kaynak: packages/core/src/legal-texts.json — uygulamadakiyle aynı metin.
// Kullanım: node scripts/build-legal-site.mjs   → docs/site/*.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(readFileSync(join(root, 'packages/core/src/legal-texts.json'), 'utf8'));
const out = join(root, 'docs/site');
mkdirSync(out, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (s) => s.replace(/\{company\.(\w+)\}/g, (_, k) => T.company[k] ?? '');

const NAV = [['index.html', 'OTOM'], ['kosullar.html', 'Kullanım koşulları'], ['gizlilik.html', 'Gizlilik'], ['kvkk.html', 'KVKK'], ['destek.html', 'Destek']];

function page(file, title, body) {
  const nav = NAV.map(([f, l]) => `<a href="${f}"${f === file ? ' aria-current="page"' : ''}>${esc(l)}</a>`).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title === "OTOM" ? "OTOM" : esc(title) + " · OTOM"}</title>
<style>
  :root { --bg:#fff; --fg:#16181c; --muted:#5b6170; --line:#e6e8ec; --brand:#d6303d; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14161a; --fg:#eef0f3; --muted:#a3a9b5; --line:#2a2e36; --brand:#ff5a66; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  header { border-bottom:1px solid var(--line); } nav { max-width:760px; margin:0 auto; padding:14px 20px; display:flex; flex-wrap:wrap; gap:16px; }
  nav a { color:var(--muted); text-decoration:none; font-weight:600; font-size:14px; } nav a[aria-current] { color:var(--brand); }
  main { max-width:760px; margin:0 auto; padding:24px 20px 64px; } h1 { font-size:28px; line-height:1.2; margin:8px 0 4px; }
  h2 { font-size:18px; margin:28px 0 6px; } p { margin:0 0 12px; } .meta { color:var(--muted); font-size:14px; }
  .draft { border:1px solid var(--brand); color:var(--brand); padding:8px 12px; border-radius:8px; font-size:14px; margin:12px 0; }
  a { color:var(--brand); }
</style></head><body><header><nav>${nav}</nav></header><main>${body}</main></body></html>`;
}

const meta = `<p class="meta">Sürüm ${esc(T.version)} · Son güncelleme ${esc(T.updated)}</p>${T.status ? `<p class="draft">${esc(T.status)}</p>` : ''}`;

for (const [key, file] of [['kosullar', 'kosullar.html'], ['gizlilik', 'gizlilik.html'], ['kvkk', 'kvkk.html']]) {
  const d = T.documents[key];
  const body = `<h1>${esc(d.title)}</h1>${meta}<p>${esc(fill(d.intro))}</p>` +
    d.sections.map(([h, b]) => `<h2>${esc(h)}</h2><p>${esc(fill(b))}</p>`).join('');
  writeFileSync(join(out, file), page(file, d.title, body));
}

const email = esc(T.company.email);
writeFileSync(join(out, 'destek.html'), page('destek.html', 'Destek', `<h1>Destek</h1>
<p>Sorun, öneri ya da şikâyet için bize e-posta gönder: <a href="mailto:${email}">${email}</a>. Genellikle iki iş günü içinde yanıt veririz.</p>
<h2>Giriş kodu gelmiyor</h2><p>Gereksiz (spam) klasörüne bak. Kod 10 dakika geçerlidir; süresi dolduysa yeni kod iste.</p>
<h2>Servis kaydım görünmüyor</h2><p>Servis, kaydı açarken e-posta adresini girdiyse kayıt kendiliğinden gelir. Girmediyse servisin WhatsApp'tan ya da PDF'le gönderdiği 8 karakterlik kayıt kodunu uygulamada <b>Servis kayıtlarım → Kayıt kodu gir</b> bölümüne yaz.</p>
<h2>Uygunsuz içerik ya da kullanıcı</h2><p>Gönderinin ya da kullanıcının menüsünden <b>Şikâyet et</b> ya da <b>Engelle</b>'ye dokun. Şikâyetler 24 saat içinde incelenir. Acil durumlar için e-posta gönder.</p>
<h2>Hesabımı ve verilerimi silmek istiyorum</h2><p>Uygulamada <b>Profil → Hesabımı sil</b>. Hesabın ve kişisel verilerin kalıcı olarak silinir. Uygulamaya erişemiyorsan kayıtlı e-posta adresinden bize yaz.</p>
<h2>İşletme hesabı</h2><p>İşletme açtıktan sonra doğrulama beklersin; bu sürede uygulamayı kullanabilirsin. İşletmeni yalnızca sahibi, Menü → İşletme bilgileri bölümünden işletme adını yazarak silebilir.</p>`));

writeFileSync(join(out, 'index.html'), page('index.html', 'OTOM', `<h1>OTOM</h1>
<p>Araç sahipleri ve servisler için: bakım hatırlatmaları, yakıt ve masraf takibi, servis kayıtları, servis ve yedek parça rehberi, teklif isteme ve araç sahipleri topluluğu. İşletmeler için OTOM SERVİS: servis kaydı, müşteri, tahsilat ve ciro.</p>
<p><a href="kosullar.html">Kullanım koşulları</a> · <a href="gizlilik.html">Gizlilik politikası</a> · <a href="kvkk.html">KVKK aydınlatma metni</a> · <a href="destek.html">Destek</a></p>`));

console.log('docs/site: index, kosullar, gizlilik, kvkk, destek');
