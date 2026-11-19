/**
 * Bildirimler: servis kayıtları, teklifler, topluluk ve hatırlatmalar. Açılınca hepsi okundu sayılır;
 * bu açılışta okunmamış olanlar vurgulu kalır. Telefona gönderim tercihleri Ayarlar'da.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { Button, Card, Empty, ErrorText, Muted, Row, Screen, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { RepoError, type AppNotification } from '@/data/repo';
import { repo } from '@/data/store';
import { isOpenableLink, openAppLink } from '@/lib/open-link';

function iconFor(kind: string): IconName {
  if (kind === 'maintenance_due') return 'wrench';
  if (kind === 'fine_discount') return 'alert';
  if (kind.startsWith('service_') || kind === 'review_new') return 'doc';
  if (kind.startsWith('quote_')) return 'store';
  if (kind === 'social_follow') return 'user';
  if (kind === 'forum_comment') return 'forum';
  return 'heart';
}

function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

export default function Notifications() {
  const biz = useBusiness();
  const [list, setList] = useState<AppNotification[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const l = await repo.listNotifications();
      setList(l);
      setMore(l.length >= 30);
      if (l.some((n) => !n.read)) await repo.markNotificationsRead();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Bildirimler yüklenemedi.');
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const loadMore = async () => {
    if (!list?.length) return;
    setLoadingMore(true);
    try {
      const l = await repo.listNotifications({ before: list[list.length - 1]!.createdAt });
      setList([...list, ...l]);
      setMore(l.length >= 30);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Yüklenemedi.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Screen title="Bildirimler" back right={
      <Pressable onPress={() => router.push('/ayarlar')} accessibilityRole="button" accessibilityLabel="Bildirim ayarları" hitSlop={8}>
        <Icon name="gear" size={20} color={colors.text} />
      </Pressable>
    }>
      <ErrorText>{err}</ErrorText>
      {err && !list ? <Button title="Tekrar dene" onPress={load} /> : null}
      {list == null ? (
        err ? null : <Muted>Yükleniyor…</Muted>
      ) : list.length === 0 ? (
        <Empty title="Bildirim yok" body="Servis kaydı, teklif, yorum ve bakım hatırlatmaları burada görünür." />
      ) : (
        <Stack gap={space.sm}>
          {list.map((n) => {
            const openable = isOpenableLink(n.url);
            return (
              <Card key={n.id} highlight={!n.read} accessibilityLabel={`${n.title}. ${n.body ?? ''}`}
                onPress={openable ? () => openAppLink(n.url, biz.setMode) : undefined}>
                <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={iconFor(n.kind)} size={18} color={colors.text} />
                  </View>
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Text v="bodyStrong">{n.title}</Text>
                    {n.body ? <Text v="small" color={colors.textMuted}>{n.body}</Text> : null}
                    <Muted small>{timeAgo(n.createdAt)}{n.read ? '' : ' · yeni'}</Muted>
                  </Stack>
                  {openable && <Icon name="chev" size={16} color={colors.iconMuted} />}
                </Row>
              </Card>
            );
          })}
          {more && <Button title="Daha eski bildirimler" variant="ghost" onPress={loadMore} loading={loadingMore} />}
        </Stack>
      )}
    </Screen>
  );
}
