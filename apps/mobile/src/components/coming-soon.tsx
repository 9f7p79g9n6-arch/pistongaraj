import { Card, Muted, Pill, Screen, Stack, Text } from './ui';
import { space } from '@/constants/theme';

/** Sonraki aşamalarda açılacak sekmeler için bilgilendirme ekranı. Sahte ürün, servis ya da gönderi göstermez. */
export function ComingSoon({ title, stage, lead, items }: { title: string; stage: string; lead: string; items: [string, string][] }) {
  return (
    <Screen title={title}>
      <Stack gap={space.md}>
        <Pill tone="info">{stage}</Pill>
        <Muted>{lead}</Muted>
        {items.map(([h, b]) => (
          <Card key={h} style={{ gap: space.xs }}>
            <Text v="bodyStrong">{h}</Text>
            <Muted small>{b}</Muted>
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}
