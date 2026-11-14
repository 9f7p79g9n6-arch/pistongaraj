import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assessCatalogLight, assessLight, worstSeverity, WARNING_LIGHTS, type DetectedLight } from '../src';

const det = (p: Partial<DetectedLight>): DetectedLight => ({
  catalogId: 'unknown', color: 'unknown', blinking: 'no', confidence: 'high', description: '', meaningIfUnknown: '', ...p,
});

describe('uyarı ışığı kataloğu', () => {
  it('kimlikler benzersiz ve her kayıt eksiksiz', () => {
    const ids = WARNING_LIGHTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of WARNING_LIGHTS) {
      expect(l.name.length, l.id).toBeGreaterThan(2);
      expect(l.meaning.length, l.id).toBeGreaterThan(10);
      expect(['red', 'amber', 'green', 'blue', 'white']).toContain(l.color);
      // Durmayı gerektiren ışıkların mutlaka yapılacaklar listesi olmalı
      if (l.severity !== 'info') expect(l.steps.length, l.id).toBeGreaterThan(0);
    }
  });

  it('kritik ışıklar "dur" der', () => {
    for (const id of ['oil_pressure', 'coolant_temp', 'brake_system']) expect(assessCatalogLight(id)!.severity).toBe('stop_now');
  });

  it('sunucudaki kopya katalogla aynı', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const a = readFileSync(join(here, '../src/warning-lights.json'), 'utf8');
    const b = readFileSync(join(here, '../../../supabase/functions/_shared/warning-lights.json'), 'utf8');
    expect(b).toBe(a);
  });
});

describe('ışık değerlendirmesi', () => {
  it('karar katalogdan gelir, modelin metni kullanılmaz', () => {
    const a = assessLight(det({ catalogId: 'oil_pressure', color: 'red', meaningIfUnknown: 'önemsiz, devam et' }));
    expect(a.severity).toBe('stop_now');
    expect(a.basis).toBe('catalog');
    expect(a.meaning).not.toContain('önemsiz');
  });

  it('yanıp sönen motor arıza lambası "dur"a yükselir', () => {
    expect(assessLight(det({ catalogId: 'check_engine', color: 'amber', blinking: 'no' })).severity).toBe('soon');
    expect(assessLight(det({ catalogId: 'check_engine', color: 'amber', blinking: 'yes' })).severity).toBe('stop_now');
  });

  it('yanıp sönen ESP normaldir', () => {
    expect(assessLight(det({ catalogId: 'esp', color: 'amber', blinking: 'yes' })).severity).toBe('info');
  });

  it('fotoğrafta kırmızı görünen sarı ışık en az "acil" sayılır', () => {
    expect(assessLight(det({ catalogId: 'abs', color: 'red' })).severity).toBe('urgent');
  });

  it('tanınmayan kırmızı ışık "dur" der, güven düşük', () => {
    const a = assessLight(det({ color: 'red', description: 'Ünlemli dişli' }));
    expect(a.severity).toBe('stop_now');
    expect(a.confidence).toBe('low');
    expect(a.basis).toBe('color_rule');
  });

  it('rengi de belirsiz tanınmayan ışık "acil" sayılır', () => {
    expect(assessLight(det({ color: 'unknown' })).severity).toBe('urgent');
  });

  it('en ciddi durum seçilir', () => {
    expect(worstSeverity(['info', 'soon', 'stop_now', 'urgent'])).toBe('stop_now');
    expect(worstSeverity([])).toBeNull();
  });
});

import { buildWarningLightPrompt, parseWarningLightReply } from '../src';

describe('ışık tanıma yanıtı', () => {
  it('talimat katalogdaki tüm kimlikleri ve aracı içerir', () => {
    const p = buildWarningLightPrompt('Ford Focus 2016', 'Işık sabit yanıyor.');
    for (const l of WARNING_LIGHTS) expect(p).toContain(`- ${l.id}:`);
    expect(p).toContain('Ford Focus 2016');
    expect(p).toContain('sabit');
  });

  it('geçerli yanıtı dönüştürür', () => {
    const r = parseWarningLightReply({ image_quality: 'ok', lights: [{ catalog_id: 'abs', color: 'amber', blinking: 'no', confidence: 'high', description: 'ABS', meaning_if_unknown: 'x' }] });
    expect(r!.lights[0]).toEqual({ catalogId: 'abs', color: 'amber', blinking: 'no', confidence: 'high', description: 'ABS', meaningIfUnknown: '' });
  });

  it('katalogda olmayan kimliği "unknown" ve düşük güven yapar', () => {
    const r = parseWarningLightReply({ lights: [{ catalog_id: 'uydurma', color: 'mor', confidence: 'high' }] });
    expect(r!.lights[0]).toMatchObject({ catalogId: 'unknown', color: 'unknown', confidence: 'low' });
  });

  it('bozuk yanıtı reddeder', () => {
    expect(parseWarningLightReply(null)).toBeNull();
    expect(parseWarningLightReply({ lights: 'yok' })).toBeNull();
    expect(parseWarningLightReply([1, 2])).toBeNull();
  });
});
