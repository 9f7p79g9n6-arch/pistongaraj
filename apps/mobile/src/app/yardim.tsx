/** Yardım: sık sorulan sorular ve destek adresi. */
import { SUPPORT_EMAIL } from '@piston/core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Card, Divider, Muted, Screen, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';

const FAQ: [string, string][] = [
  ['Kayıt kodu nedir, nereye girerim?',
    'Servis aracın için kayıt açtığında sana WhatsApp mesajı ya da PDF ile 8 karakterlik bir kod gönderir. Profil → Servis geçmişim → “Kayıt kodu gir” ile kodu yaz; kayıt hesabına bağlanır. Kod tek kullanımlıktır. Kod sende değilse servisten yenisini iste.'],
  ['Servis kaydını neden onaylıyorum?',
    'Onay, yapılan işlemleri ve ücreti gördüğünü gösterir. Bir yanlışlık varsa “İTİRAZ ET”e dokunup nedenini yaz; servis kaydı düzeltip yeniden onayına gönderir.'],
  ['Bakım hatırlatmaları nasıl hesaplanıyor?',
    'Aracın kilometresi ve son bakım tarihine göre üretici aralıklarından hesaplanır. Kilometreyi güncel tuttukça hatırlatmalar doğru olur. Aralıkları aracın sayfasından değiştirebilirsin.'],
  ['Bildirim gelmiyor.',
    'Ayarlar → “Telefona bildirimleri aç”a dokun ve izin ver. Telefonun ayarlarında OTOM bildirimlerinin açık olduğunu ve Ayarlar’daki konuların kapalı olmadığını kontrol et.'],
  ['Uygunsuz bir paylaşım ya da yorum gördüm.',
    'Paylaşımı aç, “Şikâyet et”e dokun; istersen kişiyi engelle. Şikâyetler 24 saat içinde incelenir; kurallara aykırı içerik kaldırılır ve sahibi uzaklaştırılabilir.'],
  ['İşletmemi nasıl açarım? Neden “doğrulanmadı” yazıyor?',
    'Profil → “İşletme hesabı aç”. İşletmeler ekibimiz tarafından kontrol edilene kadar müşterilerin kayıtlarında “İşletme henüz doğrulanmadı” notu görünür.'],
  ['Verilerim kimlerle paylaşılıyor?',
    'Araç ve masraf bilgilerin yalnızca sende kalır. Servis kayıtlarını kaydı açan işletme ve sen görürsün. Ayrıntılar Gizlilik politikası ve KVKK aydınlatma metninde.'],
  ['Hesabımı nasıl silerim?',
    'Ayarlar → “Hesabımı sil”. Araçların, kayıtların, paylaşımların ve belgelerin kalıcı olarak silinir. İşletmelerin yasal saklama yükümlülüğü olan servis kayıtları, yasal süre boyunca erişime kapalı olarak saklanabilir.'],
];

export default function Help() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Screen title="Yardım" back>
      <Card style={{ paddingVertical: 0 }}>
        {FAQ.map(([q, a], i) => (
          <View key={q}>
            {i > 0 && <Divider />}
            <Pressable onPress={() => setOpen(open === i ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }}
              style={{ paddingVertical: space.md, gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text v="bodyStrong" style={{ flex: 1 }}>{q}</Text>
                <Icon name="chev" size={16} color={colors.iconMuted} />
              </View>
              {open === i && <Text v="small" color={colors.textMuted}>{a}</Text>}
            </Pressable>
          </View>
        ))}
      </Card>
      <Muted small style={{ marginTop: space.lg, textAlign: 'center' }}>{`Sorun devam ederse bize yaz: ${SUPPORT_EMAIL}`}</Muted>
    </Screen>
  );
}
