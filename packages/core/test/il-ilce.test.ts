import { describe, expect, it } from 'vitest';

import { canonicalProvince, districtsOf, searchTR, TR_PROVINCES } from '../src/turkiye-il-ilce';

describe('il ve ilçe listesi', () => {
  it('81 il, 973 ilçe, tekrar yok', () => {
    expect(TR_PROVINCES).toHaveLength(81);
    expect(new Set(TR_PROVINCES).size).toBe(81);
    const total = TR_PROVINCES.reduce((n, p) => n + districtsOf(p).length, 0);
    expect(total).toBe(973);
    for (const p of TR_PROVINCES) expect(new Set(districtsOf(p)).size).toBe(districtsOf(p).length);
  });
  it('büyükşehir ilçe sayıları', () => {
    expect(districtsOf('İstanbul')).toHaveLength(39);
    expect(districtsOf('Ankara')).toHaveLength(25);
    expect(districtsOf('İzmir')).toHaveLength(30);
    expect(districtsOf('Konya')).toHaveLength(31);
  });
  it('yazım farkı tanınır', () => {
    expect(canonicalProvince('istanbul')).toBe('İstanbul');
    expect(canonicalProvince(' IZMIR ')).toBe(null);
    expect(canonicalProvince('İZMİR')).toBe('İzmir');
    expect(canonicalProvince('Atlantis')).toBe(null);
    expect(districtsOf('konya')).toContain('Selçuklu');
  });
  it('arama: başında eşleşen önce', () => {
    expect(searchTR(TR_PROVINCES, 'kar').slice(0, 3)).toEqual(['Karabük', 'Karaman', 'Kars']);
    expect(searchTR(TR_PROVINCES, 'urfa')).toEqual(['Şanlıurfa']);
  });
});
