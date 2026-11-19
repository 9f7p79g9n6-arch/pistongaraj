/**
 * Servis kaydı kodu: işletme müşteriye WhatsApp ya da PDF ile iletir; müşteri uygulamaya girince kayıt hesabına bağlanır.
 * 8 karakter, 0/O ve 1/I yok. Sunucudaki private.normalize_claim_code ile aynı kural.
 */
const ALPHABET_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export function normalizeClaimCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function isValidClaimCode(raw: string): boolean {
  return ALPHABET_RE.test(normalizeClaimCode(raw));
}

/** "K7MP3XQA" → "K7MP-3XQA" */
export function formatClaimCode(code: string): string {
  const c = normalizeClaimCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export type ClaimResult = 'claimed' | 'already_mine' | 'invalid' | 'already_claimed' | 'rate_limited';

export const CLAIM_RESULT_MESSAGE: Record<ClaimResult, string> = {
  claimed: 'Servis kaydı hesabına eklendi.',
  already_mine: 'Bu kayıt zaten hesabında.',
  invalid: 'Kod bulunamadı. Servisin gönderdiği kodu kontrol et.',
  already_claimed: 'Bu kod başka bir hesapta kullanılmış. Servisten yeni kod iste.',
  rate_limited: 'Çok fazla yanlış deneme yapıldı. Bir saat sonra tekrar dene.',
};
