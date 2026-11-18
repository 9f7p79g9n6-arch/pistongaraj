/** Araç sahibinin talebi: gelen teklifler (en uygun önce), kabul etme, kabul edilen işletmeyle iletişim, talebi kapatma. */
import { QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL, sortOffers, timeAgoTR, type QuoteRequest } from '@piston/core';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';

import { OfferCard, QUOTE_STATUS_TONE } from '@/components/market';
import { Button, Card, Empty, ErrorText, Muted, Pill, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';
import { confirm } from '@/lib/confirm';
import { openWhatsApp } from '@/lib/share-record';

export default function QuoteRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [r, setR] = useState<QuoteRequest | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setR((await marketRepo.myRequests()).find((x) => x.id === id) ?? null);
      setErr(null);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Talep yüklenemedi.');
    }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (r === undefined) return <Screen title="Talep" back><Muted>Yükleniyor…</Muted><ErrorText>{err}</ErrorText></Screen>;
  if (r === null) return <Screen title="Talep" back><Empty title="Talep bulunamadı" body="Silinmiş olabilir." /></Screen>;

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'İşlem yapılamadı.');
    } finally {
      setBusy(null);
    }
  };

  const offers = sortOffers(r.offers);
  const accepted = offers.find((o) => o.id === r.acceptedOfferId) ?? null;

  return (
    <Screen title="Talebim" back>
      <Card style={{ gap: space.sm }}>
        <Row gap={6}>
          <Pill tone="neutral">{QUOTE_KIND_LABEL[r.kind]}</Pill>
          <Pill tone={QUOTE_STATUS_TONE[r.status]}>{QUOTE_STATUS_LABEL[r.status]}</Pill>
        </Row>
        <Text v="section">{r.title}</Text>
        {r.description ? <Text v="small">{r.description}</Text> : null}
        <Muted small>{`${r.vehicleLabel} · ${r.city} · ${timeAgoTR(r.createdAt)}`}</Muted>
        <Muted small>{`${r.targetCount} işletmeye gönderildi`}</Muted>
      </Card>

      {accepted && (
        <Card highlight style={{ gap: space.sm, marginTop: space.md }}>
          <Text v="bodyStrong">{`${accepted.businessName} ile anlaştın`}</Text>
          <Muted small>İşletmeyi arayıp randevu ya da teslim için görüş. Ödeme işletmeyle aranızda yapılır.</Muted>
          <Row gap={space.sm}>
            <Button title="Ara" icon="user" variant="primary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${accepted.businessPhone}`)} />
            <Button title="WhatsApp" icon="forum" style={{ flex: 1 }}
              onPress={() => openWhatsApp(accepted.businessPhone, `Merhaba, OTOM'daki "${r.title}" talebim için teklifinizi kabul ettim.`)} />
          </Row>
        </Card>
      )}

      <Section title={offers.length ? `Teklifler (${offers.length})` : 'Teklifler'}>
        {offers.length === 0 ? (
          <Muted small>Henüz teklif gelmedi. İşletmeler talebini gördükçe teklifler burada görünür; en uygun teklif en üstte olur.</Muted>
        ) : (
          <Stack gap={space.sm}>
            {offers.map((o) => (
              <OfferCard key={o.id} o={o} kind={r.kind} accepted={o.id === r.acceptedOfferId} showPhone={o.id === r.acceptedOfferId}
                action={r.status === 'open' ? (
                  <Button title="Bu teklifi kabul et" variant="outline" small loading={busy === o.id}
                    onPress={async () => {
                      if (!(await confirm('Teklifi kabul et', `${o.businessName} teklifini kabul ediyorsun. Diğer teklifler kapanır; telefonun bu işletmeye görünür.`, 'Kabul et'))) return;
                      void act(o.id, () => marketRepo.acceptOffer(o.id));
                    }} />
                ) : undefined} />
            ))}
          </Stack>
        )}
      </Section>

      <ErrorText>{err}</ErrorText>
      {r.status === 'open' && (
        <Button title="Talebi kapat" variant="ghost" style={{ marginTop: space.xl }} loading={busy === 'close'}
          onPress={async () => {
            if (!(await confirm('Talebi kapat', 'Talep kapanır; işletmeler artık teklif veremez.', 'Kapat'))) return;
            void act('close', () => marketRepo.closeRequest(r.id));
          }} />
      )}
      <Button title={r.kind === 'part' ? 'Parçalar’a dön' : 'Servisler’e dön'} variant="ghost" style={{ marginTop: space.sm }}
        onPress={() => router.replace(r.kind === 'part' ? '/market' : '/services')} />
    </Screen>
  );
}
