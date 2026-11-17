/** Esnaf: araç sahiplerinden gelen teklif talepleri (servis ya da parça). Yeni olanlar üstte işaretli. */
import { type IncomingQuoteRequest } from '@piston/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { RequestCard } from '@/components/market';
import { Chip, Empty, ErrorText, Muted, Row, Screen, Stack } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { marketRepo } from '@/data/market';
import { RepoError } from '@/data/repo';

type Filter = 'acik' | 'teklif' | 'kabul' | 'tumu';

export default function IncomingRequests() {
  const { business } = useBusiness();
  const [list, setList] = useState<IncomingQuoteRequest[] | null>(null);
  const [filter, setFilter] = useState<Filter>('acik');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business) return;
    try {
      setList(await marketRepo.businessRequests(business.id));
      setErr(null);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Talepler yüklenemedi.');
    }
  }, [business]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const shown = (list ?? []).filter((r) =>
    filter === 'tumu' ? true : filter === 'acik' ? r.status === 'open' && !r.myOffer : filter === 'teklif' ? !!r.myOffer && r.status === 'open' : r.acceptedMine);

  return (
    <Screen title="Teklif talepleri" back>
      <Muted small>
        Araç sahipleri sorununu ya da aradığı parçayı yazdı. Parça ve işçiliği ayrı yazarak teklif ver; müşteri teklifini kabul ederse telefonu sana görünür.
      </Muted>
      <Row gap={space.sm} style={{ flexWrap: 'wrap', marginTop: space.md }}>
        <Chip label="Teklif bekleyen" selected={filter === 'acik'} onPress={() => setFilter('acik')} />
        <Chip label="Teklif verdiklerim" selected={filter === 'teklif'} onPress={() => setFilter('teklif')} />
        <Chip label="Kabul edilen" selected={filter === 'kabul'} onPress={() => setFilter('kabul')} />
        <Chip label="Tümü" selected={filter === 'tumu'} onPress={() => setFilter('tumu')} />
      </Row>
      <ErrorText>{err}</ErrorText>
      <Stack gap={space.sm} style={{ marginTop: space.lg }}>
        {list === null ? <Muted>Yükleniyor…</Muted> : shown.length === 0 ? (
          <Empty title="Talep yok" body={business?.status === 'active'
            ? 'Şu an bu bölümde talep yok. Araç sahipleri talep açtıkça burada görünür.'
            : 'Talepler yalnızca doğrulanmış işletmelere gelir. İşletmen doğrulandığında araç sahiplerinin talepleri burada görünecek.'} />
        ) : shown.map((r) => (
          <RequestCard key={r.id} r={r} onPress={() => router.push(`/servis/talep/${r.id}`)}
            badge={!r.seen ? 'Yeni' : r.acceptedMine ? 'Kabul edildi' : r.myOffer ? 'Teklif verdin' : undefined} />
        ))}
      </Stack>
    </Screen>
  );
}
