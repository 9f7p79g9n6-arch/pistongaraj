import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ROLE_PERMISSIONS,
  computeServiceTotals,
  formatKurus,
  formatPhoneTR,
  hasPermission,
  itemsFromSimpleForm,
  needsCustomerAction,
  simpleFormFromItems,
  nextServiceStatus,
  normalizeEmail,
  normalizePhoneTR,
  parseKurus,
  validateBusiness,
  validateCustomer,
  validateServiceItem,
  validateTaxNumber,
  type ServiceItemInput,
} from '../src';

const item = (p: Partial<ServiceItemInput> = {}): ServiceItemInput => ({
  title: 'Yağ değişimi', description: null, partName: 'Motor yağı', partQty: 1, partUnitKurus: 0, laborKurus: 0, discountKurus: 0, ...p,
});

describe('servis tutarları', () => {
  it('parça ve işçilik ayrı toplanır', () => {
    const t = computeServiceTotals([
      item({ partQty: 4, partUnitKurus: 45_000, laborKurus: 60_000 }),
      item({ title: 'Filtre', partQty: 1, partUnitKurus: 25_050, laborKurus: 0 }),
    ], 20);
    expect(t.partsKurus).toBe(4 * 45_000 + 25_050);
    expect(t.laborKurus).toBe(60_000);
    expect(t.subtotalKurus).toBe(265_050);
    expect(t.vatKurus).toBe(53_010);
    expect(t.grandKurus).toBe(318_060);
  });

  it('indirim KDV öncesi düşülür, kalem tutarını aşamaz', () => {
    const t = computeServiceTotals([item({ partQty: 1, partUnitKurus: 10_000, laborKurus: 5_000, discountKurus: 99_999 })], 20);
    expect(t.discountKurus).toBe(15_000);
    expect(t.netKurus).toBe(0);
    expect(t.grandKurus).toBe(0);
  });

  it('KDV yoksa vergi sıfır', () => {
    const t = computeServiceTotals([item({ laborKurus: 12_345 })], null);
    expect(t).toMatchObject({ vatRate: null, vatKurus: 0, grandKurus: 12_345 });
  });

  it('yarım kuruş yukarı yuvarlanır', () => {
    // 1,25 ₺ × %10 = 0,125 ₺ → 13 kuruş
    expect(computeServiceTotals([item({ laborKurus: 125 })], 10).vatKurus).toBe(13);
  });

  it('boş liste', () => {
    expect(computeServiceTotals([], 20).grandKurus).toBe(0);
  });
});

