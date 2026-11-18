import { describe, expect, it } from 'vitest';

import { compactCountTR, validateDisplayName, validateSocialComment, validateSocialPost } from '../src/social';

const img = { kind: 'image' as const, mimeType: 'image/jpeg', sizeBytes: 1000, durationSec: null };
const vid = { kind: 'video' as const, mimeType: 'video/mp4', sizeBytes: 1000, durationSec: 30 };

describe('sosyal kurallar', () => {
  it('gönderi: metin ya da ek gerekir', () => {
    expect(validateSocialPost({ kind: 'post', body: ' ', media: [] })).not.toBeNull();
    expect(validateSocialPost({ kind: 'post', body: '', media: [img] })).toBeNull();
    expect(validateSocialPost({ kind: 'post', body: 'Yeni jantlar', media: [] })).toBeNull();
  });
  it('gönderi: fotoğraf ve video birlikte olmaz, en fazla 4 fotoğraf', () => {
    expect(validateSocialPost({ kind: 'post', body: '', media: [img, vid] })).not.toBeNull();
    expect(validateSocialPost({ kind: 'post', body: '', media: [img, img, img, img, img] })).not.toBeNull();
  });
  it('soru en az 10 karakter', () => {
    expect(validateSocialPost({ kind: 'question', body: 'Neden?', media: [] })).not.toBeNull();
    expect(validateSocialPost({ kind: 'question', body: 'Yağ değişimi kaç km de?', media: [] })).toBeNull();
  });
  it('yorum ve ad', () => {
    expect(validateSocialComment('  ')).not.toBeNull();
    expect(validateSocialComment('Güzel')).toBeNull();
    expect(validateSocialComment('x'.repeat(1001))).not.toBeNull();
    expect(validateDisplayName('A')).not.toBeNull();
    expect(validateDisplayName('Ayşe')).toBeNull();
  });
  it('kısa sayı', () => {
    expect(compactCountTR(950)).toBe('950');
    expect(compactCountTR(1200)).toBe('1,2 B');
    expect(compactCountTR(15000)).toBe('15 B');
    expect(compactCountTR(2_000_000)).toBe('2 Mn');
  });
});
