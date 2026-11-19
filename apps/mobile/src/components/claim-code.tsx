/**
 * Müşteri: servisin WhatsApp mesajıyla ya da PDF'le verdiği kayıt kodunu girer; kayıt hesabına bağlanır.
 */
import { CLAIM_RESULT_MESSAGE, isValidClaimCode } from '@piston/core';
import { useState } from 'react';

import { space } from '@/constants/theme';
import { serviceRepo } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { Button, Card, ErrorText, Field, Muted, Row, Text } from './ui';

export function ClaimCodeCard({ onClaimed }: { onClaimed: (recordId: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!isValidClaimCode(code)) return setErr('Kod 8 karakter olmalı, örneğin K7MP-3XQA.');
    setBusy(true);
    try {
      const res = await serviceRepo.claimRecord(code);
      if (res.status === 'claimed' || res.status === 'already_mine') {
        setCode('');
        setOpen(false);
        onClaimed(res.recordId);
      } else {
        setErr(CLAIM_RESULT_MESSAGE[res.status]);
      }
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Kod gönderilemedi. İnternet bağlantını kontrol et.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <Button title="Kayıt kodu gir" icon="plus" variant="primary" onPress={() => setOpen(true)} style={{ marginBottom: space.md }} />;
  }
  return (
    <Card style={{ gap: space.sm, marginBottom: space.md }}>
      <Text v="bodyStrong">Kayıt kodu</Text>
      <Muted small>Servisin WhatsApp’tan ya da PDF’le gönderdiği 8 karakterlik kodu yaz.</Muted>
      <Field label="Kod" value={code} onChangeText={setCode} placeholder="K7MP-3XQA" autoCapitalize="characters" autoCorrect={false} maxLength={12} />
      <ErrorText>{err}</ErrorText>
      <Row gap={space.sm}>
        <Button title="Vazgeç" small style={{ flex: 1 }} onPress={() => { setOpen(false); setErr(null); }} />
        <Button title="Ekle" small variant="primary" style={{ flex: 1 }} onPress={submit} loading={busy} />
      </Row>
    </Card>
  );
}
