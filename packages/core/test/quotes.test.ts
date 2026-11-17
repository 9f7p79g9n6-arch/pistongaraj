import { describe, expect, it } from 'vitest';
import { mapsSearchUrl, ratingText, sortOffers, validateQuoteOffer, validateQuoteRequest, validateReview, type QuoteOffer } from '../src/quotes';

const req = { kind: 'service', title: 'Frenden ses geliyor', description: '', partName: '', city: 'Konya', vehicleLabel: 'Fiat Egea 2019' };

describe('teklif talebi', () => {
  it('geçerli talep', () => {
    expect(validateQuoteRequest(req)).toBeNull();
    expect(validateQuoteRequest({ ...req, kind: 'part', title: 'Ön balata takımı' })).toBeNull();
  });
  it('eksik alanlar', () => {
    expect(validateQuoteRequest({ ...req, title: 'Fren' })).toMatch(/Sorunu/);
    expect(validateQuoteRequest({ ...req, kind: 'part', title: 'x' })).toMatch(/parçayı/);
    expect(validateQuoteRequest({ ...req, city: '' })).toMatch(/Şehir/);
    expect(validateQuoteRequest({ ...req, vehicleLabel: '' })).toMatch(/Aracını/);
    expect(validateQuoteRequest({ ...req, kind: 'x' })).toMatch(/tür/);
  });
});

describe('teklif', () => {
  const base = { kind: 'service' as const, partsKurus: 150000, laborKurus: 50000, partCondition: null, note: '', eta: '' };
  it('geçerli teklif', () => {
    expect(validateQuoteOffer(base)).toBeNull();
    expect(validateQuoteOffer({ ...base, partsKurus: null })).toBeNull();
  });
  it('tutar zorunlu; parçada parça türü zorunlu', () => {
    expect(validateQuoteOffer({ ...base, partsKurus: 0, laborKurus: 0 })).toMatch(/tutar/);
    expect(validateQuoteOffer({ ...base, laborKurus: -1 })).toMatch(/doğru/);
    expect(validateQuoteOffer({ ...base, kind: 'part' })).toMatch(/orijinal/);
    expect(validateQuoteOffer({ ...base, kind: 'part', partCondition: 'equivalent' })).toBeNull();
  });
  it('en uygun teklif önce', () => {
    const o = (id: string, total: number, at: string) => ({ id, totalKurus: total, createdAt: at }) as QuoteOffer;
    expect(sortOffers([o('a', 300, '2'), o('b', 100, '3'), o('c', 100, '1')]).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('yorum ve rehber', () => {
  it('puan 1–5', () => {
    expect(validateReview({ rating: 5, comment: '' })).toBeNull();
    expect(validateReview({ rating: 0, comment: '' })).toMatch(/puan/);
    expect(validateReview({ rating: 4.5, comment: '' })).toMatch(/puan/);
  });
  it('puan metni ve harita bağlantısı', () => {
    expect(ratingText(null, 0)).toBe('Henüz yorum yok');
    expect(ratingText(4.56, 12)).toBe('4,6 (12)');
    expect(mapsSearchUrl({ name: 'Usta Oto', address: 'Sanayi 1', district: 'Selçuklu', city: 'Konya' })).toContain('Usta%20Oto');
  });
});