describe('sade form: parça satırları ve işçilik', () => {
  const rows = (...r: [string, string][]) => r.map(([name, price]) => ({ name, price }));

  it('boş satırlar yok sayılır; parça ve işçilik ayrı toplanır', () => {
    const f = itemsFromSimpleForm(rows(['Fren balatası', '1.250,50'], ['', ''], ['Motor yağı', '900'], ['', '']), '750');
    expect(f.rowErrors).toEqual([null, null, null, null]);
    expect(f.partsKurus).toBe(215_050);
    expect(f.laborKurus).toBe(75_000);
    const t = computeServiceTotals(f.items, null);
    expect(t).toMatchObject({ partsKurus: 215_050, laborKurus: 75_000, grandKurus: 290_050 });
    for (const i of f.items) expect(validateServiceItem(i)).toBeNull();
  });

  it('eksik ve hatalı satırlar yakalanır', () => {
    const f = itemsFromSimpleForm(rows(['', '100'], ['Disk', ''], ['Filtre', 'abc'], ['Yağ', '-5'], ['Silecek', '0']), '');
    expect(f.rowErrors[0]).toMatch(/adını/);
    expect(f.rowErrors[1]).toMatch(/Fiyatı yaz/);
    expect(f.rowErrors[2]).toMatch(/biçiminde/);
    expect(f.rowErrors[3]).toMatch(/biçiminde/);
    expect(f.rowErrors[4]).toBeNull(); // ücretsiz parça
    expect(f.items).toHaveLength(1);
  });

  it('hatalı işçilik', () => {
    expect(itemsFromSimpleForm([], '12,345').laborError).not.toBeNull();
  });

  it('indirim önce işçilikten düşülür, kalem tutarını aşmaz; KDV mantığı korunur', () => {
    const f = itemsFromSimpleForm(rows(['Balata', '1000']), '300', '500');
    expect(f.discountError).toBeNull();
    expect(f.items.map((i) => i.discountKurus)).toEqual([30_000, 20_000]);
    const t = computeServiceTotals(f.items, 20);
    expect(t).toMatchObject({ subtotalKurus: 130_000, discountKurus: 50_000, netKurus: 80_000, vatKurus: 16_000, grandKurus: 96_000 });
    for (const i of f.items) expect(validateServiceItem(i)).toBeNull();
    expect(itemsFromSimpleForm(rows(['Balata', '10']), '', '11').discountError).not.toBeNull();
  });

  it('kalemlerden forma geri dönüş (düzeltme)', () => {
    const f = itemsFromSimpleForm(rows(['Balata', '1.250,50'], ['Yağ', '900']), '750', '100');
    const back = simpleFormFromItems(f.items);
    expect(back).toEqual({ rows: [{ name: 'Balata', price: '1250,50' }, { name: 'Yağ', price: '900' }], laborKurus: 75_000, discountKurus: 10_000 });
    // eski ayrıntılı kalem: adet ve kalem işçiliği
    const old = simpleFormFromItems([item({ partName: 'Yağ', partQty: 4, partUnitKurus: 45_000, laborKurus: 60_000 })]);
    expect(old).toEqual({ rows: [{ name: 'Yağ × 4', price: '1800' }], laborKurus: 60_000, discountKurus: 0 });
  });
});

describe('tutar girişi', () => {
  it('Türkçe biçimleri kuruşa çevirir', () => {
    expect(parseKurus('1.250,50')).toBe(125_050);
    expect(parseKurus('1250,5')).toBe(125_050);
    expect(parseKurus('1250')).toBe(125_000);
    expect(parseKurus('1.250')).toBe(125_000);
    expect(parseKurus('99.90')).toBe(9_990);
    expect(parseKurus('450 ₺')).toBe(45_000);
    expect(parseKurus('')).toBe(0);
  });
  it('geçersiz girişi reddeder', () => {
    expect(parseKurus('-5')).toBeNull();
    expect(parseKurus('12,345')).toBeNull();
    expect(parseKurus('abc')).toBeNull();
  });
  it('kuruşu biçimler', () => {
    expect(formatKurus(318_060)).toBe('3.180,60 ₺');
  });
});

describe('telefon', () => {
  it('farklı yazımları tek biçime getirir', () => {
    for (const raw of ['0532 123 45 67', '5321234567', '+90 532 123 45 67', '90 532 123 4567', '(0532) 123-45-67'])
      expect(normalizePhoneTR(raw)).toBe('+905321234567');
    expect(normalizePhoneTR('0212 555 11 22')).toBe('+902125551122');
  });
  it('geçersizleri reddeder', () => {
    for (const raw of ['123', '0632 123 45 67', '05321234567890', '']) expect(normalizePhoneTR(raw)).toBeNull();
  });
  it('ekranda okunur biçim', () => {
    expect(formatPhoneTR('+905321234567')).toBe('0532 123 45 67');
  });
});

describe('e-posta ve vergi no', () => {
  it('e-posta', () => {
    expect(normalizeEmail('  Usta@Ornek.COM ')).toBe('usta@ornek.com');
    expect(normalizeEmail('usta@ornek')).toBeNull();
  });
  it('vergi no isteğe bağlı, 10 ya da 11 hane', () => {
    expect(validateTaxNumber('')).toBeNull();
    expect(validateTaxNumber('1234567890')).toBeNull();
    expect(validateTaxNumber('12345')).not.toBeNull();
  });
});

