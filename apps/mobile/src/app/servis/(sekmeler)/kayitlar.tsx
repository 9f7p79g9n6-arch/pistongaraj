import { inPeriod, localDateOf, normalizePlate, periodOf, type ServiceRecord } from '@piston/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { RecordCard } from '@/components/servis';
import { Button, Chip, Empty, Field, Row, Screen, Stack } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';

type Filter = 'tumu' | 'bugun' | 'hafta' | 'ay' | 'acik' | 'tamam' | 'itiraz';
const FILTERS: { value: Filter; label: string; test: (r: ServiceRecord) => boolean }[] = [
  { value: 'tumu', label: 'Tümü', test: () => true },
  { value: 'bugun', label: 'Bugün', test: (r) => inPeriod(localDateOf(r.intakeAt), periodOf('today')) },
  { value: 'hafta', label: 'Bu hafta', test: (r) => inPeriod(localDateOf(r.intakeAt), periodOf('week')) },
  { value: 'ay', label: 'Bu ay', test: (r) => inPeriod(localDateOf(r.intakeAt), periodOf('month')) },
  { value: 'acik', label: 'Açık', test: (r) => r.status !== 'completed' },
  { value: 'tamam', label: 'Tamamlanan', test: (r) => r.status === 'completed' },
  { value: 'itiraz', label: 'İtiraz', test: (r) => r.status === 'objected' },
];

export default function Records() {
  const { records } = useBusiness();
  const params = useLocalSearchParams<{ filtre?: Filter }>();
  const [filter, setFilter] = useState<Filter>(params.filtre && FILTERS.some((f) => f.value === params.filtre) ? params.filtre : 'tumu');
  const [q, setQ] = useState('');
  // Parametre değişince (panelden farklı bir sayaca dokunulunca) filtre güncellenir
  const [lastParam, setLastParam] = useState(params.filtre);
  if (params.filtre !== lastParam) {
    setLastParam(params.filtre);
    if (params.filtre && FILTERS.some((f) => f.value === params.filtre)) setFilter(params.filtre);
  }

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.value === filter)!;
    const needle = q.trim().toLocaleLowerCase('tr');
    const plate = normalizePlate(q).replace(/\s/g, '');
    return records.filter(f.test).filter((r) => !needle
      || r.plate.replace(/\s/g, '').includes(plate)
      || r.customerName.toLocaleLowerCase('tr').includes(needle));
  }, [records, filter, q]);

  return (
    <Screen title="Servis kayıtları" right={<Button title="Yeni" icon="plus" small variant="primary" onPress={() => router.push('/servis/yeni-kayit')} />}>
      <Field label="Plaka veya müşteri ara" value={q} onChangeText={setQ} autoCapitalize="characters" placeholder="34 ABC 123" />
      <Row style={{ flexWrap: 'wrap', marginTop: space.md }} gap={space.sm}>
        {FILTERS.map((f) => <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />)}
      </Row>
      <Stack gap={space.sm} style={{ marginTop: space.lg }}>
        {list.length === 0 ? (
          <Empty title="Kayıt yok" body={records.length === 0 ? 'Henüz servis kaydı açılmadı.' : 'Bu filtreye uyan kayıt yok.'} />
        ) : list.map((r) => <RecordCard key={r.id} r={r} onPress={() => router.push(`/servis/kayit/${r.id}`)} />)}
      </Stack>
    </Screen>
  );
}
