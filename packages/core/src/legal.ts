/**
 * Hukuk metinleri (kullanım koşulları, gizlilik politikası, KVKK aydınlatma).
 * Tek kaynak: legal-texts.json. Uygulama ekranları ve herkese açık web sayfaları (scripts/build-legal-site.mjs)
 * aynı metni gösterir. Metin değişince `version` artırılır; kullanıcılardan yeniden onay istenir.
 */
import TEXTS from './legal-texts.json';

export type LegalDocKey = 'kosullar' | 'gizlilik' | 'kvkk';

export interface LegalDoc {
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
}

export const LEGAL_VERSION: string = TEXTS.version;
export const LEGAL_UPDATED: string = TEXTS.updated;
export const LEGAL_STATUS: string = TEXTS.status;
export const SUPPORT_EMAIL: string = TEXTS.company.email;

function fill(s: string): string {
  return s.replace(/\{company\.(\w+)\}/g, (_, k: string) => (TEXTS.company as Record<string, string>)[k] ?? `{company.${k}}`);
}

export function legalDoc(key: LegalDocKey): LegalDoc {
  const d = TEXTS.documents[key];
  return {
    title: d.title,
    intro: fill(d.intro),
    sections: (d.sections as [string, string][]).map(([heading, body]) => ({ heading, body: fill(body) })),
  };
}

/** Metinde doldurulmamış (köşeli parantezli) alan kaldı mı — yayından önce kontrol için */
export function legalPlaceholders(): string[] {
  const all = JSON.stringify(TEXTS);
  return [...new Set(all.match(/\[[^\]]+\]/g) ?? [])];
}
