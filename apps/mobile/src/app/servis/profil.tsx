import { router } from 'expo-router';

import { BusinessForm, toBusinessInput } from '@/components/business-form';
import { Screen } from '@/components/ui';
import { useBusiness } from '@/data/business-store';
import { notify } from '@/lib/confirm';

export default function BusinessProfile() {
  const biz = useBusiness();
  const b = biz.business;
  if (!b) return <Screen title="İşletme bilgileri" back>{null}</Screen>;
  return (
    <Screen title="İşletme bilgileri" back>
      <BusinessForm
        key={b.id}
        initial={toBusinessInput(b)}
        submitLabel="Kaydet"
        onSubmit={async (input) => {
          await biz.run((r) => r.updateBusiness(b.id, input));
          notify('Kaydedildi');
          router.back();
        }}
      />
    </Screen>
  );
}
