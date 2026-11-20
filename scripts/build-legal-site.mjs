// OTOM'un herkese açık web sitesi: tanıtım ana sayfası + App Store'un istediği gizlilik politikası, kullanım koşulları,
// KVKK aydınlatma metni ve destek sayfası. Hukuk metinlerinin kaynağı: packages/core/src/legal-texts.json (uygulamadakiyle aynı).
// Kullanım: npm run site   → docs/site/ (Netlify Drop'a bu klasör sürüklenir)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(readFileSync(join(root, 'packages/core/src/legal-texts.json'), 'utf8'));
const out = join(root, 'docs/site');
mkdirSync(out, { recursive: true });
copyFileSync(join(root, 'apps/mobile/assets/images/icon.png'), join(out, 'logo.png'));
copyFileSync(join(root, 'apps/mobile/assets/images/favicon.png'), join(out, 'favicon.png'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (s) => s.replace(/\{company\.(\w+)\}/g, (_, k) => T.company[k] ?? '');
const email = esc(T.company.email);
const year = new Date().getFullYear();

// Uygulamadaki simgelerin aynısı (apps/mobile/src/components/icons.tsx)
const ICONS = {
  oil: ['M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z'],
  fuel: ['M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M4 21h11M15 9h2l2 2v7a1.5 1.5 0 0 0 3 0V9l-3-3', 'M7 7h5v4H7z'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  doc: ['M6 3h8l4 4v14H6z', 'M14 3v4h4M9 13h6M9 17h6'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20a2 2 0 0 0 4 0'],
  alert: ['M12 3l10 18H2z', 'M12 10v5M12 18v.5'],
  send: ['M4 12l16-8-6 16-3-7z'],
  pin: ['M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  forum: ['M4 5h16v11H8l-4 4z'],
  wrench: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z'],
  chart: ['M4 20h16', 'M7 20v-6M12 20V8M17 20v-10'],
  store: ['M3 9l2-5h14l2 5M4 9v11h16V9M3 9h18M9 20v-6h6v6'],
  check: ['M5 12l5 5 9-10'],
  trash: ['M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14'],
  lock: ['M8 11V8a4 4 0 0 1 8 0v3', 'M5 11h14v10H5z'],
};
const icon = (n, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n].map((d) => `<path d="${d}"/>`).join('')}</svg>`;

const NAV = [['destek.html', 'Destek'], ['gizlilik.html', 'Gizlilik'], ['kosullar.html', 'Koşullar'], ['kvkk.html', 'KVKK']];

const CSS = `
  :root { --bg:#F3F4F6; --surface:#FFFFFF; --tint:#F7FBEA; --tint-line:#DDEBB4; --fg:#242930; --muted:#5F6772; --line:#E3E6EA;
    --bar:#17191D; --bar-fg:#FFFFFF; --bar-muted:#AEB4BD; --logo:#B6F000; --on-logo:#17191D; --link:#3F5E00; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#101215; --surface:#1A1D22; --tint:#1C2214; --tint-line:#33401C;
    --fg:#EEF0F3; --muted:#A3A9B5; --line:#2A2E36; --link:#C9F24D; } }
  :root[data-theme="dark"] { --bg:#101215; --surface:#1A1D22; --tint:#1C2214; --tint-line:#33401C; --fg:#EEF0F3; --muted:#A3A9B5; --line:#2A2E36; --link:#C9F24D; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased; }
  a { color:var(--link); }
  .wrap { max-width:1080px; margin:0 auto; padding:0 20px; }
  header.top { background:var(--bar); color:var(--bar-fg); position:sticky; top:0; z-index:5; border-bottom:1px solid #2B3038; }
  header.top .wrap { display:flex; align-items:center; gap:16px; min-height:64px; flex-wrap:wrap; }
  .brand { display:flex; align-items:center; gap:10px; color:var(--bar-fg); text-decoration:none; font-weight:800; letter-spacing:.06em; font-size:20px; margin-right:auto; }
  .brand img { width:34px; height:34px; border-radius:9px; display:block; }
  nav.links { display:flex; gap:4px; flex-wrap:wrap; }
  nav.links a { color:var(--bar-muted); text-decoration:none; font-weight:600; font-size:14px; padding:6px 10px; border-radius:8px; }
  nav.links a:hover { color:var(--bar-fg); }
  nav.links a[aria-current] { color:var(--logo); background:rgba(182,240,0,.12); }
  footer { border-top:1px solid var(--line); color:var(--muted); font-size:14px; padding:28px 0 40px; }
  footer .wrap { display:flex; flex-wrap:wrap; gap:12px 24px; align-items:center; }
  footer a { color:var(--muted); }
  /* Hukuk ve destek sayfaları */
  main.doc { max-width:760px; margin:0 auto; padding:32px 20px 64px; }
  main.doc h1 { font-size:30px; line-height:1.2; margin:0 0 6px; }
  main.doc h2 { font-size:18px; margin:28px 0 6px; }
  main.doc p { margin:0 0 12px; }
  .meta { color:var(--muted); font-size:14px; }
  .draft { border:1px solid #D6303D; color:#D6303D; padding:8px 12px; border-radius:10px; font-size:14px; margin:12px 0; }
  /* Tanıtım sayfası */
  .hero { background:var(--bar); color:var(--bar-fg); padding:56px 0 72px; overflow:hidden; }
  .hero .wrap { display:grid; grid-template-columns:1.1fr .9fr; gap:48px; align-items:center; }
  .eyebrow { display:inline-block; color:var(--logo); font-weight:700; font-size:13px; letter-spacing:.12em; text-transform:uppercase; margin-bottom:14px; }
  .hero h1 { font-size:clamp(34px, 5.4vw, 56px); line-height:1.05; margin:0 0 18px; letter-spacing:-.02em; }
  .hero h1 em { font-style:normal; color:var(--logo); }
  .hero p.lead { color:var(--bar-muted); font-size:18px; max-width:520px; margin:0 0 28px; }
  .cta { display:flex; gap:12px; flex-wrap:wrap; }
  .btn { display:inline-flex; align-items:center; gap:10px; padding:13px 20px; border-radius:14px; font-weight:700; text-decoration:none; font-size:16px; }
  .btn.primary { background:var(--logo); color:var(--on-logo); }
  .btn.ghost { color:var(--bar-fg); border:1px solid #3A404A; }
  .btn small { display:block; font-weight:600; font-size:11px; opacity:.75; line-height:1.1; }
  .btn .two { display:flex; flex-direction:column; line-height:1.15; }
  .phone { justify-self:center; width:290px; border-radius:42px; background:#0B0C0E; padding:12px; box-shadow:0 30px 80px rgba(0,0,0,.45), 0 0 0 1px #2B3038; }
  .screen { border-radius:32px; background:#F3F4F6; overflow:hidden; color:#242930; }
  .s-band { background:#17191D; color:#fff; display:flex; align-items:center; gap:8px; padding:30px 16px 14px; font-weight:800; letter-spacing:.06em; font-size:14px; }
  .s-band i { width:22px; height:22px; border-radius:6px; background:#B6F000; color:#17191D; display:grid; place-items:center; font-style:normal; font-size:13px; }
  .s-body { padding:14px; display:grid; gap:10px; }
  .s-hi { font-weight:800; font-size:19px; }
  .s-sub { color:#737B85; font-size:12px; margin-top:-8px; }
  .s-dark { background:#20252B; color:#fff; border-radius:18px; padding:14px; }
  .s-dark small { color:#9AA1AB; font-size:10px; letter-spacing:.08em; font-weight:700; }
  .s-dark b { display:block; font-size:16px; margin:2px 0; }
  .s-dark span { color:#FF8A92; font-size:12px; }
  .s-dark .bar { margin-top:12px; background:#D6303D; border-radius:12px; text-align:center; font-weight:700; font-size:13px; padding:9px; }
  .s-card { background:#F7FBEA; border:1px solid #DDEBB4; border-radius:16px; padding:12px; font-size:12px; }
  .s-card b { display:block; font-size:13px; color:#242930; }
  .s-card span { color:#737B85; }
  .s-tabs { display:flex; justify-content:space-around; background:#17191D; color:#9AA1AB; font-size:10px; padding:10px 6px 18px; }
  .s-tabs .on { color:#B6F000; }
  section.block { padding:72px 0; }
  section.block h2 { font-size:clamp(26px, 3.4vw, 36px); line-height:1.15; margin:0 0 10px; letter-spacing:-.01em; }
  section.block p.intro { color:var(--muted); max-width:640px; margin:0 0 32px; font-size:17px; }
  .grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }
  .card { background:var(--tint); border:1px solid var(--tint-line); border-radius:20px; padding:22px; }
  .card .ic { width:44px; height:44px; border-radius:13px; background:var(--logo); color:var(--on-logo); display:grid; place-items:center; margin-bottom:14px; }
  .card h3 { margin:0 0 6px; font-size:17px; }
  .card p { margin:0; color:var(--muted); font-size:15px; }
  .dark { background:var(--bar); color:var(--bar-fg); }
  .dark p.intro { color:var(--bar-muted) !important; }
  .dark .card { background:#20252B; border-color:#2B3038; }
  .dark .card p { color:var(--bar-muted); }
  .trust { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }
  .trust div { display:flex; gap:12px; align-items:flex-start; background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:18px; }
  .trust .ic { color:var(--link); flex:none; margin-top:2px; }
  .trust b { display:block; margin-bottom:2px; }
  .trust span { color:var(--muted); font-size:15px; }
  .final { text-align:center; padding:72px 0; }
  .final h2 { font-size:clamp(26px, 3.4vw, 36px); margin:0 0 10px; }
  .final p { color:var(--muted); margin:0 0 24px; }
  @media (max-width: 860px) {
    .hero .wrap { grid-template-columns:1fr; gap:40px; }
    .grid, .trust { grid-template-columns:1fr 1fr; }
  }
  @media (max-width: 560px) {
    .hero { padding:36px 0 52px; }
    .grid, .trust { grid-template-columns:1fr; }
    section.block, .final { padding:52px 0; }
    nav.links a { padding:6px 7px; font-size:13px; }
    .phone { width:260px; }
  }
`;

function page(file, title, body, description) {
  const nav = NAV.map(([f, l]) => `<a href="${f}"${f === file ? ' aria-current="page"' : ''}>${esc(l)}</a>`).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${file === 'index.html' ? 'OTOM: Araç bakım ve servis' : esc(title) + ' · OTOM'}</title>
<meta name="description" content="${esc(description ?? 'OTOM: aracının bakımını, masraflarını ve servis geçmişini tek yerde tut; servislerden teklif al.')}">
<meta name="theme-color" content="#17191D">
<link rel="icon" href="favicon.png">
<style>${CSS}</style></head><body>
<header class="top"><div class="wrap"><a class="brand" href="index.html"><img src="logo.png" alt="">OTOM</a><nav class="links" aria-label="Site">${nav}</nav></div></header>
${body}
<footer><div class="wrap"><span>© ${year} OTOM</span><a href="kosullar.html">Kullanım koşulları</a><a href="gizlilik.html">Gizlilik politikası</a><a href="kvkk.html">KVKK aydınlatma metni</a><a href="destek.html">Destek</a><a href="mailto:${email}">${email}</a></div></footer>
</body></html>`;
}

const meta = `<p class="meta">Sürüm ${esc(T.version)} · Son güncelleme ${esc(T.updated)}</p>${T.status ? `<p class="draft">${esc(T.status)}</p>` : ''}`;

for (const [key, file] of [['kosullar', 'kosullar.html'], ['gizlilik', 'gizlilik.html'], ['kvkk', 'kvkk.html']]) {
  const d = T.documents[key];
  const body = `<main class="doc"><h1>${esc(d.title)}</h1>${meta}<p>${esc(fill(d.intro))}</p>` +
    d.sections.map(([h, b]) => `<h2>${esc(h)}</h2><p>${esc(fill(b))}</p>`).join('') + '</main>';
  writeFileSync(join(out, file), page(file, d.title, body));
}

writeFileSync(join(out, 'destek.html'), page('destek.html', 'Destek', `<main class="doc"><h1>Destek</h1>
<p>Sorun, öneri ya da şikâyet için bize e-posta gönder: <a href="mailto:${email}">${email}</a>. Genellikle iki iş günü içinde yanıt veririz.</p>
<h2>Giriş kodu gelmiyor</h2><p>Gereksiz (spam) klasörüne bak. Kod 10 dakika geçerlidir; süresi dolduysa yeni kod iste.</p>
<h2>Servis kaydım görünmüyor</h2><p>Servis, kaydı açarken e-posta adresini girdiyse kayıt kendiliğinden gelir. Girmediyse servisin WhatsApp'tan ya da PDF'le gönderdiği 8 karakterlik kayıt kodunu uygulamada <b>Servis kayıtlarım → Kayıt kodu gir</b> bölümüne yaz.</p>
<h2>Yol tarifi</h2><p>Rehberdeki bir işletmenin sayfasında adrese ya da <b>Yol tarifi al</b>'a dokun; harita uygulaman bulunduğun yerden işletmeye rota açar. İşletme sahibiysen <b>Menü → İşletme bilgileri → Dükkân konumu</b> bölümünden dükkândayken konumunu kaydet.</p>
<h2>Uygunsuz içerik ya da kullanıcı</h2><p>Gönderinin ya da kullanıcının menüsünden <b>Şikâyet et</b> ya da <b>Engelle</b>'ye dokun. Şikâyetler 24 saat içinde incelenir. Acil durumlar için e-posta gönder.</p>
<h2>Hesabımı ve verilerimi silmek istiyorum</h2><p>Uygulamada <b>Profil → Ayarlar → Hesabımı sil</b>. Hesabın ve kişisel verilerin kalıcı olarak silinir. Uygulamaya erişemiyorsan kayıtlı e-posta adresinden bize yaz.</p>
<h2>İşletme hesabı</h2><p>İşletme açtıktan sonra doğrulama beklersin; bu sürede uygulamayı kullanabilirsin. İşletmeni yalnızca sahibi, Menü → İşletme bilgileri bölümünden işletme adını yazarak silebilir.</p></main>`,
'OTOM destek: giriş kodu, servis kayıtları, yol tarifi, şikâyet ve hesap silme.'));

const card = (ic, h, p) => `<div class="card"><div class="ic">${icon(ic)}</div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;
const trust = (ic, h, p) => `<div><span class="ic">${icon(ic)}</span><p style="margin:0"><b>${esc(h)}</b><span>${esc(p)}</span></p></div>`;

writeFileSync(join(out, 'index.html'), page('index.html', 'OTOM', `
<section class="hero"><div class="wrap">
  <div>
    <span class="eyebrow">Araç sahipleri ve servisler için</span>
    <h1>Aracının bütün hikâyesi <em>tek yerde.</em></h1>
    <p class="lead">Bakım zamanını kaçırma, masrafını takip et, servis kaydını uygulamada onayla, şehrindeki doğrulanmış servislerden teklif al.</p>
    <div class="cta">
      <span class="btn primary" aria-label="App Store'da yakında"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg><span class="two"><small>Yakında</small>App Store</span></span>
      <a class="btn ghost" href="#isletmeler">İşletmeler için OTOM SERVİS</a>
    </div>
  </div>
  <div class="phone" aria-hidden="true"><div class="screen">
    <div class="s-band"><i>O</i>OTOM</div>
    <div class="s-body">
      <div class="s-hi">Merhaba</div><div class="s-sub">Aracının bakım zamanı geldi.</div>
      <div class="s-dark"><small>YAKLAŞAN BAKIM</small><b>Motor yağı ve filtre</b><span>500 km kaldı</span><div class="bar">Detayları gör</div></div>
      <div class="s-card"><b>Muayeneye 18 gün kaldı</b><span>Muayeneden kaldıran kalemleri önceden kontrol et.</span></div>
      <div class="s-card"><b>Servis kaydı onay bekliyor</b><span>Yağ değişimi · 2.450 ₺</span></div>
    </div>
    <div class="s-tabs"><span>Ana Sayfa</span><span>Servisler</span><span>Parçalar</span><span class="on">Garajım</span></div>
  </div></div>
</div></section>

<section class="block"><div class="wrap">
  <h2>Araç sahipleri için</h2>
  <p class="intro">Bakımdan cezaya, yakıttan servise; aracınla ilgili her şey cebinde.</p>
  <div class="grid">
    ${card('oil', 'Bakım hatırlatmaları', 'Yağ, filtre, triger, fren… Kilometreye ve tarihe göre hesaplanır, zamanı gelince bildirim alırsın.')}
    ${card('fuel', 'Yakıt ve masraf', '100 km’de ortalama tüketim, aylık gider grafiği ve tüm masrafların tek listede.')}
    ${card('alert', 'Ceza ve muayene', 'İndirimli ödeme süresini, muayene, sigorta ve kasko tarihlerini kaçırma.')}
    ${card('doc', 'Servis kayıtları', 'Servisin açtığı kaydı uygulamada gör; işlemleri ve ücreti onayla ya da itiraz et.')}
    ${card('send', 'Teklif al', 'İşini ya da aradığın parçayı yaz; şehrindeki doğrulanmış servisler ve parçacılar fiyat versin.')}
    ${card('pin', 'Yol tarifi', 'Servisin adresine dokun; harita bulunduğun yerden doğrudan dükkâna rota açsın.')}
  </div>
</div></section>

<section class="block dark" id="isletmeler"><div class="wrap">
  <h2>Servisler ve ustalar için: OTOM SERVİS</h2>
  <p class="intro">Kâğıt fişe, deftere son. Kaydı aç, müşteriye gönder, tahsilatı takip et.</p>
  <div class="grid">
    ${card('wrench', 'Plakayla hızlı kayıt', 'İşlemler, parçalar, işçilik ve KDV birkaç dokunuşta.')}
    ${card('send', 'WhatsApp ve PDF', 'Servis dökümünü müşteriye gönder; müşteri uygulamada onaylasın.')}
    ${card('chart', 'Tahsilat ve ciro', 'Veresiye takibi, günlük, haftalık ve aylık ciro.')}
    ${card('store', 'Rehberde görün', 'Doğrulanınca araç sahipleri seni bulur, teklif ister, yol tarifiyle gelir.')}
    ${card('forum', 'Esnaf forumu', 'Ustalarla soru sor, tecrübe paylaş.')}
    ${card('pin', 'Dükkân konumu', 'Konumunu bir kez kaydet; müşteriler doğrudan kapına gelsin.')}
  </div>
</div></section>

<section class="block"><div class="wrap">
  <h2>Güvenli ve reklamsız</h2>
  <p class="intro">Verilerin senin. Satmayız, reklam için paylaşmayız.</p>
  <div class="trust">
    ${trust('lock', 'Yalnızca sen görürsün', 'Her kullanıcı yalnızca kendi verisine erişir; kurallar veritabanı düzeyinde uygulanır.')}
    ${trust('shield', 'Sıfır tolerans', 'Uygunsuz içerik şikâyet edilir, kişiler engellenir; şikâyetler 24 saatte incelenir.')}
    ${trust('trash', 'İstediğin an sil', 'Hesabını ve verilerini uygulamanın içinden kalıcı olarak silebilirsin.')}
  </div>
</div></section>

<section class="final"><div class="wrap">
  <h2>OTOM ücretsiz.</h2>
  <p>Uygulama içinden ödeme alınmaz; servis ve parça ücretleri doğrudan işletmeyle konuşulur.</p>
  <a class="btn primary" href="mailto:${email}" style="color:var(--on-logo)">Bize yaz</a>
</div></section>`));

console.log('docs/site: index, kosullar, gizlilik, kvkk, destek (+ logo.png, favicon.png)');
