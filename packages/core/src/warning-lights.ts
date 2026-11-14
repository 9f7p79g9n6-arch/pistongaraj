/**
 * Gösterge paneli uyarı ışıkları.
 *
 * Güvenlik ilkesi: yapay zekâ yalnızca HANGİ ışığın yandığını (ve rengini, yanıp sönüp sönmediğini) söyler.
 * "Aracı kullanabilir miyim?" kararı ve yapılacaklar her zaman bu küratörlü katalogdan gelir.
 * Katalogda olmayan bir ışıkta karar renkten verilir ve kırmızı her zaman "dur" sayılır.
 */
import CATALOG_JSON from './warning-lights.json';

export type LightColor = 'red' | 'amber' | 'green' | 'blue' | 'white' | 'unknown';
export type LightSeverity = 'stop_now' | 'urgent' | 'soon' | 'info';
export type Confidence = 'high' | 'medium' | 'low';
export type Blinking = 'yes' | 'no' | 'unknown';

export interface WarningLight {
  id: string;
  name: string;
  /** Simgenin kısa tarifi (listeden seçerken yardımcı olur) */
  symbol: string;
  color: Exclude<LightColor, 'unknown'>;
  severity: LightSeverity;
  /** Yanıp sönerken ciddiyet farklıysa (ör. motor arıza lambası) */
  blinkingSeverity?: LightSeverity;
  meaning: string;
  steps: string[];
}

export const WARNING_LIGHTS: readonly WarningLight[] = CATALOG_JSON as WarningLight[];
export const WARNING_LIGHT_IDS: readonly string[] = WARNING_LIGHTS.map((l) => l.id);

/** Yapay zekâ servisinin döndürdüğü tek bir ışık tespiti */
export interface DetectedLight {
  catalogId: string; // katalog kimliği ya da 'unknown'
  color: LightColor;
  blinking: Blinking;
  confidence: Confidence;
  /** Simgenin nasıl göründüğü (Türkçe) */
  description: string;
  /** Yalnızca katalogda olmayan ışıklar için modelin kısa açıklaması */
  meaningIfUnknown: string;
}

export interface LightAssessment {
  light: WarningLight | null;
  name: string;
  color: LightColor;
  severity: LightSeverity;
  meaning: string;
  steps: string[];
  confidence: Confidence;
  blinking: Blinking;
  /** Kararın katalogdan mı yoksa renk kuralından mı geldiği */
  basis: 'catalog' | 'color_rule';
}

const SEVERITY_RANK: Record<LightSeverity, number> = { stop_now: 3, urgent: 2, soon: 1, info: 0 };

export function worstSeverity(list: LightSeverity[]): LightSeverity | null {
  if (!list.length) return null;
  return list.reduce((a, b) => (SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a));
}

const COLOR_RULE: Record<LightColor, { severity: LightSeverity; meaning: string; steps: string[] }> = {
  red: {
    severity: 'stop_now',
    meaning: 'Kırmızı uyarılar genellikle ciddi bir arızayı gösterir. Bu ışığı kesin olarak tanıyamadık.',
    steps: ['Güvenli bir yere çek ve aracı durdur.', 'Kullanım kılavuzunun uyarı ışıkları bölümüne bak.', 'Emin değilsen aracı kullanma; servis ya da yol yardımını ara.'],
  },
  amber: {
    severity: 'soon',
    meaning: 'Sarı ya da turuncu uyarılar genellikle kontrol gerektiren ama acil olmayan durumları gösterir. Bu ışığı kesin olarak tanıyamadık.',
    steps: ['Kullanım kılavuzunun uyarı ışıkları bölümüne bak.', 'Birkaç gün içinde servise kontrol ettir.', 'Araç farklı davranıyorsa (ses, güç kaybı, koku) beklemeden servise git.'],
  },
  green: { severity: 'info', meaning: 'Yeşil ışıklar genellikle bir sistemin açık olduğunu gösterir.', steps: [] },
  blue: { severity: 'info', meaning: 'Mavi ışıklar genellikle uzun far gibi bir sistemin açık olduğunu gösterir.', steps: [] },
  white: { severity: 'info', meaning: 'Beyaz ışıklar genellikle bilgi amaçlıdır.', steps: [] },
  // Rengi okunamayan ve tanınmayan ışıkta en kötüsü varsayılmaz ama kontrol önerilir
  unknown: {
    severity: 'urgent',
    meaning: 'Bu ışığı ve rengini tanıyamadık.',
    steps: ['Işığın rengine bak: kırmızıysa güvenli bir yerde dur.', 'Kullanım kılavuzunun uyarı ışıkları bölümüne bak.', 'Daha net bir fotoğrafla tekrar dene ya da listeden seç.'],
  },
};

export function findLight(id: string): WarningLight | null {
  return WARNING_LIGHTS.find((l) => l.id === id) ?? null;
}

/**
 * Tespiti değerlendirir. Katalogdaki ışıkta karar katalogdan gelir; modelin serbest metni kullanılmaz.
 * Model ışığı tanıdı ama tespit ettiği renk katalogdakinden daha ciddiyse (ör. katalogda sarı, fotoğrafta kırmızı)
 * renk kuralı da hesaba katılır ve daha ciddi olan kazanır.
 */
export function assessLight(d: DetectedLight): LightAssessment {
  const light = findLight(d.catalogId);
  if (light) {
    let severity = d.blinking === 'yes' && light.blinkingSeverity ? light.blinkingSeverity : light.severity;
    if (d.color === 'red' && light.color !== 'red') severity = worstSeverity([severity, 'urgent'])!;
    return {
      light, name: light.name, color: light.color, severity, meaning: light.meaning, steps: light.steps,
      confidence: d.confidence, blinking: d.blinking, basis: 'catalog',
    };
  }
  const rule = COLOR_RULE[d.color];
  const meaning = d.meaningIfUnknown.trim() ? `${rule.meaning} Olası anlamı: ${d.meaningIfUnknown.trim()}` : rule.meaning;
  return {
    light: null, name: d.description.trim() || 'Tanınmayan ışık', color: d.color, severity: rule.severity, meaning,
    steps: rule.steps, confidence: 'low', blinking: d.blinking, basis: 'color_rule',
  };
}

/** Listeden elle seçilen ışık için değerlendirme */
export function assessCatalogLight(id: string, blinking: Blinking = 'no'): LightAssessment | null {
  const light = findLight(id);
  if (!light) return null;
  return assessLight({ catalogId: id, color: light.color, blinking, confidence: 'high', description: light.symbol, meaningIfUnknown: '' });
}

export const SEVERITY_VERDICT: Record<LightSeverity, { title: string; body: string }> = {
  stop_now: { title: 'Aracı kullanma', body: 'Güvenli bir yere çek ve motoru durdur.' },
  urgent: { title: 'Dikkatle, en yakın servise', body: 'Kısa mesafe ve düşük hızla sür; en kısa sürede kontrol ettir.' },
  soon: { title: 'Sürebilirsin, kontrol ettir', body: 'Acil değil ama birkaç gün içinde servise göster.' },
  info: { title: 'Bilgi amaçlı', body: 'Bir arıza göstermiyor.' },
};

export const COLOR_LABEL: Record<LightColor, string> = {
  red: 'Kırmızı', amber: 'Sarı / turuncu', green: 'Yeşil', blue: 'Mavi', white: 'Beyaz', unknown: 'Renk belirsiz',
};
