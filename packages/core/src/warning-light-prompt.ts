/**
 * Gösterge ışığı tanıma talimatı ve yanıt doğrulaması.
 * Sunucudaki supabase/functions/identify-warning-light ile aynı kuralları izler; o fonksiyon
 * yapılandırılmış çıktı (şema) kullanır, burada ise yanıt JSON olarak istenip elle doğrulanır.
 */
import { WARNING_LIGHTS, type Blinking, type Confidence, type DetectedLight, type LightColor } from './warning-lights';

export type ImageQuality = 'ok' | 'blurry' | 'too_dark' | 'glare' | 'no_dashboard';

const COLORS: LightColor[] = ['red', 'amber', 'green', 'blue', 'white', 'unknown'];
const BLINKS: Blinking[] = ['yes', 'no', 'unknown'];
const CONFS: Confidence[] = ['high', 'medium', 'low'];
const QUALITIES: ImageQuality[] = ['ok', 'blurry', 'too_dark', 'glare', 'no_dashboard'];

export function buildWarningLightPrompt(vehicleLine: string, note: string): string {
  const catalog = WARNING_LIGHTS.map((l) => `- ${l.id}: ${l.name} (${l.color}; simge: ${l.symbol})`).join('\n');
  return `You identify illuminated warning and indicator lights on a car or light-commercial-vehicle instrument cluster from the attached photo. A driver in Türkiye is asking because a light came on; your output decides what we show them, so precision matters more than coverage.

Report only lights that are clearly illuminated. Ignore unlit symbols, gauges, trip computer text, reflections and the background. If the same light appears twice, report it once. Look closely at each lit symbol's shape before matching it.

Map each light to one id from this catalog. Use "unknown" when the symbol is not in the catalog or you cannot tell which catalog entry it is - a wrong match is worse than "unknown".
${catalog}

For each light:
- color: the color it is actually shown in, in this photo: red, amber, green, blue, white or unknown.
- blinking: a still photo cannot show blinking, so answer "unknown" unless the driver's note says it is blinking or steady.
- confidence: "high" only when both the symbol and its color are clearly visible; otherwise "medium" or "low".
- description: one short Turkish phrase describing what the symbol looks like.
- meaning_if_unknown: only for "unknown", one short Turkish sentence on what it most likely indicates, hedged; otherwise "".

image_quality: "no_dashboard" if the photo does not show an instrument cluster (then return no lights), "blurry", "too_dark" or "glare" if that prevents reading symbols, otherwise "ok".

Vehicle: ${vehicleLine || 'not given'}
Driver's note: ${note || 'none'}

Reply with only one JSON object, no other text, in exactly this shape:
{"image_quality":"ok","lights":[{"catalog_id":"check_engine","color":"amber","blinking":"unknown","confidence":"high","description":"Motor silüeti","meaning_if_unknown":""}]}`;
}

/** Model yanıtını doğrular; tanınmayan alanları güvenli değerlere çevirir. Hiç kullanılamıyorsa null. */
export function parseWarningLightReply(raw: unknown): { quality: ImageQuality; lights: DetectedLight[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const quality = QUALITIES.includes(r.image_quality as ImageQuality) ? (r.image_quality as ImageQuality) : 'ok';
  if (!Array.isArray(r.lights)) return null;
  const ids = new Set(WARNING_LIGHTS.map((l) => l.id));
  const lights: DetectedLight[] = r.lights.slice(0, 10).flatMap((x): DetectedLight[] => {
    if (!x || typeof x !== 'object') return [];
    const l = x as Record<string, unknown>;
    const catalogId = typeof l.catalog_id === 'string' && ids.has(l.catalog_id) ? l.catalog_id : 'unknown';
    return [{
      catalogId,
      color: COLORS.includes(l.color as LightColor) ? (l.color as LightColor) : 'unknown',
      blinking: BLINKS.includes(l.blinking as Blinking) ? (l.blinking as Blinking) : 'unknown',
      // Katalog dışına düşen eşleşmenin güveni düşük sayılır
      confidence: catalogId === 'unknown' ? 'low' : CONFS.includes(l.confidence as Confidence) ? (l.confidence as Confidence) : 'low',
      description: typeof l.description === 'string' ? l.description.slice(0, 120) : '',
      meaningIfUnknown: catalogId === 'unknown' && typeof l.meaning_if_unknown === 'string' ? l.meaning_if_unknown.slice(0, 300) : '',
    }];
  });
  return { quality, lights };
}
