// Gösterge paneli fotoğrafındaki yanan uyarı ışıklarını tanır.
//
// Sorumluluk ayrımı: model yalnızca hangi ışığın yandığını, rengini ve yanıp sönüp sönmediğini söyler.
// "Aracı kullanabilir miyim?" kararını uygulama, packages/core içindeki küratörlü katalogdan verir.
//
// Akış: oturum doğrulama → açık rıza (ai_processing) → aylık kota → Claude → kullanım kaydı.
// Fotoğraf hiçbir yerde saklanmaz.
//
// Gerekli gizli değer: ANTHROPIC_API_KEY  (npx supabase secrets set ANTHROPIC_API_KEY=...)
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@1.8.0/helpers/beta/zod';
import { createClient } from 'npm:@supabase/supabase-js@2.119.1';
import * as z from 'npm:zod@4.6.7';

import { corsHeaders, json } from '../_shared/cors.ts';
import CATALOG from '../_shared/warning-lights.json' with { type: 'json' };

const FEATURE = 'warning_light';
const MODEL = 'claude-opus-5-5';
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
// Claude görüntü sınırı 5 MB; base64 ~4/3 büyütür
const MAX_BASE64_CHARS = 6_800_000;

const ids = (CATALOG as { id: string }[]).map((l) => l.id) as [string, ...string[]];

const ResultSchema = z.object({
  image_quality: z.enum(['ok', 'blurry', 'too_dark', 'glare', 'no_dashboard']),
  lights: z.array(
    z.object({
      catalog_id: z.enum([...ids, 'unknown']),
      color: z.enum(['red', 'amber', 'green', 'blue', 'white', 'unknown']),
      blinking: z.enum(['yes', 'no', 'unknown']),
      confidence: z.enum(['high', 'medium', 'low']),
      description: z.string(),
      meaning_if_unknown: z.string(),
    }),
  ),
});

const catalogList = (CATALOG as { id: string; name: string; symbol: string; color: string }[])
  .map((l) => `- ${l.id}: ${l.name} (${l.color}; simge: ${l.symbol})`)
  .join('\n');

// Sabit sistem metni: önbelleğe alınabilir, istekten isteğe değişmez
const SYSTEM = `You identify illuminated warning and indicator lights on a car or light-commercial-vehicle instrument cluster from a single photo. A driver in Türkiye is asking because a light came on; your output decides what we show them, so precision matters more than coverage.

Report only lights that are clearly illuminated. Ignore unlit symbols, gauges, trip computer text, reflections and the background. If the same light appears twice, report it once. Look closely at each lit symbol's shape before matching it.

Map each light to one id from this catalog. Use "unknown" when the symbol is not in the catalog or you cannot tell which catalog entry it is - a wrong match is worse than "unknown".
${catalogList}

For each light:
- color: the color it is actually shown in, in this photo.
- blinking: a still photo cannot show blinking, so answer "unknown" unless the user's note says it is blinking or steady.
- confidence: "high" only when both the symbol and its color are clearly visible.
- description: one short Turkish phrase describing what the symbol looks like.
- meaning_if_unknown: only for "unknown", one short Turkish sentence on what it most likely indicates, hedged; otherwise an empty string.

image_quality: "no_dashboard" if the photo does not show an instrument cluster (then return no lights), "blurry", "too_dark" or "glare" if that prevents reading symbols, otherwise "ok".`;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'not_configured' }, 503);

  // 1) Oturum
  // Oturum anahtarı açıkça verilir: anahtarsız getUser() sunucuya sormadan "oturum yok" döner
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  // 2) Girdi
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const image = typeof body.image === 'string' ? body.image.replace(/\s/g, '') : '';
  const mediaType = body.mediaType as (typeof MEDIA_TYPES)[number];
  if (!image || !MEDIA_TYPES.includes(mediaType)) return json({ error: 'bad_request' }, 400);
  if (image.length > MAX_BASE64_CHARS) return json({ error: 'image_too_large' }, 413);
  if (!/^[A-Za-z0-9+/]+=*$/.test(image)) return json({ error: 'bad_request' }, 400);
  const v = (body.vehicle ?? {}) as Record<string, unknown>;
  const vehicleLine = [str(v.make, 40), str(v.model, 60), str(v.year, 4), str(v.fuel, 20)].filter(Boolean).join(' ');
  const note = str(body.note, 200);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 3) Açık rıza: fotoğraf yurt dışındaki yapay zekâ hizmetine gönderilir
  const { data: consent } = await admin
    .from('consents').select('granted').eq('user_id', user.id).eq('consent', 'ai_processing')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!consent?.granted) return json({ error: 'consent_required' }, 403);

  // 4) Kota
  const { data: quota, error: quotaErr } = await admin.rpc('ai_quota', { p_feature: FEATURE, p_user: user.id }).single();
  if (quotaErr || !quota) return json({ error: 'quota_unavailable' }, 500);
  const { used, monthly_limit } = quota as { used: number; monthly_limit: number };
  if (used >= monthly_limit) return json({ error: 'quota_exceeded', used, limit: monthly_limit }, 429);

  // 5) Claude
  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Güvenlik sınıflandırıcısı reddederse istek aynı çağrı içinde uygun modelle yeniden çalışır
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(ResultSchema) },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: `Araç: ${vehicleLine || 'belirtilmedi'}${note ? `\nSürücünün notu: ${note}` : ''}` },
        ],
      }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 503);
    if (err instanceof Anthropic.BadRequestError) return json({ error: 'image_rejected' }, 422);
    if (err instanceof Anthropic.APIError) return json({ error: 'ai_unavailable' }, 502);
    return json({ error: 'ai_unavailable' }, 502);
  }

  // Model çağrıldıysa sonuç ne olursa olsun kullanım sayılır (maliyet oluştu)
  await admin.from('ai_usage').insert({ user_id: user.id, feature: FEATURE });
  const remaining = Math.max(0, monthly_limit - used - 1);

  if (response.stop_reason === 'refusal') return json({ error: 'refused', remaining }, 422);
  const out = response.parsed_output;
  if (response.stop_reason === 'max_tokens' || !out) return json({ error: 'ai_unavailable', remaining }, 502);

  return json({
    quality: out.image_quality,
    lights: out.lights.slice(0, 10).map((l) => ({
      catalogId: l.catalog_id,
      color: l.color,
      blinking: l.blinking,
      confidence: l.confidence,
      description: l.description.slice(0, 120),
      meaningIfUnknown: l.catalog_id === 'unknown' ? l.meaning_if_unknown.slice(0, 300) : '',
    })),
    remaining,
    limit: monthly_limit,
  });
});
