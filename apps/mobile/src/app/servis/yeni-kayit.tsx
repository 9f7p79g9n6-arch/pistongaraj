/**
 * Yeni servis kaydı (ve düzeltme). Üç adım: araç ve müşteri → değişen parçalar ve fiyatları → kontrol et ve gönder.
 * İsteğe bağlı alanlar "Ek bilgiler" altında kapalı durur. Taslak her değişiklikte cihaza yazılır; uygulama kapanırsa
 * kaldığı yerden devam edilir. Kayıt kimliği (clientRequestId) taslakla saklandığı için tekrar gönderimde ikinci kayıt açılmaz.
 * Parça satırları sunucuda yine service_record_items olarak saklanır (bkz. packages/core itemsFromSimpleForm).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  computeServiceTotals,
  DEFAULT_VAT_RATE,
  formatKm,
  formatKurus,
  formatPhoneTR,
  FUEL_LEVEL_LABEL,
  itemsFromSimpleForm,
  kurusToInput,
  normalizeEmail,
  normalizePhoneTR,
  normalizePlate,
  parseNumberTR,
  SERVICE_FILE_KIND_LABEL,
  simpleFormFromItems,
  validateCustomer,
  validateModelYear,
  validatePlate,
  VAT_RATES,
  type FuelLevel,
  type PartRow,
  type ServiceFileKind,
} from '@piston/core';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Icon } from '@/components/icons';
import { CustomerEmailHint, ItemsList, TotalsCard } from '@/components/servis';
import { Button, Card, ErrorText, Field, Muted, Progress, Row, s as ui, Screen, Segmented, Stack, Text, useAccent } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { serviceRepo, useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { MAX_FILE_BYTES, type PendingFile } from '@/data/service-repo';
import { confirm } from '@/lib/confirm';
import { pickServicePhoto } from '@/lib/photo';

const STEPS = ['Araç ve müşteri', 'Değişen parçalar', 'Kontrol et ve gönder'] as const;
const START_ROWS = 4;

interface Draft {
  v: 2;
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
  complaint: string;
  // Parçalar ve ücret
  rows: PartRow[];
  labor: string;
  discount: string;
  vatRate: number | null;
  // Ek bilgiler
  intakeText: string;
  initialNote: string;
  fuelLevel: FuelLevel | null;
  existingDamage: string;
  files: PendingFile[];
  savedRecordId: string | null;
}

function nowText(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "16.11.2026 10:30" → ISO; geçersizse null. İleri tarih kabul edilmez (1 saat tolerans). */
function parseIntake(t: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const [, d, mo, y, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return null;
  if (date.getTime() > Date.now() + 3600_000 || y < 2000) return null;
  return date.toISOString();
}

const emptyRows = (n = START_ROWS): PartRow[] => Array.from({ length: n }, () => ({ name: '', price: '' }));

const blank = (): Draft => ({
  v: 2, clientRequestId: Crypto.randomUUID(), editId: null, step: 0,
  vehicleId: null, plate: '', make: '', model: '', year: '', engine: '', km: '',
  customerId: null, custName: '', custPhone: '', custEmail: '', complaint: '',
  rows: emptyRows(), labor: '', discount: '', vatRate: DEFAULT_VAT_RATE,
  intakeText: nowText(), initialNote: '', fuelLevel: null, existingDamage: '', files: [], savedRecordId: null,
});

export default function NewServiceRecord() {
  const biz = useBusiness();
  const accent = useAccent();
  const params = useLocalSearchParams<{ arac?: string; musteri?: string; plaka?: string; duzenle?: string }>();
  const bid = biz.business?.id ?? '';
  const draftKey = `piston-servis-taslak-v2:${bid}`;
  const [d, setD] = useState<Draft | null>(null);
  const [resume, setResume] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extraVehicle, setExtraVehicle] = useState(false);
  const [extraIntake, setExtraIntake] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
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
        const f = simpleFormFromItems(r.items);
        setD({
          ...blank(), editId: r.id, step: 1, vehicleId: r.vehicleId, plate: r.plate, make: v?.make ?? '', model: v?.model ?? '',
          year: v?.modelYear ? String(v.modelYear) : '', engine: v?.engineLabel ?? '', km: String(r.odometerKm),
          customerId: r.customerId, custName: c?.fullName ?? r.customerName, custPhone: c?.phone ?? '', custEmail: c?.email ?? '',
          complaint: r.complaint, rows: [...f.rows, ...emptyRows(Math.max(0, START_ROWS - f.rows.length))],
          labor: f.laborKurus ? kurusToInput(f.laborKurus) : '', discount: f.discountKurus ? kurusToInput(f.discountKurus) : '',
          vatRate: r.totals.vatRate, intakeText: nowText(new Date(r.intakeAt)), initialNote: r.initialNote ?? '',
          fuelLevel: r.fuelLevel, existingDamage: r.existingDamage ?? '',
        });
        if (f.discountKurus) setShowDiscount(true);
        return;
      }
      const fresh = blank();
      const v = params.arac ? biz.vehicles.find((x) => x.id === params.arac) : undefined;
      if (v) Object.assign(fresh, { vehicleId: v.id, plate: v.plate, make: v.make, model: v.model, customerId: v.customerId });
      else if (params.musteri) fresh.customerId = params.musteri;
      else if (params.plaka) fresh.plate = params.plaka;
      let saved: Draft | null = null;
      try { const raw = await AsyncStorage.getItem(draftKey); saved = raw ? (JSON.parse(raw) as Draft) : null; } catch { saved = null; }
      if (saved && saved.v !== 2) saved = null;
      // Sunucuya ulaşmış (kimliği alınmış) taslak yeniden önerilmez
      if (saved?.savedRecordId && saved.files.length === 0) { AsyncStorage.removeItem(draftKey).catch(() => {}); saved = null; }
      if (saved && !params.arac && !params.musteri && (saved.plate || saved.rows.some((r) => r.name || r.price))) setResume(saved);
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
  const vehicle = (d?.vehicleId ? biz.vehicles.find((v) => v.id === d.vehicleId) : undefined) ?? foundVehicle;
  const phoneNorm = d ? normalizePhoneTR(d.custPhone) : null;
  const phoneMatch = phoneNorm ? biz.customers.find((c) => c.phone === phoneNorm) : undefined;
  const customer = biz.customers.find((c) => c.id === (vehicle?.customerId ?? d?.customerId)) ?? (!vehicle ? phoneMatch : undefined);
  const form = useMemo(() => itemsFromSimpleForm(d?.rows ?? [], d?.labor ?? '', showDiscount ? d?.discount ?? '' : ''), [d?.rows, d?.labor, d?.discount, showDiscount]);
  const totals = useMemo(() => computeServiceTotals(form.items, d?.vatRate ?? null), [form.items, d?.vatRate]);

  if (!biz.business) return <Screen title="Yeni servis kaydı" back>{null}</Screen>;
  if (!d) return <Screen title="Yeni servis kaydı" back><Muted>Yükleniyor…</Muted></Screen>;

  // ---------------- Adım doğrulamaları ----------------
  const checkStep = (step: number): string | null => {
    if (step === 0) {
      if (!vehicle) {
        const pe = validatePlate(d.plate) ?? (d.plate.trim() ? null : 'Plakayı yaz.');
        if (pe) return pe;
        if (!d.make.trim() || !d.model.trim()) return 'Marka ve modeli yaz.';
        if (d.year.trim()) { const ye = validateModelYear(Number(d.year)); if (ye) return ye; }
      }
      const k = parseNumberTR(d.km);
      if (k == null || k < 0 || k > 2_000_000) return 'Kilometreyi rakamla yaz.';
      if (!customer) {
        const e = validateCustomer({ fullName: d.custName, phone: d.custPhone, email: d.custEmail });
        const first = e.fullName ?? e.phone ?? e.email;
        if (first) return first;
      }
      if (d.complaint.trim().length < 2) return 'Müşterinin şikâyetini ya da istenen işi yaz.';
    }
    if (step === 1) {
      if (form.rowErrors.some(Boolean)) return 'İşaretli parça satırlarını düzelt.';
      if (form.laborError) return form.laborError;
      if (form.discountError) return form.discountError;
      if (form.items.length === 0) return 'En az bir parça ya da işçilik ücreti gir.';
    }
    if (step === 2 && !parseIntake(d.intakeText)) return 'Kabul tarihini 16.11.2026 10:30 biçiminde yaz (ileri tarih olamaz).';
    return null;
  };

  const next = () => {
    const e = checkStep(d.step);
    setErr(e);
    setShowErrors(!!e);
    if (e) return;
    setShowErrors(false);
    up({ step: Math.min(d.step + 1, STEPS.length - 1), vehicleId: vehicle?.id ?? null, customerId: customer?.id ?? null });
  };
  const firstStep = d.editId ? 1 : 0;
  const prev = () => { setErr(null); setShowErrors(false); up({ step: Math.max(d.step - 1, firstStep) }); };

  // ---------------- Parça satırları ----------------
  const setRow = (i: number, patch: Partial<PartRow>) => up({ rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addRow = () => up({ rows: [...d.rows, { name: '', price: '' }] });
  const removeRow = (i: number) => {
    const rows = d.rows.filter((_, j) => j !== i);
    up({ rows: rows.length > 0 ? rows : emptyRows(1) });
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
  const removePhoto = (uri: string) => up({ files: d.files.filter((f) => f.uri !== uri) });

  // ---------------- Kaydet ----------------
  const submit = async () => {
    for (const st of [0, 1, 2]) {
      if (d.editId && st === 0) continue;
      const e = checkStep(st);
      if (e) { setErr(e); setShowErrors(true); up({ step: st }); return; }
    }
    setBusy(true);
    setErr(null);
    let work = { ...d, vehicleId: vehicle?.id ?? d.vehicleId, customerId: customer?.id ?? d.customerId };
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
        vatRate: work.vatRate, items: form.items,
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
    const parts = resume.rows.filter((r) => r.name.trim()).length;
    return (
      <Screen title="Yeni servis kaydı" back>
        <Card style={{ gap: space.sm }}>
          <Text v="bodyStrong">Yarım kalan bir kayıt var</Text>
          <Muted small>{[resume.plate ? normalizePlate(resume.plate) : '', resume.custName, `${parts} parça`].filter(Boolean).join(' · ')}</Muted>
          <Button title="Kaldığım yerden devam et" variant="primary" onPress={() => { setD(resume); setResume(null); }} />
          <Button title="Yeni kayda başla" variant="ghost" onPress={() => { AsyncStorage.removeItem(draftKey).catch(() => {}); setResume(null); }} />
        </Card>
      </Screen>
    );
  }

  const isLast = d.step === STEPS.length - 1;
  const footer = (
    <Stack gap={space.sm}>
      {d.step === 1 && (
        <Row style={{ justifyContent: 'space-between' }}>
          <Text v="bodyStrong">Genel toplam</Text>
          <Text v="bodyStrong" color={accent.text}>{formatKurus(totals.grandKurus)}</Text>
        </Row>
      )}
      <ErrorText>{err}</ErrorText>
      <Row gap={space.sm}>
        {d.step > firstStep && <Button title="Geri" onPress={prev} style={{ flex: 1 }} />}
        {isLast ? (
          <Button title={d.editId ? 'Düzeltmeyi gönder' : 'Müşteriye gönder'} variant="primary" onPress={submit} loading={busy} style={{ flex: 2 }} />
        ) : (
          <Button title="Devam" variant="primary" onPress={next} style={{ flex: 2 }} />
        )}
      </Row>
    </Stack>
  );

  return (
    <Screen title={d.editId ? 'Kaydı düzelt' : 'Yeni servis kaydı'} back footer={footer}>
      <Stack gap={6} style={{ marginBottom: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text v="label">{`Adım ${d.step + 1} / ${STEPS.length}`}</Text>
          <Text v="smallStrong">{STEPS[d.step]}</Text>
        </Row>
        <Progress ratio={(d.step + 1) / STEPS.length} tone="bad" />
      </Stack>

      {/* ADIM 1: ARAÇ VE MÜŞTERİ */}
      {d.step === 0 && (
        <Stack gap={space.md}>
          <Row>
            <Field label="Plaka" value={d.plate} autoCapitalize="characters" placeholder="34 ABC 123" autoFocus={!d.plate}
              onChangeText={(t) => up({ plate: t, vehicleId: null })} />
            <Field label="Kilometre" value={d.km} onChangeText={(t) => up({ km: t })} keyboardType="number-pad" placeholder="148.760" />
          </Row>

          {vehicle ? (
            <Card highlight style={{ gap: 2 }}>
              <Text v="bodyStrong">{`${vehicle.make} ${vehicle.model}`}</Text>
              <Muted small>{[customer?.fullName, customer ? formatPhoneTR(customer.phone) : null].filter(Boolean).join(' · ')}</Muted>
              {vehicle.lastOdometerKm != null && <Muted small>{`Son kayıtlı kilometre: ${formatKm(vehicle.lastOdometerKm)}`}</Muted>}
            </Card>
          ) : (
            <>
              <Row>
                <Field label="Marka" value={d.make} onChangeText={(t) => up({ make: t })} />
                <Field label="Model" value={d.model} onChangeText={(t) => up({ model: t })} />
              </Row>
              {customer && d.customerId ? (
                <Card style={{ gap: 2 }}>
                  <Text v="bodyStrong">{customer.fullName}</Text>
                  <Muted small>{formatPhoneTR(customer.phone)}</Muted>
                  <Button title="Başka müşteri" small variant="ghost" onPress={() => up({ customerId: null })} />
                </Card>
              ) : (
                <>
                  <Row>
                    <Field label="Müşteri adı soyadı" value={d.custName} onChangeText={(t) => up({ custName: t })} autoCapitalize="words" />
                    <Field label="Telefon" value={d.custPhone} onChangeText={(t) => up({ custPhone: t })} keyboardType="phone-pad" placeholder="0532 123 45 67" />
                  </Row>
                  {phoneMatch && <Muted small>{`Kayıtlı müşteri: ${phoneMatch.fullName}. Bu kayıt ona eklenecek.`}</Muted>}
                </>
              )}
            </>
          )}

          <Field label="Şikâyet / istenen iş" value={d.complaint} onChangeText={(t) => up({ complaint: t })} placeholder="Örn. Periyodik bakım, frenden ses geliyor" />

          <Card style={{ gap: space.sm }}>
            <PhotoRow kind="intake" files={d.files} onAdd={addPhoto} onRemove={removePhoto} title="Araç fotoğrafları (isteğe bağlı)" />
            <Muted small>Aracın geliş hâlini, hasarları ya da kilometreyi çek. Fotoğrafa dokunarak kaldırabilirsin.</Muted>
          </Card>

          {!vehicle && (
            <Expander title="Ek bilgiler (isteğe bağlı)" open={extraVehicle} onToggle={() => setExtraVehicle(!extraVehicle)}>
              <Row>
                <Field label="Model yılı" value={d.year} onChangeText={(t) => up({ year: t })} keyboardType="number-pad" />
                <Field label="Motor" value={d.engine} onChangeText={(t) => up({ engine: t })} placeholder="1.6 TDCi" />
              </Row>
              {!customer && (
                <>
                  <Field label="Müşteri e-postası" value={d.custEmail} onChangeText={(t) => up({ custEmail: t })} keyboardType="email-address" autoCapitalize="none" />
                  <CustomerEmailHint />
                </>
              )}
            </Expander>
          )}
        </Stack>
      )}

      {/* ADIM 2: DEĞİŞEN PARÇALAR VE FİYATLARI */}
      {d.step === 1 && (
        <Stack gap={space.md}>
          <Text v="section">Değişen parçalar ve fiyatları</Text>
          <Stack gap={space.sm}>
            {d.rows.map((r, i) => (
              <Stack key={i} gap={4}>
                <Row gap={space.sm}>
                  <TextInput value={r.name} onChangeText={(t) => setRow(i, { name: t })} placeholder="Parça adı" placeholderTextColor={colors.iconMuted}
                    accessibilityLabel={`Parça ${i + 1} adı`} style={[ui.input, { flex: 2 }, showErrors && form.rowErrors[i] && { borderColor: colors.danger }]} />
                  <TextInput value={r.price} onChangeText={(t) => setRow(i, { price: t })} placeholder="Fiyat ₺" placeholderTextColor={colors.iconMuted}
                    keyboardType="decimal-pad" accessibilityLabel={`Parça ${i + 1} fiyatı`} style={[ui.input, { flex: 1, textAlign: 'right' }, showErrors && form.rowErrors[i] && { borderColor: colors.danger }]} />
                  <Pressable onPress={() => removeRow(i)} accessibilityRole="button" accessibilityLabel={`Parça ${i + 1} satırını sil`} hitSlop={8}
                    style={{ width: 32, alignItems: 'center' }}>
                    <Icon name="x" size={18} color={colors.textMuted} />
                  </Pressable>
                </Row>
                {showErrors && form.rowErrors[i] ? <Text v="small" color={colors.danger}>{form.rowErrors[i]}</Text> : null}
              </Stack>
            ))}
          </Stack>
          <Button title="Yeni Parça Ekle" icon="plus" onPress={addRow} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="bodyStrong">Parça Toplamı</Text>
            <Text v="bodyStrong">{formatKurus(form.partsKurus)}</Text>
          </Row>

          <Field label="İşçilik ücreti (₺)" value={d.labor} onChangeText={(t) => up({ labor: t })} keyboardType="decimal-pad" placeholder="0"
            error={showErrors ? form.laborError : null} />

          <Text v="smallStrong" color={colors.textMuted}>KDV</Text>
          <Segmented<string>
            options={[...VAT_RATES.map((r) => ({ value: String(r), label: `%${r}` })), { value: 'none', label: 'KDV yok' }]}
            value={d.vatRate == null ? 'none' : String(d.vatRate)} onChange={(v) => up({ vatRate: v === 'none' ? null : Number(v) })} />
          {showDiscount ? (
            <Field label="İndirim (₺)" value={d.discount} onChangeText={(t) => up({ discount: t })} keyboardType="decimal-pad" placeholder="0"
              error={form.discountError} />
          ) : (
            <Text v="smallStrong" color={accent.text} onPress={() => setShowDiscount(true)} accessibilityRole="button">+ İndirim ekle</Text>
          )}
          <TotalsCard totals={totals} />
        </Stack>
      )}

      {/* ADIM 3: KONTROL ET VE GÖNDER */}
      {d.step === 2 && (
        <Stack gap={space.md}>
          <Card style={{ gap: 4 }}>
            <Text v="title" style={{ letterSpacing: 1 }}>{normalizePlate(d.plate)}</Text>
            <Muted small>{`${vehicle ? `${vehicle.make} ${vehicle.model}` : `${d.make} ${d.model}`} · ${formatKm(parseNumberTR(d.km) ?? 0)}`}</Muted>
            <Muted small>{customer ? customer.fullName : `${d.custName} (yeni müşteri)`}</Muted>
            <Text style={{ marginTop: 4 }}>{d.complaint}</Text>
          </Card>
          <ItemsList items={form.items} />
          <TotalsCard totals={totals} />

          <Expander title="Ek bilgiler (isteğe bağlı)" open={extraIntake} onToggle={() => setExtraIntake(!extraIntake)}
            hint="Kabul saati, yakıt, mevcut hasarlar, değişen parça fotoğrafları">
            <Field label="Kabul tarihi ve saati" value={d.intakeText} onChangeText={(t) => up({ intakeText: t })} placeholder="16.11.2026 10:30" />
            <Field label="İlk gözlem" value={d.initialNote} onChangeText={(t) => up({ initialNote: t })} multiline />
            <Text v="smallStrong" color={colors.textMuted}>Yakıt seviyesi</Text>
            <Segmented<FuelLevel | 'none'>
              options={[{ value: 'none', label: '—' }, ...(Object.keys(FUEL_LEVEL_LABEL) as FuelLevel[]).map((k) => ({ value: k, label: FUEL_LEVEL_LABEL[k] }))]}
              value={d.fuelLevel ?? 'none'} onChange={(v) => up({ fuelLevel: v === 'none' ? null : v })} />
            <Field label="Teslimde görülen mevcut hasarlar" value={d.existingDamage} onChangeText={(t) => up({ existingDamage: t })} multiline placeholder="Örn. arka tamponda çizik" />
            <PhotoRow kind="replaced_part" files={d.files} onAdd={addPhoto} onRemove={removePhoto} />
            {d.editId && <Muted small>Önceden eklenen fotoğraflar kayıtta kalır; burada yalnızca yenilerini eklersin.</Muted>}
          </Expander>

          <Muted small>
            {d.editId
              ? 'Düzeltme kaydedilir; eski ve yeni değerler saklanır.'
              : 'Kayıt açık olarak kaydedilir. İş bitip ücreti aldığında kayıt sayfasında “Ücret alındı” de; kayıt tamamlanır ve ciroya girer. Müşteri onayı gerekmez.'}
          </Muted>
          {!d.editId && <Button title="Taslağı sil" variant="ghost" small onPress={discard} />}
        </Stack>
      )}
    </Screen>
  );
}

function Expander({ title, hint, open, onToggle, children }: { title: string; hint?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <Card style={{ gap: space.md }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text v="bodyStrong">{title}</Text>
          {hint && !open ? <Muted small>{hint}</Muted> : null}
        </View>
        <Text v="bodyStrong" color={colors.textMuted}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open && <Stack gap={space.md}>{children}</Stack>}
    </Card>
  );
}

function PhotoRow({ kind, files, onAdd, onRemove, title }: {
  kind: ServiceFileKind; files: PendingFile[]; onAdd: (k: ServiceFileKind, s: 'camera' | 'library') => void; onRemove: (uri: string) => void; title?: string;
}) {
  const mine = files.filter((f) => f.kind === kind);
  return (
    <Stack gap={space.sm}>
      <Text v="smallStrong" color={title ? colors.text : colors.textMuted}>{title ?? `${SERVICE_FILE_KIND_LABEL[kind]} fotoğrafları`}</Text>
      {mine.length > 0 && (
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
      )}
      <Row gap={space.sm}>
        <Button title="Fotoğraf çek" icon="camera" small onPress={() => onAdd(kind, 'camera')} />
        <Button title="Galeriden" small onPress={() => onAdd(kind, 'library')} />
      </Row>
    </Stack>
  );
}
