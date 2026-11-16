import { formatPhoneTR, normalizeEmail, normalizePhoneTR, validateCustomer, type CustomerInput } from '@piston/core';
import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, ErrorText, Field, Muted, Screen, Stack, Text } from '@/components/ui';

import { space } from '@/constants/theme';
import { CustomerEmailHint } from '@/components/servis';
import { useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';

export default function AddCustomer() {
  const biz = useBusiness();
  const [f, setF] = useState<CustomerInput>({ fullName: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerInput, string>>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof CustomerInput) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const phone = normalizePhoneTR(f.phone);
  const existing = phone ? biz.customers.find((c) => c.phone === phone) : undefined;

  const save = async () => {
    const e = validateCustomer(f);
    setErrors(e);
    if (Object.keys(e).length || !biz.business) return;
    setBusy(true);
    setErr(null);
    try {
      const c = await biz.run((r) => r.addCustomer({ businessId: biz.business!.id, fullName: f.fullName.trim(), phone: phone!, email: normalizeEmail(f.email) }));
      router.replace(`/servis/musteri/${c.id}`);
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Müşteri eklenemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Müşteri ekle" back footer={<Button title="Müşteriyi kaydet" variant="primary" onPress={save} loading={busy} disabled={!!existing} />}>
      <Stack gap={space.md}>
        <Field label="Adı soyadı" value={f.fullName} onChangeText={set('fullName')} error={errors.fullName} autoCapitalize="words" />
        <Field label="Telefon" value={f.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" placeholder="0532 123 45 67" />
        {existing && (
          <Card highlight onPress={() => router.replace(`/servis/musteri/${existing.id}`)} style={{ gap: 4 }}>
            <Text v="bodyStrong">Bu telefonla kayıtlı müşteri var</Text>
            <Muted small>{`${existing.fullName} · ${formatPhoneTR(existing.phone)} — açmak için dokun`}</Muted>
          </Card>
        )}
        <Field label="E-posta (isteğe bağlı)" value={f.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
        <CustomerEmailHint />
        <ErrorText>{err}</ErrorText>
      </Stack>
    </Screen>
  );
}
