/** Hukuk metinleri: /legal/kosullar, /legal/gizlilik, /legal/kvkk. Metin @piston/core legal-texts.json'dan gelir. */
import { LEGAL_STATUS, LEGAL_UPDATED, LEGAL_VERSION, legalDoc, type LegalDocKey } from '@piston/core';
import { useLocalSearchParams } from 'expo-router';

import { Empty, Muted, Screen, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';

const KEYS: LegalDocKey[] = ['kosullar', 'gizlilik', 'kvkk'];

export default function LegalDocument() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  if (!KEYS.includes(doc as LegalDocKey)) {
    return <Screen title="Belge" back><Empty title="Belge bulunamadı" body="Bu bağlantı geçersiz." /></Screen>;
  }
  const d = legalDoc(doc as LegalDocKey);
  return (
    <Screen title={d.title} back>
      <Stack gap={space.lg}>
        <Muted small>Sürüm {LEGAL_VERSION} · {LEGAL_UPDATED}</Muted>
        {LEGAL_STATUS ? <Muted small>{LEGAL_STATUS}</Muted> : null}
        <Text>{d.intro}</Text>
        {d.sections.map((s) => (
          <Stack key={s.heading} gap={space.xs}>
            <Text v="bodyStrong" accessibilityRole="header">{s.heading}</Text>
            <Muted>{s.body}</Muted>
          </Stack>
        ))}
      </Stack>
    </Screen>
  );
}
