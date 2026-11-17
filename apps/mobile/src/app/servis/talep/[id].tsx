/**
 * Esnaf: talep ayrıntısı ve teklif verme (parça + işçilik ayrı, parçada orijinal/muadil/çıkma, süre, not).
 * Talep açıkken teklif güncellenebilir. Müşteri kabul ederse telefonu (profilinde varsa) görünür.
 */
import {
  formatKurus,
  formatPhoneTR,
  kurusToInput,
  parseKurus,
  PART_CONDITION_LABEL,
  QUOTE_KIND_LABEL,
  timeAgoTR,
  validateQuoteOffer,
  type IncomingQuoteRequest,
  type PartCondition,
} from '@piston/core';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';

import { Button, Card, Chip, Empty, ErrorText, Field, Muted, Pill, Row, Screen, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';
import { openWhatsApp } from '@/lib/share-record';

export default function IncomingRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business } = useBusiness();
  const [r, setR] = useState<IncomingQuoteRequest | null | undefined>(undefined);
  const [parts, setParts] = useState('');
  const [labor, setLabor] = useState('');
  const [condition, setCondition] = useState<PartCondition | null>(null);
  const [eta, setEta] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!business) return;
    try {
      const found = (await marketRepo.businessRequests(business.id)).find((x) => x.id === id) ?? null;
      setR(found);
      if (found?.myOffer) {
        setParts(found.myOffer.partsKurus ? kurusToInput(found.myOffer.partsKurus) : '');
        setLabor(found.myOffer.laborKurus ? kurusToInput(found.myOffer.laborKurus) : '');
        setCondition(found.myOffer.partCondition);
        setEta(found.myOffer.eta ?? '');
        setNote(found.myOffer.note ?? '');
      }
      if (found && !found.seen) void marketRepo.markSeen(business.id, found.id).catch(() => {});
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Talep yüklenemedi.');
    }
  }, [business, id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (r === undefined) return <Screen title="Talep" back><Muted>Yükleniyor…</Muted><ErrorText>{err}</ErrorText></Screen>;
  if (r === null || !business) return <Screen title="Talep" back><Empty title="Talep bulunamadı" body="Süresi geçmiş ya da sana gönderilmemiş olabilir." /></Screen>;

  const submit = async () => {
    const p = parts.trim() ? parseKurus(parts) : 0;
    const l = labor.trim() ? parseKurus(labor) : 0;
    if (p == null || l == null) return setErr('Tutarları doğru yaz. Örn. 1.250,50');
    const e = validateQuoteOffer({ kind: r.kind, partsKurus: p, laborKurus: l, partCondition: condition, note, eta });
    if (e) return setErr(e);
    setBusy(true);
    setErr(null);
    try {
      await marketRepo.submitOffer({ businessId: business.id, requestId: r.id, partsKurus: p, laborKurus: l, partCondition: r.kind === 'part' ? condition : null, eta, note });
      setSaved(true);
      await load();
    } catch (x) {
      setErr(x instanceof RepoError ? x.message : 'Teklif gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const open = r.status === 'open';
  const total = (parseKurus(parts) ?? 0) + (parseKurus(labor) ?? 0);

  return (
    <Screen title="Teklif talebi" back>
      <Card style={{ gap: space.sm }}>
        <Row gap={6}><Pill tone="neutral">{QUOTE_KIND_LABEL[r.kind]}</Pill>{r.acceptedMine && <Pill tone="ok">Teklifin kabul edildi</Pill>}</Row>
        <Text v="section">{r.title}</Text>
        {r.description ? <Text v="small">{r.description}</Text> : null}
        <Muted small>{`${r.vehicleLabel} · ${r.city} · ${timeAgoTR(r.createdAt)}`}</Muted>
      </Card>

      {r.acceptedMine && (
        <Card highlight style={{ gap: space.sm, marginTop: space.md }}>
          <Text v="bodyStrong">Müşteri teklifini kabul etti</Text>
          {r.customerPhone ? (
            <>
              <Muted small>{`Telefon: ${formatPhoneTR(r.customerPhone)}`}</Muted>
              <Row gap={space.sm}>
                <Button title="Ara" icon="user" variant="primary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${r.customerPhone}`)} />
                <Button title="WhatsApp" icon="forum" style={{ flex: 1 }}
                  onPress={() => openWhatsApp(r.customerPhone!, `Merhaba, PISTON GARAGE'daki "${r.title}" talebiniz için teklifimizi kabul ettiniz. Randevu için yazıyorum.`)} />
              </Row>
            </>
          ) : (
            <Muted small>Müşteri profilinde telefon numarası yok; sizi arayacak. Telefonunuz müşteriye görünüyor.</Muted>
          )}
        </Card>
      )}

      {!open && !r.acceptedMine && (
        <Card style={{ marginTop: space.md }}><Muted small>{r.status === 'accepted' ? 'Müşteri başka bir teklifi kabul etti.' : 'Müşteri talebi kapattı.'}</Muted></Card>
      )}

      {open && (
        <Card style={{ gap: space.md, marginTop: space.md }}>
          <Text v="bodyStrong">{r.myOffer ? 'Teklifini güncelle' : 'Teklif ver'}</Text>
          <Row gap={space.sm}>
            <Field label="Parça (₺)" value={parts} onChangeText={setParts} keyboardType="decimal-pad" placeholder="0" />
            <Field label="İşçilik (₺)" value={labor} onChangeText={setLabor} keyboardType="decimal-pad" placeholder="0" />
          </Row>
          {r.kind === 'part' && (
            <Stack gap={space.sm}>
              <Text v="smallStrong">Parça türü</Text>
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                {(Object.keys(PART_CONDITION_LABEL) as PartCondition[]).map((c) => (
                  <Chip key={c} label={PART_CONDITION_LABEL[c]} selected={condition === c} onPress={() => setCondition(c)} />
                ))}
              </Row>
            </Stack>
          )}
          <Field label={r.kind === 'part' ? 'Teslim süresi' : 'İş süresi'} value={eta} onChangeText={setEta} maxLength={60}
            placeholder={r.kind === 'part' ? 'Örn. Stokta, aynı gün' : 'Örn. Aynı gün teslim'} />
          <Field label="Not (isteğe bağlı)" value={note} onChangeText={setNote} multiline maxLength={500} placeholder="Örn. Fiyata KDV dahil, garanti 1 yıl" />
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>Toplam</Muted>
            <Text v="number" color={colors.text}>{formatKurus(total)}</Text>
          </Row>
          <ErrorText>{err}</ErrorText>
          {saved && <Text v="small" color="#1E7D53">Teklifin gönderildi. Müşteri kabul ederse burada göreceksin.</Text>}
          <Button title={r.myOffer ? 'Teklifi güncelle' : 'Teklifi gönder'} icon="send" variant="primary" onPress={submit} loading={busy} />
        </Card>
      )}
    </Screen>
  );
}
