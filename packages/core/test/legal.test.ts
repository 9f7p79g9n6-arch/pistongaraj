import { describe, expect, it } from 'vitest';
import { LEGAL_VERSION, legalDoc, legalPlaceholders } from '../src';

describe('hukuk metinleri', () => {
  it('üç belge de dolu ve şirket alanları yerleştirilmiş', () => {
    for (const k of ['kosullar', 'gizlilik', 'kvkk'] as const) {
      const d = legalDoc(k);
      expect(d.sections.length).toBeGreaterThan(5);
      for (const s of d.sections) expect(s.body).not.toMatch(/\{company\./);
    }
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-v\d+$/);
  });
  it('Apple 1.2: kullanım koşullarında sıfır tolerans, şikâyet, engelleme ve 24 saat geçiyor', () => {
    const t = legalDoc('kosullar').sections.map((s) => s.body).join(' ');
    expect(t).toMatch(/tolerans gösterilmez/);
    expect(t).toMatch(/şikâyet/i);
    expect(t).toMatch(/engelleyebilir/);
    expect(t).toMatch(/24 saat/);
  });
  it('doldurulması gereken alanlar listeleniyor (yayından önce boş olmalı)', () => {
    expect(legalPlaceholders()).toContain('[ŞİRKET UNVANI]');
  });
});
