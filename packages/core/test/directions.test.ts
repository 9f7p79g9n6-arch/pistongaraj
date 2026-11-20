import { describe, expect, it } from 'vitest';

import { businessCoords, directionsUrls } from '../src';

const base = { name: 'Konum Oto', address: 'Sanayi 1. Cadde No 2', district: 'Çankaya', city: 'Ankara' };

describe('yol tarifi', () => {
  it('konum kayıtlıysa tam noktaya araç rotası', () => {
    const u = directionsUrls({ ...base, latitude: 39.9208, longitude: 32.8541 });
    expect(u.exact).toBe(true);
    expect(u.apple).toContain('daddr=39.9208,32.8541');
    expect(u.apple).toContain('dirflg=d');
    expect(u.google).toContain('destination=39.9208%2C32.8541');
    expect(u.google).toContain('travelmode=driving');
  });
  it('konum yoksa açık adrese', () => {
    const u = directionsUrls({ ...base, latitude: null, longitude: null });
    expect(u.exact).toBe(false);
    expect(decodeURIComponent(u.google)).toContain('Konum Oto, Sanayi 1. Cadde No 2, Çankaya/Ankara');
    expect(businessCoords(base)).toBe(null);
  });
});
