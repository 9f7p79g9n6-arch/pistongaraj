/** İşletme kayıt ve düzenleme formu (isletme-ac ve servis/profil ekranları) */
import {
  BUSINESS_CATEGORIES,
  normalizeEmail,
  normalizePhoneTR,
  validateBusiness,
  type Business,
  type BusinessInput,
} from '@piston/core';
import { useState } from 'react';
import { View } from 'react-native';

import { space } from '@/constants/theme';
import type { NewBusiness } from '@/data/service-repo';
import { Button, Card, Chip, ErrorText, Field, Muted, Row, Section, Text } from './ui';

export function toBusinessInput(b: Business | null): BusinessInput {
  return {
    name: b?.name ?? '', contactName: b?.contactName ?? '', phone: b?.phone ? b.phone.replace(/^\+90/, '0') : '', email: b?.email ?? '',
    city: b?.city ?? '', district: b?.district ?? '', address: b?.address ?? '', category: b?.category ?? null,
    taxOffice: b?.taxOffice ?? '', taxNumber: b?.taxNumber ?? '',
  };
}

export function BusinessForm({ initial, submitLabel, onSubmit }: {
  initial: BusinessInput; submitLabel: string; onSubmit: (b: NewBusiness) => Promise<void>;
}) {
  const [f, setF] = useState<BusinessInput>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof BusinessInput, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof BusinessInput>(k: K) => (v: BusinessInput[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const e = validateBusiness(f);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setErr('Eksik ya da hatalı alanları düzelt.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({
        name: f.name.trim(), contactName: f.contactName.trim(), phone: normalizePhoneTR(f.phone)!, email: normalizeEmail(f.email),
        city: f.city.trim(), district: f.district.trim(), address: f.address.trim(), category: f.category!,
        taxOffice: f.taxOffice.trim() || null, taxNumber: f.taxNumber.trim() || null,
      });
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <Section title="İşletme">
        <Field label="İşletme adı" value={f.name} onChangeText={set('name')} error={errors.name} placeholder="Örn. Yıldız Oto Servis" />
        <Text v="smallStrong">İşletme kategorisi</Text>
        <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
          {BUSINESS_CATEGORIES.map((c) => (
            <Chip key={c.value} label={c.label} selected={f.category === c.value} onPress={() => set('category')(c.value)} />
          ))}
        </Row>
        <ErrorText>{errors.category}</ErrorText>
      </Section>

      <Section title="Yetkili ve iletişim">
        <Field label="Yetkili kişinin adı soyadı" value={f.contactName} onChangeText={set('contactName')} error={errors.contactName} autoCapitalize="words" />
        <Field label="Telefon" value={f.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" placeholder="0532 123 45 67" />
        <Field label="E-posta (isteğe bağlı)" value={f.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
      </Section>

      <Section title="Adres">
        <Row>
          <Field label="Şehir" value={f.city} onChangeText={set('city')} error={errors.city} />
          <Field label="İlçe" value={f.district} onChangeText={set('district')} error={errors.district} />
        </Row>
        <Field label="Açık adres" value={f.address} onChangeText={set('address')} error={errors.address} multiline placeholder="Sanayi sitesi, blok, no" />
      </Section>

      <Section title="Vergi bilgileri (isteğe bağlı)">
        <Muted small>Fatura kesiyorsan yaz. Uygulama fatura düzenlemez.</Muted>
        <Field label="Vergi dairesi" value={f.taxOffice} onChangeText={set('taxOffice')} error={errors.taxOffice} />
        <Field label="Vergi no / TC kimlik no" value={f.taxNumber} onChangeText={set('taxNumber')} error={errors.taxNumber} keyboardType="number-pad" />
      </Section>

      <Card style={{ gap: 4 }}>
        <Text v="smallStrong">Logo ve işletme fotoğrafı</Text>
        <Muted small>Logo yükleme bir sonraki aşamada eklenecek.</Muted>
      </Card>

      <ErrorText>{err}</ErrorText>
      <Button title={submitLabel} variant="primary" onPress={submit} loading={busy} />
    </View>
  );
}
