/**
 * Profildeki "Telefon numaram": servislerin girdiği müşteri telefonu + garajdaki aracın plakası tutarsa
 * servis kayıtları bu hesaba kendiliğinden düşer. Yalnızca plaka yetmez (plaka herkesin görebildiği bilgidir).
 */
import { formatPhoneTR, normalizePhoneTR } from '@piston/core';
import { useState } from 'react';

import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { useApp } from '@/data/store';
import { Button, Card, ErrorText, Field, Muted, Row, Text } from './ui';

export function MyPhoneCard() {
  const { account, run } = useApp();
  const biz = useBusiness();
  const saved = account?.phone ?? null;
  const [editing, setEditing] = useState(!saved);
  const [value, setValue] = useState(saved ? formatPhoneTR(saved) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async (remove = false) => {
    const phone = remove ? null : normalizePhoneTR(value);
    if (!remove && !phone) return setErr('Numarayı 05XX XXX XX XX biçiminde yaz.');
    setBusy(true);
    setErr(null);
    try {
      await run((r) => r.updateMyPhone(phone));
      await biz.refresh(); // eşleşen servis kayıtları hemen gelsin
      setEditing(remove);
      if (remove) setValue('');
      setDone(!remove);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Telefon kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Text v="bodyStrong">Telefon numaram</Text>
      <Muted small>
        Servis, kaydı açarken bu numarayı ve aracının plakasını girerse kayıt “Servis kayıtlarım”a kendiliğinden gelir.
        Aracın plakası Garajım’da kayıtlı olmalı.
      </Muted>
      {editing ? (
        <>
          <Field label="Telefon" value={value} onChangeText={setValue} keyboardType="phone-pad" placeholder="0532 123 45 67"
            autoComplete="tel" textContentType="telephoneNumber" />
          <ErrorText>{err}</ErrorText>
          <Row gap={space.sm}>
            {saved && <Button title="Vazgeç" small style={{ flex: 1 }} onPress={() => { setEditing(false); setValue(formatPhoneTR(saved)); setErr(null); }} />}
            <Button title="Kaydet" small variant="primary" style={{ flex: 1 }} onPress={() => save()} loading={busy} />
          </Row>
        </>
      ) : (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="section">{saved ? formatPhoneTR(saved) : '—'}</Text>
            <Text v="smallStrong" color={colors.brandDark} onPress={() => setEditing(true)} accessibilityRole="button">Değiştir</Text>
          </Row>
          {done && <Text v="small" color="#1E7D53">Kaydedildi. Eşleşen servis kayıtları “Servis kayıtlarım”da.</Text>}
          <ErrorText>{err}</ErrorText>
          <Text v="small" color={colors.textMuted} onPress={() => save(true)} accessibilityRole="button">Numarayı kaldır</Text>
        </>
      )}
    </Card>
  );
}
