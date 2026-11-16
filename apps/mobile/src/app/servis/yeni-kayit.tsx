/**
 * Yeni servis kaydı (ve düzeltme). Adım adım: araç → müşteri → kabul → işlemler → fotoğraflar → özet.
 * Taslak her değişiklikte cihaza yazılır; internet kesilirse ya da uygulama kapanırsa kaldığı yerden devam edilir.
 * Kayıt kimliği (clientRequestId) taslakla birlikte saklandığı için tekrar gönderimde ikinci kayıt açılmaz.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  computeServiceTotals,
  DEFAULT_VAT_RATE,
  formatKm,
  formatKurus,
  formatPhoneTR,
  FUEL_LEVEL_LABEL,
  normalizeEmail,
  normalizePhoneTR,
  normalizePlate,
  parseKurus,
  parseNumberTR,
  SERVICE_FILE_KIND_LABEL,
  validateCustomer,
  validateModelYear,
  validatePlate,
  validateServiceItem,
  VAT_RATES,
  type FuelLevel,
  type ServiceFileKind,
  type ServiceItemInput,
} from '@piston/core';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CustomerEmailHint, ItemsList, TotalsCard } from '@/components/servis';
import { Button, Card, Chip, ErrorText, Field, Muted, Progress, Row, Screen, Section, Segmented, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { serviceRepo, useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { MAX_FILE_BYTES, type PendingFile } from '@/data/service-repo';
import { confirm } from '@/lib/confirm';
import { pickServicePhoto } from '@/lib/photo';

const STEPS = ['Araç', 'Müşteri', 'Kabul', 'İşlemler', 'Fotoğraflar', 'Özet'] as const;

interface Draft {
  clientRequestId: string;
  editId: string | null;
  step: number;
  // Araç
  vehicleId: string | null;
  plate: string;
  make: string;
  model: string;
  year: string;
  engine: string;
  km: string;
  // Müşteri
  customerId: string | null;
  custName: string;
  custPhone: string;
  custEmail: string;
  // Kabul
  intakeText: string;
  complaint: string;
  initialNote: string;
  fuelLevel: FuelLevel | null;
  existingDamage: string;
  // İşlemler
  items: ServiceItemInput[];
  vatRate: number | null;
  // Dosyalar (henüz yüklenmemiş)
  files: PendingFile[];
  savedRecordId: string | null;
}

function nowText(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "16.11.2026 10:30" → ISO; geçersizse null. Gelecek tarih kabul edilmez (1 saat tolerans). */
function parseIntake(t: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const [, d, mo, y, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return null;
  if (date.getTime() > Date.now() + 3600_000 || y < 2000) return null;
  return date.toISOString();
}

const blank = (): Draft => ({
  clientRequestId: Crypto.randomUUID(), editId: null, step: 0,
  vehicleId: null, plate: '', make: '', model: '', year: '', engine: '', km: '',
  customerId: null, custName: '', custPhone: '', custEmail: '',
  intakeText: nowText(), complaint: '', initialNote: '', fuelLevel: null, existingDamage: '',
  items: [], vatRate: DEFAULT_VAT_RATE, files: [], savedRecordId: null,
});

const emptyItem = { title: '', description: '', partName: '', qty: '', unit: '', labor: '', discount: '' };
type ItemForm = typeof emptyItem;

export default function NewServiceRecord() {
  const biz = useBusiness();
  const params = useLocalSearchParams<{ arac?: string; musteri?: string; plaka?: string; duzenle?: string }>();
  const bid = biz.business?.id ?? '';
  const draftKey = `piston-servis-taslak:${bid}`;
  const [d, setD] = useState<Draft | null>(null);
  const [resume, setResume] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [itemIndex, setItemIndex] = useState<number | null>(null);
  const [custQuery, setCustQuery] = useState('');
  const loaded = useRef(false);
  // Kayıt gönderildikten sonra taslak bir daha yazılmaz
  const finished = useRef(false);

  // İlk yükleme: düzenleme, yarım kalan taslak ya da yeni kayıt
  useEffect(() => {
    if (loaded.current || !bid) return;
    loaded.current = true;
    (async () => {
      if (params.duzenle) {
        const r = biz.records.find((x) => x.id === params.duzenle);
        if (!r) { setErr('Kayıt bulunamadı.'); setD(blank()); return; }
        const v = biz.vehicles.find((x) => x.id === r.vehicleId);
        const c = biz.customers.find((x) => x.id === r.customerId);
        const dt = new Date(r.intakeAt);
        setD({
          ...blank(), editId: r.id, step: 2, vehicleId: r.vehicleId, plate: r.plate, make: v?.make ?? '', model: v?.model ?? '',
          year: v?.modelYear ? String(v.modelYear) : '', engine: v?.engineLabel ?? '', km: String(r.odometerKm),
          customerId: r.customerId, custName: c?.fullName ?? r.customerName, custPhone: c?.phone ?? '', custEmail: c?.email ?? '',
          intakeText: nowText(dt), complaint: r.complaint, initialNote: r.initialNote ?? '', fuelLevel: r.fuelLevel,
          existingDamage: r.existingDamage ?? '', items: r.items.map(({ id: _id, ...i }) => i), vatRate: r.totals.vatRate,
        });
        return;
      }
      const fresh = blank();
      const v = params.arac ? biz.vehicles.find((x) => x.id === params.arac) : undefined;
      if (v) Object.assign(fresh, { vehicleId: v.id, plate: v.plate, make: v.make, model: v.model, year: v.modelYear ? String(v.modelYear) : '', engine: v.engineLabel ?? '', customerId: v.customerId });
      else if (params.musteri) fresh.customerId = params.musteri;
      else if (params.plaka) fresh.plate = params.plaka;
      let saved: Draft | null = null;
      try { const raw = await AsyncStorage.getItem(draftKey); saved = raw ? (JSON.parse(raw) as Draft) : null; } catch { saved = null; }
      // Sunucuya ulaşmış (kimliği alınmış) taslak yeniden önerilmez
      if (saved?.savedRecordId && saved.files.length === 0) { AsyncStorage.removeItem(draftKey).catch(() => {}); saved = null; }
      if (saved && !params.arac && !params.musteri && (saved.plate || saved.items.length > 0)) setResume(saved);
      setD(fresh);
    })();
  }, [bid, biz.records, biz.vehicles, biz.customers, params, draftKey]);

  // Taslağı cihaza yaz (yalnızca yeni kayıtta)
  useEffect(() => {
    if (!d || d.editId || resume || finished.current) return;
    AsyncStorage.setItem(draftKey, JSON.stringify(d)).catch(() => {});
  }, [d, draftKey, resume]);

  const up = useCallback((patch: Partial<Draft>) => setD((p) => (p ? { ...p, ...patch } : p)), []);

  const plateNorm = d ? normalizePlate(d.plate) : '';
  const foundVehicle = useMemo(() => (d && !d.editId ? biz.vehicles.find((v) => v.plate === plateNorm) : undefined), [biz.vehicles, plateNorm, d]);
  const vehicle = d?.vehicleId ? biz.vehicles.find((v) => v.id === d.vehicleId) : undefined;
  const customer = d?.customerId ? biz.customers.find((c) => c.id === d.customerId) : undefined;
  const phoneNorm = d ? normalizePhoneTR(d.custPhone) : null;
  const phoneMatch = phoneNorm && !d?.customerId ? biz.customers.find((c) => c.phone === phoneNorm) : undefined;
  const totals = useMemo(() => computeServiceTotals(d?.items ?? [], d?.vatRate ?? null), [d?.items, d?.vatRate]);

  if (!biz.business) return <Screen title="Yeni servis kaydı" back>{null}</Screen>;
  if (!d) return <Screen title="Yeni servis kaydı" back><Muted>Yükleniyor…</Muted></Screen>;

  // ---------------- Adım doğrulamaları ----------------
  const checkStep = (step: number): string | null => {
    if (step === 0) {
      if (d.vehicleId) return null;
      const pe = validatePlate(d.plate) ?? (d.plate.trim() ? null : 'Plakayı yaz.');
      if (pe) return pe;
      if (!d.make.trim() || !d.model.trim()) return 'Marka ve modeli yaz.';
      if (d.year.trim()) { const ye = validateModelYear(Number(d.year)); if (ye) return ye; }
    }
    if (step === 0 || step === 2) {
      const k = parseNumberTR(d.km);
      if (k == null || k < 0 || k > 2_000_000) return 'Kilometreyi rakamla yaz.';
    }
    if (step === 1) {
      if (d.customerId) return null;
      if (phoneMatch) return 'Bu telefonla kayıtlı müşteri var. Listeden seç.';
      const e = validateCustomer({ fullName: d.custName, phone: d.custPhone, email: d.custEmail });
      const first = Object.values(e)[0];
      if (first) return first;
    }
    if (step === 2) {
      if (!parseIntake(d.intakeText)) return 'Kabul tarihini 16.11.2026 10:30 biçiminde yaz (ileri tarih olamaz).';
      if (d.complaint.trim().length < 2) return 'Müşterinin şikâyetini yaz.';
    }
    if (step === 3) {
      if (d.items.length === 0) return 'En az bir işlem ekle.';
      for (const i of d.items) { const e = validateServiceItem(i); if (e) return `${i.title || 'İşlem'}: ${e}`; }
    }
    return null;
  };

  const next = () => {
    const e = checkStep(d.step);
    setErr(e);
    if (e) return;
    // Plaka kayıtlı bir araçla eşleşiyorsa araç ve müşteri otomatik seçilir
    if (d.step === 0 && !d.vehicleId && foundVehicle) {
      up({ vehicleId: foundVehicle.id, customerId: foundVehicle.customerId, make: foundVehicle.make, model: foundVehicle.model, step: 1 });
      return;
    }
    up({ step: Math.min(d.step + 1, STEPS.length - 1) });
  };
  const prev = () => { setErr(null); up({ step: Math.max(d.step - (d.editId && d.step === 2 ? 0 : 1), 0) }); };

  // ---------------- İşlem kalemi ----------------
  const openItem = (index: number | null) => {
    setItemIndex(index);
    if (index == null) { setItemForm({ ...emptyItem }); return; }
    const i = d.items[index]!;
    const k = (n: number) => (n ? formatKurus(n).replace(' ₺', '') : '');
    setItemForm({ title: i.title, description: i.description ?? '', partName: i.partName ?? '', qty: i.partQty ? String(i.partQty) : '', unit: k(i.partUnitKurus), labor: k(i.laborKurus), discount: k(i.discountKurus) });
  };
  const saveItem = () => {
    if (!itemForm) return;
    const unit = parseKurus(itemForm.unit), labor = parseKurus(itemForm.labor), discount = parseKurus(itemForm.discount);
    const qty = itemForm.qty.trim() ? Number(itemForm.qty) : itemForm.partName.trim() ? 1 : 0;
    if (unit == null || labor == null || discount == null) return setErr('Tutarları 1.250,50 biçiminde yaz.');
    const item: ServiceItemInput = {
      title: itemForm.title.trim(), description: itemForm.description.trim() || null, partName: itemForm.partName.trim() || null,
      partQty: qty, partUnitKurus: unit, laborKurus: labor, discountKurus: discount,
    };
    const e = validateServiceItem(item);
    if (e) return setErr(e);
    setErr(null);
    const items = [...d.items];
    if (itemIndex == null) items.push(item); else items[itemIndex] = item;
    up({ items });
    setItemForm(null);
  };
  const removeItem = () => {
    if (itemIndex == null) return;
    up({ items: d.items.filter((_, i) => i !== itemIndex) });
    setItemForm(null);
  };

  // ---------------- Fotoğraf ----------------
  const addPhoto = async (kind: ServiceFileKind, source: 'camera' | 'library') => {
    const res = await pickServicePhoto(source);
    if (!res.ok) {
      if (res.reason === 'denied') setErr('Kamera izni verilmedi. Ayarlardan izin verebilir ya da galeriden seçebilirsin.');
      else if (res.reason === 'failed') setErr('Fotoğraf eklenemedi.');
      return;
    }
    if (res.sizeBytes > MAX_FILE_BYTES) return setErr('Fotoğraf 10 MB sınırını aşıyor.');
    if (d.files.length >= 20) return setErr('Bir kayda en fazla 20 fotoğraf eklenebilir.');
    setErr(null);
    up({ files: [...d.files, { uri: res.uri, kind, mimeType: 'image/jpeg', sizeBytes: res.sizeBytes }] });
  };

  // ---------------- Kaydet ----------------
  const submit = async () => {
    for (const s of [0, 1, 2, 3]) {
      const e = checkStep(s);
      if (e) { setErr(e); up({ step: s }); return; }
    }
    setBusy(true);
    setErr(null);
    let work = { ...d };
    try {
      // 1) Müşteri ve araç (yeni ise). Oluşan kimlikler taslağa yazılır; tekrar denemede yeniden oluşturulmaz.
      if (!work.customerId) {
        const c = await serviceRepo.addCustomer({ businessId: bid, fullName: work.custName.trim(), phone: normalizePhoneTR(work.custPhone)!, email: normalizeEmail(work.custEmail) });
        work = { ...work, customerId: c.id };
        setD(work);
      }
      if (!work.vehicleId) {
        const v = await serviceRepo.addVehicle({
          businessId: bid, customerId: work.customerId!, plate: work.plate, make: work.make, model: work.model,
          modelYear: work.year.trim() ? Number(work.year) : null, engineLabel: work.engine.trim() || null, odometerKm: Math.round(parseNumberTR(work.km)!),
        });
        work = { ...work, vehicleId: v.id };
        setD(work);
      }
      // 2) Servis kaydı (tek işlem; tutarlar sunucuda hesaplanır)
      const recordId = await serviceRepo.saveRecord({
        id: work.editId ?? undefined, businessId: bid, customerId: work.customerId!, vehicleId: work.vehicleId!, clientRequestId: work.clientRequestId,
        intakeAt: parseIntake(work.intakeText)!, odometerKm: Math.round(parseNumberTR(work.km)!), complaint: work.complaint.trim(),
        initialNote: work.initialNote.trim() || null, fuelLevel: work.fuelLevel, existingDamage: work.existingDamage.trim() || null,
        vatRate: work.vatRate, items: work.items,
      });
      work = { ...work, savedRecordId: recordId };
      setD(work);
      // 3) Fotoğraflar
      if (work.files.length > 0) {
        await serviceRepo.addFiles(bid, recordId, work.files);
        work = { ...work, files: [] };
        setD(work);
      }
      finished.current = true;
      if (!work.editId) await AsyncStorage.removeItem(draftKey).catch(() => {});
      await biz.refresh();
      router.replace(`/servis/kayit/${recordId}`);
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Kayıt gönderilemedi. İnternetini kontrol et; taslak bu cihazda saklandı, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!(await confirm('Taslağı sil', 'Girdiğin bilgiler silinecek.', 'Sil', true))) return;
    finished.current = true;
    await AsyncStorage.removeItem(draftKey).catch(() => {});
    router.back();
  };

  // ---------------- Yarım kalan taslak ----------------
  if (resume) {
    return (
      <Screen title="Yeni servis kaydı" back>
        <Card style={{ gap: space.sm }}>
          <Text v="bodyStrong">Yarım kalan bir kayıt var</Text>
          <Muted small>{[resume.plate ? normalizePlate(resume.plate) : '', resume.custName, `${resume.items.length} işlem`].filter(Boolean).join(' · ')}</Muted>
          <Button title="Kaldığım yerden devam et" variant="primary" onPress={() => { setD(resume); setResume(null); }} />
          <Button title="Yeni kayda başla" variant="ghost" onPress={() => { AsyncStorage.removeItem(draftKey).catch(() => {}); setResume(null); }} />
        </Card>
      </Screen>
    );
  }

  const isLast = d.step === STEPS.length - 1;
  const footer = (
    <Stack gap={space.sm}>
      <ErrorText>{err}</ErrorText>
      <Row gap={space.sm}>
        {d.step > (d.editId ? 2 : 0) && <Button title="Geri" onPress={prev} style={{ flex: 1 }} />}
        {isLast ? (
          <Button title={d.editId ? 'Düzeltmeyi gönder' : 'Kaydı tamamla'} variant="primary" onPress={submit} loading={busy} style={{ flex: 2 }} />
        ) : (
          <Button title="Devam" variant="primary" onPress={next} style={{ flex: 2 }} />
        )}
      </Row>
    </Stack>
  );

  return (
    <Screen title={d.editId ? 'Kaydı düzelt' : 'Yeni servis kaydı'} back footer={itemForm ? undefined : footer}>
      <Stack gap={6} style={{ marginBottom: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text v="label">{`Adım ${d.step + 1} / ${STEPS.length}`}</Text>
          <Text v="smallStrong">{STEPS[d.step]}</Text>
        </Row>
        <Progress ratio={(d.step + 1) / STEPS.length} tone="bad" />
      </Stack>

      {/* ADIM 1: ARAÇ */}
      {d.step === 0 && (
        <Stack gap={space.md}>
          <Field label="Plaka" value={d.plate} autoCapitalize="characters" placeholder="34 ABC 123" autoFocus={!d.plate}
            onChangeText={(t) => up({ plate: t, vehicleId: null })} />
          {(vehicle ?? foundVehicle) ? (
            <Card highlight style={{ gap: 4 }}>
              <Text v="bodyStrong">Kayıtlı araç bulundu</Text>
              <Muted small>{`${(vehicle ?? foundVehicle)!.make} ${(vehicle ?? foundVehicle)!.model} · ${biz.customers.find((c) => c.id === (vehicle ?? foundVehicle)!.customerId)?.fullName ?? ''}`}</Muted>
              {(vehicle ?? foundVehicle)!.lastOdometerKm != null && <Muted small>{`Son kayıtlı kilometre: ${formatKm((vehicle ?? foundVehicle)!.lastOdometerKm!)}`}</Muted>}
              <Muted small>Bilgileri tekrar girmen gerekmiyor.</Muted>
            </Card>
          ) : (
            <>
              <Muted small>Plaka yalnızca işletmenin kendi kayıtlarında aranır. Bulunamazsa aracı aşağıdan ekle.</Muted>
              <Row>
                <Field label="Marka" value={d.make} onChangeText={(t) => up({ make: t })} />
                <Field label="Model" value={d.model} onChangeText={(t) => up({ model: t })} />
              </Row>
              <Row>
                <Field label="Model yılı" value={d.year} onChangeText={(t) => up({ year: t })} keyboardType="number-pad" />
                <Field label="Motor (isteğe bağlı)" value={d.engine} onChangeText={(t) => up({ engine: t })} placeholder="1.6 TDCi" />
              </Row>
            </>
          )}
          <Field label="Kilometre" value={d.km} onChangeText={(t) => up({ km: t })} keyboardType="number-pad" placeholder="148.760" />
        </Stack>
      )}

      {/* ADIM 2: MÜŞTERİ */}
      {d.step === 1 && (
        <Stack gap={space.md}>
          {customer ? (
            <Card style={{ gap: 4 }}>
              <Text v="bodyStrong">{customer.fullName}</Text>
              <Muted small>{[formatPhoneTR(customer.phone), customer.email].filter(Boolean).join(' · ')}</Muted>
              {d.vehicleId ? <Muted small>Kayıtlı aracın sahibi.</Muted> : <Button title="Başka müşteri seç" small variant="ghost" onPress={() => up({ customerId: null })} />}
              {!customer.email && <Muted small>E-postası yok: kaydı uygulamada göremez. Müşteri sayfasından eklenebilir (Aşama 2: telefonla eşleştirme).</Muted>}
            </Card>
          ) : (
            <>
              <Field label="Kayıtlı müşteri ara" value={custQuery} onChangeText={setCustQuery} placeholder="Ad veya telefon" />
              <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
                {custQuery.trim().length >= 2 && biz.customers.filter((c) => c.fullName.toLocaleLowerCase('tr').includes(custQuery.trim().toLocaleLowerCase('tr'))
                  || c.phone.includes(custQuery.replace(/\D/g, '').replace(/^0/, '') || '—')).slice(0, 6).map((c) => (
                  <Chip key={c.id} label={`${c.fullName} · ${formatPhoneTR(c.phone)}`} onPress={() => up({ customerId: c.id })} />
                ))}
              </Row>
              <Section title="Yeni müşteri">
                <Field label="Adı soyadı" value={d.custName} onChangeText={(t) => up({ custName: t })} autoCapitalize="words" />
                <Field label="Telefon" value={d.custPhone} onChangeText={(t) => up({ custPhone: t })} keyboardType="phone-pad" placeholder="0532 123 45 67" />
                {phoneMatch && (
                  <Card highlight onPress={() => up({ customerId: phoneMatch.id })} style={{ gap: 2 }}>
                    <Text v="bodyStrong">{`Bu telefon ${phoneMatch.fullName} adına kayıtlı`}</Text>
                    <Muted small>Tekrar kayıt açmamak için dokunup seç.</Muted>
                  </Card>
                )}
                <Field label="E-posta (isteğe bağlı)" value={d.custEmail} onChangeText={(t) => up({ custEmail: t })} keyboardType="email-address" autoCapitalize="none" />
                <CustomerEmailHint />
              </Section>
            </>
          )}
        </Stack>
      )}

      {/* ADIM 3: KABUL */}
      {d.step === 2 && (
        <Stack gap={space.md}>
          <Row>
            <Field label="Kabul tarihi ve saati" value={d.intakeText} onChangeText={(t) => up({ intakeText: t })} placeholder="16.11.2026 10:30" />
            <Field label="Kilometre" value={d.km} onChangeText={(t) => up({ km: t })} keyboardType="number-pad" />
          </Row>
          <Field label="Müşterinin bildirdiği şikâyet" value={d.complaint} onChangeText={(t) => up({ complaint: t })} multiline placeholder="Örn. Periyodik bakım, frenden ses geliyor" />
          <Field label="İlk gözlem (isteğe bağlı)" value={d.initialNote} onChangeText={(t) => up({ initialNote: t })} multiline />
          <Text v="smallStrong" color={colors.textMuted}>Yakıt seviyesi (isteğe bağlı)</Text>
          <Segmented<FuelLevel | 'none'>
            options={[{ value: 'none', label: '—' }, ...(Object.keys(FUEL_LEVEL_LABEL) as FuelLevel[]).map((k) => ({ value: k, label: FUEL_LEVEL_LABEL[k] }))]}
            value={d.fuelLevel ?? 'none'} onChange={(v) => up({ fuelLevel: v === 'none' ? null : v })} />
          <Field label="Teslimde görülen mevcut hasarlar (isteğe bağlı)" value={d.existingDamage} onChangeText={(t) => up({ existingDamage: t })} multiline placeholder="Örn. arka tamponda çizik" />
          <PhotoRow kind="intake" files={d.files} onAdd={addPhoto} onRemove={(uri) => up({ files: d.files.filter((f) => f.uri !== uri) })} />
        </Stack>
      )}

      {/* ADIM 4: İŞLEMLER */}
      {d.step === 3 && !itemForm && (
        <Stack gap={space.md}>
          <ItemsList items={d.items} onPress={openItem} />
          <Button title="İşlem ekle" icon="plus" onPress={() => openItem(null)} />
          <Text v="smallStrong" color={colors.textMuted}>KDV</Text>
          <Segmented<string>
            options={[...VAT_RATES.map((r) => ({ value: String(r), label: `%${r}` })), { value: 'none', label: 'KDV yok' }]}
            value={d.vatRate == null ? 'none' : String(d.vatRate)} onChange={(v) => up({ vatRate: v === 'none' ? null : Number(v) })} />
          <TotalsCard totals={totals} />
        </Stack>
      )}
      {d.step === 3 && itemForm && (
        <Stack gap={space.md}>
          <Text v="section">{itemIndex == null ? 'İşlem ekle' : 'İşlemi düzenle'}</Text>
          <Field label="İşlem adı" value={itemForm.title} onChangeText={(t) => setItemForm({ ...itemForm, title: t })} placeholder="Örn. Ön balata değişimi" autoFocus />
          <Field label="Açıklama (isteğe bağlı)" value={itemForm.description} onChangeText={(t) => setItemForm({ ...itemForm, description: t })} multiline />
          <Section title="Parça">
            <Field label="Parça adı" value={itemForm.partName} onChangeText={(t) => setItemForm({ ...itemForm, partName: t })} placeholder="Boş bırakılırsa yalnızca işçilik" />
            <Row>
              <Field label="Adet" value={itemForm.qty} onChangeText={(t) => setItemForm({ ...itemForm, qty: t })} keyboardType="number-pad" placeholder="1" />
              <Field label="Birim fiyat (₺)" value={itemForm.unit} onChangeText={(t) => setItemForm({ ...itemForm, unit: t })} keyboardType="decimal-pad" placeholder="0,00" />
            </Row>
          </Section>
          <Section title="İşçilik ve indirim">
            <Row>
              <Field label="İşçilik (₺)" value={itemForm.labor} onChangeText={(t) => setItemForm({ ...itemForm, labor: t })} keyboardType="decimal-pad" placeholder="0,00" />
              <Field label="İndirim (₺)" value={itemForm.discount} onChangeText={(t) => setItemForm({ ...itemForm, discount: t })} keyboardType="decimal-pad" placeholder="0,00" />
            </Row>
          </Section>
          <ErrorText>{err}</ErrorText>
          <Button title={itemIndex == null ? 'İşlemi ekle' : 'Kaydet'} variant="primary" onPress={saveItem} />
          {itemIndex != null && <Button title="İşlemi sil" variant="ghost" onPress={removeItem} />}
          <Button title="Vazgeç" variant="ghost" onPress={() => { setItemForm(null); setErr(null); }} />
        </Stack>
      )}

      {/* ADIM 5: FOTOĞRAFLAR VE BELGELER */}
      {d.step === 4 && (
        <Stack gap={space.lg}>
          <Muted small>İsteğe bağlı. Fotoğraflar küçültülerek eklenir (en fazla 10 MB, JPEG). Kayıtla birlikte müşteriye görünür.</Muted>
          <PhotoRow kind="replaced_part" files={d.files} onAdd={addPhoto} onRemove={(uri) => up({ files: d.files.filter((f) => f.uri !== uri) })} />
          <PhotoRow kind="work" files={d.files} onAdd={addPhoto} onRemove={(uri) => up({ files: d.files.filter((f) => f.uri !== uri) })} />
          <PhotoRow kind="document" files={d.files} onAdd={addPhoto} onRemove={(uri) => up({ files: d.files.filter((f) => f.uri !== uri) })} />
          <Muted small>PDF belge ekleme sonraki sürümde; şimdilik belgenin fotoğrafını çekebilirsin.</Muted>
          {d.editId && <Muted small>Önceden eklenen fotoğraflar kayıtta kalır; burada yalnızca yenilerini eklersin.</Muted>}
        </Stack>
      )}

      {/* ADIM 6: ÖZET */}
      {d.step === 5 && (
        <Stack gap={space.md}>
          <Card style={{ gap: 4 }}>
            <Text v="title" style={{ letterSpacing: 1 }}>{normalizePlate(d.plate)}</Text>
            <Muted small>{`${d.make} ${d.model} · ${d.km} km`}</Muted>
            <Muted small>{customer ? customer.fullName : `${d.custName} (yeni müşteri)`}</Muted>
            <Muted small>{`Kabul: ${d.intakeText}`}</Muted>
            <Text style={{ marginTop: 4 }}>{d.complaint}</Text>
          </Card>
          <ItemsList items={d.items} />
          <TotalsCard totals={totals} />
          {d.files.length > 0 && <Muted small>{`${d.files.length} fotoğraf eklenecek.`}</Muted>}
          <Card style={{ gap: 4 }}>
            <Text v="bodyStrong">Kaydedince ne olur?</Text>
            <Muted small>
              {d.editId
                ? 'Düzeltme kaydedilir, eski ve yeni değerler denetim geçmişine yazılır. Kayıt yeniden "müşteri onayı bekliyor" durumuna geçer.'
                : 'Kayıt "Müşteri onayı bekliyor" durumunda açılır. Müşteri PISTON GARAGE hesabıyla eşleşiyorsa kaydı uygulamasında görür.'}
            </Muted>
            <Muted small>WhatsApp ile paylaşım bağlantısı ve anlık bildirim bir sonraki aşamada eklenecek.</Muted>
          </Card>
          {!d.editId && <Button title="Taslağı sil" variant="ghost" small onPress={discard} />}
        </Stack>
      )}
    </Screen>
  );
}

function PhotoRow({ kind, files, onAdd, onRemove }: {
  kind: ServiceFileKind; files: PendingFile[]; onAdd: (k: ServiceFileKind, s: 'camera' | 'library') => void; onRemove: (uri: string) => void;
}) {
  const mine = files.filter((f) => f.kind === kind);
  return (
    <Stack gap={space.sm}>
      <Text v="smallStrong" color={colors.textMuted}>{`${SERVICE_FILE_KIND_LABEL[kind]} fotoğrafları`}</Text>
      <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
        {mine.map((f) => (
          <Pressable key={f.uri} onPress={() => onRemove(f.uri)} accessibilityRole="button" accessibilityLabel="Fotoğrafı kaldır">
            <Image source={{ uri: f.uri }} style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: colors.surface }} contentFit="cover" />
            <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 5 }}>
              <Text v="small" color="#fff">×</Text>
            </View>
          </Pressable>
        ))}
      </Row>
      <Row gap={space.sm}>
        <Button title="Fotoğraf çek" icon="camera" small onPress={() => onAdd(kind, 'camera')} />
        <Button title="Galeriden" small onPress={() => onAdd(kind, 'library')} />
      </Row>
    </Stack>
  );
}
