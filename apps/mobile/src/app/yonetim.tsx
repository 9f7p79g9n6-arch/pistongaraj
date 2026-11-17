/**
 * Yönetici paneli (yalnızca user_roles.role = 'admin'): işletme doğrulama / askıya alma ve forum şikâyetleri.
 * Doğrulanan işletme araç sahiplerinin rehberinde görünür ve teklif talebi alır.
 */
import { BUSINESS_STATUS_LABEL, formatPhoneTR, timeAgoTR, type BusinessStatus } from '@piston/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { categoryLabel } from '@/components/market';
import { Button, Card, Chip, Empty, ErrorText, Muted, Pill, Row, Screen, Segmented, Stack, Text, type Tone } from '@/components/ui';
import { space } from '@/constants/theme';
import { marketRepo, type AdminBusiness, type AdminReport } from '@/data/market';
import { RepoError } from '@/data/repo';
import { useApp } from '@/data/store';
import { confirm } from '@/lib/confirm';

const STATUS_TONE: Record<BusinessStatus, Tone> = { active: 'ok', pending_verification: 'warn', suspended: 'bad', incomplete: 'neutral' };

export default function Admin() {
  const { account } = useApp();
  const [tab, setTab] = useState<'isletmeler' | 'sikayetler'>('isletmeler');
  const [status, setStatus] = useState<BusinessStatus | null>('pending_verification');
  const [businesses, setBusinesses] = useState<AdminBusiness[] | null>(null);
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([marketRepo.adminBusinesses(status), marketRepo.adminReports()]);
      setBusinesses(b);
      setReports(r);
      setErr(null);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Yüklenemedi.');
    }
  }, [status]);
  useFocusEffect(useCallback(() => { if (account?.isAdmin) void load(); }, [load, account?.isAdmin]));

  if (!account?.isAdmin) return <Screen title="Yönetim" back><Empty title="Yetkin yok" body="Bu bölüm yalnızca yöneticiler içindir." /></Screen>;

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

  const openReports = (reports ?? []).filter((r) => !r.deleted);

  return (
    <Screen title="Yönetim" back>
      <Segmented options={[{ value: 'isletmeler', label: 'İşletmeler' }, { value: 'sikayetler', label: `Şikâyetler${openReports.length ? ` (${openReports.length})` : ''}` }]}
        value={tab} onChange={setTab} />
      <ErrorText>{err}</ErrorText>

      {tab === 'isletmeler' ? (
        <>
          <Row gap={space.sm} style={{ flexWrap: 'wrap', marginTop: space.md }}>
            <Chip label="Doğrulama bekleyen" selected={status === 'pending_verification'} onPress={() => setStatus('pending_verification')} />
            <Chip label="Doğrulanmış" selected={status === 'active'} onPress={() => setStatus('active')} />
            <Chip label="Askıda" selected={status === 'suspended'} onPress={() => setStatus('suspended')} />
            <Chip label="Tümü" selected={status === null} onPress={() => setStatus(null)} />
          </Row>
          <Muted small style={{ marginTop: space.sm }}>
            Doğrulamadan önce işletmeyi arayıp adresini ve vergi bilgisini kontrol et. Doğrulanan işletme rehberde görünür ve teklif talebi alır.
          </Muted>
          <Stack gap={space.sm} style={{ marginTop: space.md }}>
            {businesses === null ? <Muted>Yükleniyor…</Muted> : businesses.length === 0 ? <Empty title="İşletme yok" body="Bu durumda işletme yok." /> : businesses.map((b) => (
              <Card key={b.id} style={{ gap: 6 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text v="bodyStrong">{b.name}</Text>
                    <Muted small>{`${categoryLabel(b.category)} · ${b.district} / ${b.city} · ${timeAgoTR(b.createdAt)}`}</Muted>
                  </View>
                  <Pill tone={STATUS_TONE[b.status]}>{BUSINESS_STATUS_LABEL[b.status]}</Pill>
                </Row>
                <Muted small>{`${b.contactName} · ${formatPhoneTR(b.phone)}${b.email ? ` · ${b.email}` : ''}`}</Muted>
                <Muted small>{b.address}</Muted>
                <Muted small>{`Vergi: ${b.taxOffice ?? '—'} / ${b.taxNumber ?? '—'} · ${b.recordCount} servis kaydı`}</Muted>
                <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                  {b.status !== 'active' && (
                    <Button title="Doğrula" icon="check" small variant="primary" loading={busy === `a-${b.id}`}
                      onPress={() => act(`a-${b.id}`, () => marketRepo.adminSetStatus(b.id, 'active'))} />
                  )}
                  {b.status !== 'suspended' && (
                    <Button title="Askıya al" small variant="outline" loading={busy === `s-${b.id}`}
                      onPress={async () => {
                        if (!(await confirm('Askıya al', `${b.name} rehberden çıkar, yeni kayıt açamaz ve forumda yazamaz.`, 'Askıya al', true))) return;
                        void act(`s-${b.id}`, () => marketRepo.adminSetStatus(b.id, 'suspended'));
                      }} />
                  )}
                  {b.status !== 'pending_verification' && (
                    <Button title="Beklemeye al" small loading={busy === `p-${b.id}`}
                      onPress={() => act(`p-${b.id}`, () => marketRepo.adminSetStatus(b.id, 'pending_verification'))} />
                  )}
                </Row>
              </Card>
            ))}
          </Stack>
        </>
      ) : (
        <Stack gap={space.sm} style={{ marginTop: space.md }}>
          <Muted small>3 farklı işletmeden şikâyet alan içerik zaten otomatik gizlenir. Burada inceleyip kalıcı olarak kaldırabilirsin.</Muted>
          {reports === null ? <Muted>Yükleniyor…</Muted> : reports.length === 0 ? <Empty title="Şikâyet yok" body="Forumda şikâyet edilen içerik yok." /> : reports.map((r) => (
            <Card key={`${r.postId ?? ''}${r.commentId ?? ''}`} style={{ gap: 6, opacity: r.deleted ? 0.55 : 1 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Pill tone={r.reportCount >= 3 ? 'bad' : 'warn'}>{`${r.reportCount} şikâyet`}</Pill>
                <Muted small>{`${r.postId ? 'Konu' : 'Yanıt'} · ${r.businessName}`}</Muted>
              </Row>
              <Text v="small">{r.text}</Text>
              {r.reasons.length > 0 && <Muted small>{`Sebepler: ${r.reasons.join(' · ')}`}</Muted>}
              {r.deleted ? <Pill tone="neutral">Kaldırıldı</Pill> : (
                <Button title="İçeriği kaldır" icon="trash" small variant="danger" loading={busy === `r-${r.postId ?? r.commentId}`}
                  onPress={async () => {
                    if (!(await confirm('İçeriği kaldır', 'İçerik forumdan kalıcı olarak kaldırılır.', 'Kaldır', true))) return;
                    void act(`r-${r.postId ?? r.commentId}`, () => marketRepo.adminRemove(r.postId, r.commentId));
                  }} />
              )}
            </Card>
          ))}
        </Stack>
      )}
    </Screen>
  );
}
