import { router } from 'expo-router';

import { BusinessForm, toBusinessInput } from '@/components/business-form';
import { Card, Muted, Screen, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';

export default function OpenBusiness() {
  const biz = useBusiness();
  const leave = () => {
    if (biz.businesses.length === 0) {
      biz.setMode('personal');
      router.replace('/profil');
    } else router.back();
  };
  return (
    <Screen title="İşletme hesabı aç" back>
      <Card style={{ gap: 4 }}>
        <Text v="bodyStrong">OTOM SERVİS</Text>
        <Muted small>
          Servis kaydı aç, parça ve işçiliği ayrı yaz, müşterinin onayını al. Şimdilik ücretsiz. İşletmen açıldıktan sonra
          doğrulama bekler; bu sürede kullanabilirsin, müşterilerin kayıtta “doğrulanmadı” etiketini görür.
        </Muted>
      </Card>
      <BusinessForm
        initial={toBusinessInput(null)}
        submitLabel="İşletmeyi aç"
        onSubmit={async (b) => {
          const created = await biz.run((r) => r.createBusiness(b));
          biz.selectBusiness(created.id);
          biz.setMode('business');
          router.replace('/servis');
        }}
      />
      <Muted small style={{ marginTop: space.lg, textAlign: 'center' }} >
        Bireysel hesabın aynen kalır. İki mod arasında Menü’den geçebilirsin.
      </Muted>
      <Text v="smallStrong" style={{ textAlign: 'center', marginTop: space.md }} onPress={leave} accessibilityRole="button">Vazgeç</Text>
    </Screen>
  );
}
