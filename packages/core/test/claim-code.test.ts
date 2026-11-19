import { describe, expect, it } from 'vitest';
import { formatClaimCode, isValidClaimCode, normalizeClaimCode } from '../src';

describe('servis kaydı kodu', () => {
  it('boşluk, tire ve küçük harfi tolere eder', () => {
    expect(normalizeClaimCode(' k7mp - 3xqa ')).toBe('K7MP3XQA');
    expect(isValidClaimCode('k7mp-3xqa')).toBe(true);
    expect(formatClaimCode('k7mp3xqa')).toBe('K7MP-3XQA');
  });
  it('karışan harfleri ve yanlış uzunluğu reddeder', () => {
    expect(isValidClaimCode('K7MP3XQ0')).toBe(false); // 0 yok
    expect(isValidClaimCode('K7MP3XQI')).toBe(false); // I yok
    expect(isValidClaimCode('K7MP3XQ')).toBe(false);
  });
});
