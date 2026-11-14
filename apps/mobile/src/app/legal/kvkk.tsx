import { Muted, Screen, Stack, Text } from '@/components/ui';
import { space } from '@/constants/theme';
import { env } from '@/lib/env';

/**
 * TASLAK aydınlatma metni. Yayından önce hukuk danışmanı tarafından tamamlanmalı:
 * veri sorumlusu unvanı, adres, VERBİS kaydı, yurt dışı aktarım dayanağı ve başvuru kanalları.
 */
const SECTIONS: [string, string][] = [
  ['Veri sorumlusu', '[Şirket unvanı, adresi ve iletişim bilgileri yayından önce eklenecek.]'],
  ['Hangi verileri işliyoruz', 'Hesap bilgileri (e-posta), araç bilgileri (marka, model, yıl, kilometre, isteğe bağlı plaka ve şasi numarası), bakım, yakıt ve masraf kayıtları, yüklediğin belgeler ve bildirim tercihlerin.'],
  ['Neden işliyoruz', 'Garajını ve hatırlatmalarını sunmak, masraf hesaplarını yapmak ve sana bildirim göndermek için. Şasi numarası yalnızca parça uyumluluğunu doğrulamak için kullanılır ve şifreli saklanır.'],
  ['Hukuki sebep', 'Sözleşmenin kurulması ve ifası (KVKK md. 5/2-c). Pazarlama iletileri yalnızca açık rızanla gönderilir.'],
  ['Aktarım', 'Veriler, barındırma ve hata takibi hizmet sağlayıcılarımızın sunucularında saklanır. Yurt dışına aktarım KVKK md. 9 kapsamındaki güvencelerle yapılır. [Sağlayıcılar ve dayanak yayından önce eklenecek.]'],
  ['Saklama süresi', 'Hesabını silene kadar. Hesap silindiğinde araç, bakım, yakıt ve masraf kayıtların kalıcı olarak silinir.'],
  ['Hakların', 'KVKK md. 11 kapsamında verilerine erişme, düzeltme, silme ve itiraz haklarına sahipsin. Profil > Hesabımı sil ile verilerini kendin silebilirsin. [Başvuru adresi yayından önce eklenecek.]'],
];

export default function Kvkk() {
  return (
    <Screen title="Aydınlatma metni" back>
      <Stack gap={space.lg}>
        <Muted small>Sürüm {env.kvkkTextVersion} · Taslak</Muted>
        {SECTIONS.map(([h, b]) => (
          <Stack key={h} gap={space.xs}>
            <Text v="bodyStrong" accessibilityRole="header">{h}</Text>
            <Muted>{b}</Muted>
          </Stack>
        ))}
      </Stack>
    </Screen>
  );
}
