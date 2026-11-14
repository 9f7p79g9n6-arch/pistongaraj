const [fn, mock] = process.argv.slice(2);
let failed = 0;
const ok = (cond, msg, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${msg}${cond ? '' : ' ' + extra}`); if (!cond) failed++; };
const scenario = (s) => fetch(`${mock}/__scenario?s=${s}`);
const state = async () => (await fetch(`${mock}/__state`)).json();
const IMG = Buffer.from('fake-jpeg-bytes').toString('base64');
const call = (body, token = 'good-token') => fetch(fn, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const good = { image: IMG, mediaType: 'image/jpeg', vehicle: { make: 'Ford', model: 'Focus', year: '2016', fuel: 'Dizel' }, note: 'Işık sabit yanıyor' };

await scenario('ok');
let r = await call(good, 'bad');
ok(r.status === 401, 'oturumsuz istek reddediliyor', r.status);

r = await call({ ...good, mediaType: 'image/gif' });
ok(r.status === 400, 'desteklenmeyen görüntü türü reddediliyor', r.status);

r = await call({ ...good, image: 'a'.repeat(6_900_000) });
ok(r.status === 413, 'çok büyük fotoğraf reddediliyor', r.status);

await scenario('no_consent');
r = await call(good);
ok(r.status === 403 && (await r.json()).error === 'consent_required', 'açık rıza yoksa yapay zekâya gönderilmiyor');
ok((await state()).anthropicRequests.length === 0, 'rıza yokken Claude çağrılmadı');

await scenario('quota');
r = await call(good);
ok(r.status === 429, 'aylık kota dolunca reddediliyor', r.status);
ok((await state()).anthropicRequests.length === 0, 'kota doluyken Claude çağrılmadı');

await scenario('ok');
r = await call(good);
const out = await r.json();
ok(r.status === 200, 'başarılı istek 200 döner', `${r.status} ${JSON.stringify(out)}`);
ok(out.lights?.length === 2 && out.lights[0].catalogId === 'check_engine', 'tespitler uygulama biçiminde dönüyor', JSON.stringify(out));
ok(out.lights?.[0].meaningIfUnknown === '', 'katalogdaki ışık için modelin serbest metni atılıyor');
ok(out.remaining === 7 && out.limit === 10, 'kalan hak doğru (10 - 2 - 1)', JSON.stringify(out));
const st = await state();
const req = st.anthropicRequests[0];
ok(st.usageInserts === 1, 'kullanım kaydı yazıldı');
ok(req?.body.model === 'claude-opus-5-5', 'model: claude-opus-5-5', req?.body.model);
ok((req?.headers['anthropic-beta'] ?? '').includes('server-side-fallback-2026-07-01') && req?.body.fallbacks === 'default', 'reddetme yedeği açık');
ok(req?.body.output_config?.format?.type === 'json_schema', 'yapılandırılmış çıktı şeması gönderiliyor', JSON.stringify(req?.body.output_config));
ok(req?.body.output_config?.effort === 'medium', 'effort: medium');
ok(!('thinking' in (req?.body ?? {})), 'thinking parametresi gönderilmiyor (Opus 5.5 varsayılanı)');
const content = req?.body.messages?.[0]?.content ?? [];
ok(content[0]?.type === 'image' && content[0]?.source?.media_type === 'image/jpeg', 'fotoğraf görüntü bloğu olarak gidiyor');
ok(String(content[1]?.text).includes('Ford Focus 2016 Dizel') && String(content[1]?.text).includes('sabit'), 'araç bilgisi ve sürücü notu gidiyor', content[1]?.text);
ok(req?.body.system?.[0]?.cache_control?.type === 'ephemeral', 'sabit sistem metni önbelleğe işaretli');
const enumIds = req?.body.output_config?.format?.schema?.properties?.lights?.items?.properties?.catalog_id?.enum ?? [];
ok(enumIds.includes('oil_pressure') && enumIds.includes('unknown'), 'katalog kimlikleri şemada', enumIds.length);

await scenario('refusal');
r = await call(good);
ok(r.status === 422 && (await r.json()).error === 'refused', 'reddedilen istek düzgün hata döner', r.status);
ok((await state()).usageInserts === 1, 'reddedilen çağrı da kotaya sayılıyor');

await scenario('unknown_enum');
r = await call(good);
ok(r.status === 502, 'şemaya uymayan yanıt kullanıcıya gösterilmiyor', r.status);

console.log(failed ? `\n${failed} senaryo başarısız` : '\nTüm senaryolar geçti');
process.exit(failed ? 1 : 0);