describe('kayıt durumları', () => {
  it('müşteri yalnızca bekleyen kaydı yanıtlar', () => {
    expect(nextServiceStatus('awaiting_approval', 'approve')).toBe('approved');
    expect(nextServiceStatus('awaiting_approval', 'object')).toBe('objected');
    expect(nextServiceStatus('revised', 'approve')).toBe('approved');
    expect(nextServiceStatus('approved', 'object')).toBeNull();
    expect(nextServiceStatus('completed', 'approve')).toBeNull();
  });
  it('onaylı ya da itirazlı kayıt düzenlenince yeniden onay ister', () => {
    expect(nextServiceStatus('approved', 'edit')).toBe('revised');
    expect(nextServiceStatus('objected', 'edit')).toBe('revised');
    expect(nextServiceStatus('awaiting_approval', 'edit')).toBe('awaiting_approval');
    expect(nextServiceStatus('completed', 'edit')).toBeNull();
  });
  it('yalnızca onaylı kayıt tamamlanır', () => {
    expect(nextServiceStatus('approved', 'complete')).toBe('completed');
    expect(nextServiceStatus('awaiting_approval', 'complete')).toBeNull();
    expect(nextServiceStatus('objected', 'complete')).toBeNull();
  });
  it('müşteriden yanıt bekleyen durumlar', () => {
    expect(needsCustomerAction('awaiting_approval')).toBe(true);
    expect(needsCustomerAction('revised')).toBe(true);
    expect(needsCustomerAction('objected')).toBe(false);
  });
});

describe('yetkiler: uygulama ve sunucu aynı tabloyu kullanır', () => {
  it('ROLE_PERMISSIONS = private.role_permissions (migration)', () => {
    // Tüm migration'lardaki role_permissions eklemeleri toplanır (sonraki migration'lar yeni izin ekleyebilir)
    const dir = join(__dirname, '../../../supabase/migrations');
    const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const blocks = [...sql.matchAll(/insert into private\.role_permissions \(role, permission\) values([\s\S]*?);/g)].map((m) => m[1]).join('\n');
    const fromSql = [...blocks.matchAll(/\('(\w+)', '([\w.]+)'\)/g)].map((m) => `${m[1]}:${m[2]}`).sort();
    const fromTs = Object.entries(ROLE_PERMISSIONS).flatMap(([role, perms]) => perms.map((p) => `${role}:${p}`)).sort();
    expect(fromSql.length).toBeGreaterThan(0);
    expect(fromSql).toEqual(fromTs);
  });
});

describe('yetkiler', () => {
  it('sahip her şeyi yapar; teknisyen müşteri yönetemez; danışma kayıt düzenleyemez', () => {
    expect(hasPermission('owner', 'member.manage')).toBe(true);
    expect(hasPermission('technician', 'customer.manage')).toBe(false);
    expect(hasPermission('front_desk', 'record.edit')).toBe(false);
  });
});

describe('form doğrulama', () => {
  const biz = {
    name: 'Usta Oto', contactName: 'Ali Usta', phone: '0532 123 45 67', email: '', city: 'İstanbul', district: 'Kartal',
    address: 'Sanayi Sitesi 5. Blok No 12', category: 'mechanic' as const, taxOffice: '', taxNumber: '',
  };
  it('geçerli işletme', () => expect(validateBusiness(biz)).toEqual({}));
  it('eksik alanlar', () => {
    const e = validateBusiness({ ...biz, name: '', phone: '12', category: null });
    expect(Object.keys(e).sort()).toEqual(['category', 'name', 'phone']);
  });
  it('müşteri', () => {
    expect(validateCustomer({ fullName: 'Ayşe Yılmaz', phone: '05321234567', email: '' })).toEqual({});
    expect(Object.keys(validateCustomer({ fullName: 'A', phone: '', email: 'x' })).sort()).toEqual(['email', 'fullName', 'phone']);
  });
  it('işlem kalemi', () => {
    expect(validateServiceItem(item({ partUnitKurus: 100 }))).toBeNull();
    expect(validateServiceItem(item({ title: '' }))).not.toBeNull();
    expect(validateServiceItem(item({ partName: '', partQty: 2 }))).not.toBeNull();
    expect(validateServiceItem(item({ laborKurus: -1 }))).not.toBeNull();
    expect(validateServiceItem(item({ laborKurus: 100, discountKurus: 101 }))).not.toBeNull();
    expect(validateServiceItem(item({ partQty: 1.5 }))).not.toBeNull();
  });
});
