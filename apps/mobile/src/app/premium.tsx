import { Card, Muted, Pill, Row, Screen, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';

/**
 * Plan karşılaştırması. Satın alma Aşama 2'de App Store / Google Play (RevenueCat) ile eklenecek;
 * bu ekranda ödeme düğmesi bilerek yok. Fiyatlar briften gelen test fiyatlarıdır.
 */
const PLANS = [
  { name: 'Ücretsiz', price: '0 ₺', per: '', features: ['2 araç', 'Sınırsız bakım geçmişi', 'Km ve tarih hatırlatmaları', 'Yakıt ve masraf takibi'] },
  { name: 'Plus aylık', price: '149,99 ₺', per: '/ay', features: ['Sınırsız araç', 'Araç Pasaportu (paylaşılabilir)', 'Gelişmiş raporlar ve dışa aktarma', 'Aile ve şoför paylaşımı', 'Reklamsız'] },
  { name: 'Plus yıllık', price: '1.199,99 ₺', per: '/yıl', features: ['Plus aylığın her şeyi', 'Aylık ödemeye göre %33 tasarruf'] },
];

export default function Premium() {
  return (
    <Screen title="PISTON Plus" back>
      <Stack>
        <Pill tone="info">Aşama 2’de açılıyor</Pill>
        {PLANS.map((p, i) => (
          <Card key={p.name} highlight={i === 2} style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text v="bodyStrong">{p.name}</Text>
              {i === 2 && <Pill tone="ok">En avantajlı</Pill>}
            </Row>
            <Text v="number">{p.price}<Text v="small" color={colors.textMuted}>{p.per}</Text></Text>
            {p.features.map((f) => <Muted key={f} small>✓ {f}</Muted>)}
          </Card>
        ))}
        <Muted small>Fiyatlar lansman öncesi test edilecek. Satın alma App Store veya Google Play hesabın üzerinden yapılacak.</Muted>
      </Stack>
    </Screen>
  );
}
