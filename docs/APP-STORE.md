# OTOM — App Store gönderim bilgileri (sürüm 1.0)

Bu belge App Store Connect'te doldurulacak alanların hazır metnidir. Karakter sınırları
`node scripts/check-store-text.mjs` ile kontrol edilir.

> Uygulama içi satın alma YOK (ilk sürüm). Ücretli plan, sepet, uygulama içi ödeme bulunmuyor.

## 1. Uygulama bilgileri

| Alan | Değer |
|---|---|
| Ad (en çok 30) | OTOM: Araç Bakım ve Servis |
| Alt başlık (en çok 30) | Bakım, masraf ve servis kaydı |
| Birincil kategori | Araçlar (Utilities) |
| İkincil kategori | Yaşam Tarzı (Lifestyle) |
| Paket kimliği | com.pistongarage.app |
| Birincil dil | Türkçe |
| Telif | © 2026 [AD SOYAD] (bireysel geliştirici hesabı) |
| Gizlilik politikası adresi | `docs/site/gizlilik.html` yayınlandığı adres (bkz. BILGISAYAR-TALIMATI.md, adım 6) |
| Destek adresi | `docs/site/destek.html` yayınlandığı adres |
| Pazarlama adresi (isteğe bağlı) | `docs/site/index.html` yayınlandığı adres |

> "OTOM" adı App Store'da başka bir uygulamada kullanılıyorsa Apple adı kabul etmez. Ad alınamazsa
> öneri: "OTOM Garaj: Bakım ve Servis".

### Tanıtım metni (en çok 170, sürüm göndermeden değiştirilebilir)

Aracının bakımını, masraflarını ve servis geçmişini tek yerde tut. Bakım zamanı gelince haber al, servisinden kaydını uygulamada onayla, teklifleri karşılaştır.

### Anahtar kelimeler (en çok 100, virgülle, boşluksuz)

bakım,servis,oto,sanayi,usta,yakıt,masraf,muayene,sigorta,ceza,parça,garaj,tamir,kasko,lastik

### Açıklama (en çok 4000)

OTOM, aracının bütün hayatını tek yerde tutar: bakım, yakıt, masraf, ceza ve servis kayıtları.

ARAÇ SAHİPLERİ İÇİN
• Bakım hatırlatmaları: Motor yağı, filtreler, triger, fren ve daha fazlası kilometreye ve tarihe göre hesaplanır. Zamanı yaklaşınca bildirim alırsın.
• Muayene, sigorta ve kasko tarihleri: Son günü kaçırma.
• Yakıt ve masraf takibi: 100 km'de ortalama tüketim, aylık gider grafiği ve masraf listesi.
• Trafik cezaları: İndirimli ödeme süresini takip et, son günlerde hatırlatma al.
• Muayene hazırlığı: Muayeneden kaldıran kalemleri önceden kontrol et.
• Kaza asistanı: Kaza anında adım adım ne yapacağını gösterir.
• Servis kayıtları: Servisin açtığı kaydı uygulamada gör; yapılan işlemleri ve ücreti onayla ya da itiraz et. Kayıtlar servisin verdiği kayıt koduyla hesabına bağlanır.
• Teklif al: Aracınla ilgili işi ya da aradığın parçayı yaz; şehrindeki doğrulanmış servisler ve parçacılar fiyat versin.
• Topluluk: Aracının fotoğrafını paylaş, marka gruplarına katıl, sorular sor.

SERVİSLER VE USTALAR İÇİN (OTOM SERVİS)
• Plakayla hızlı servis kaydı: işlemler, parçalar, işçilik ve KDV.
• Müşteriye WhatsApp ya da PDF ile servis dökümü gönder; müşteri uygulamada onaylasın.
• Tahsilat ve veresiye takibi, günlük ve aylık ciro.
• Müşteri ve araç geçmişi.
• Teklif isteklerine yanıt ver, yeni müşteri kazan.
• Esnaf forumu.

GÜVENLİK VE GİZLİLİK
• Her kullanıcı yalnızca kendi verisini görür; kurallar veritabanı düzeyinde uygulanır.
• Reklam ya da takip yok.
• Uygunsuz içerik şikâyet edilebilir, kişiler engellenebilir; şikâyetler 24 saat içinde incelenir.
• Hesabını ve verilerini uygulama içinden kalıcı olarak silebilirsin.

OTOM ücretsizdir. Uygulama içinden ödeme alınmaz; servis ve parça ücretleri doğrudan işletmeyle konuşulur.

### Bu sürümdeki yenilikler

OTOM'un ilk sürümü.

## 2. Yaş derecelendirmesi (anket cevapları)

- Şiddet, cinsellik, küfür, kumar, uyuşturucu, korku temaları: **Yok**
- Tıbbi bilgi: **Yok**
- Kullanıcı tarafından oluşturulan içerik / kullanıcılar arası iletişim: **Evet** (paylaşım, yorum, forum).
  Moderasyon: kullanım koşullarında sıfır tolerans, şikâyet et, engelle, 24 saatte inceleme, yönetici paneli.
- Sınırsız web erişimi: **Hayır**
- Reklam: **Hayır**
- Yarışmalar/çekilişler: **Hayır**

## 3. Uygulama gizliliği (App Privacy) cevapları

**Takip (tracking): Hayır.** Reklam ya da veri aracısı yok; analiz/çökme SDK'sı yok.

Toplanan veriler — hepsi **kullanıcıya bağlı**, **takip için kullanılmıyor**, amaç: **Uygulama işlevselliği**:

| Apple kategorisi | Veri | Neden |
|---|---|---|
| İletişim bilgileri → E-posta adresi | Giriş e-postası | Hesap ve giriş |
| İletişim bilgileri → Ad | Paylaşımlarda görünen ad, işletme yetkili adı | Topluluk, işletme profili |
| İletişim bilgileri → Telefon numarası | İsteğe bağlı telefon; işletme telefonu | Kabul edilen teklifte işletmenin araması |
| Kullanıcı içeriği → Fotoğraflar veya videolar | Araç fotoğrafı, paylaşımlar, servis fotoğrafları | Garaj, topluluk, servis kaydı |
| Kullanıcı içeriği → Diğer kullanıcı içeriği | Yorumlar, forum, servis notları, değerlendirmeler | Topluluk, servis |
| Tanımlayıcılar → Kullanıcı kimliği | Hesap kimliği | Hesap |
| Tanımlayıcılar → Cihaz kimliği | Bildirim anahtarı (push token) | Bildirim gönderme |
| Diğer veriler | Araç, bakım, yakıt, masraf, ceza kayıtları, şehir | Uygulamanın asıl işlevi |
| Konum → Kesin konum | Yalnızca işletme sahibi "konumu kaydet"e basarsa dükkânın konumu (bir kez) | Araç sahiplerine yol tarifi |

Araç sahiplerinin konumu toplanmaz; yol tarifi telefonun kendi harita uygulamasında açılır.

Toplanmayan: kişiler, sağlık, finans/ödeme bilgisi, tarama/arama geçmişi, kullanım verisi, tanılama.

> Gösterge ışığı fotoğrafı yalnızca analiz için gönderilir ve saklanmaz (açık rıza ile). Yine de
> "Fotoğraflar veya videolar" satırı bunu kapsar.

## 4. İnceleme bilgileri (App Review)

**Giriş bilgileri** (App Store Connect → Uygulama İncelemesi → "Oturum açma gerekli"):
- Kullanıcı adı: `pistondestek+appreview@gmail.com`
- Şifre: Supabase'de inceleme hesabını oluştururken belirlenen şifre. **Bu depoya ya da sohbete yazılmaz;**
  yalnızca App Store Connect'teki şifre alanına girilir.

**İnceleme notu (kopyala-yapıştır):**

```
Sign-in: OTOM normally signs users in with a 6-digit code sent by e-mail. For review, enter the
demo e-mail above on the sign-in screen and tap "Giriş kodu gönder"; a password field appears
instead of a code. Use the password provided in the Sign-In Information fields.

The app is in Turkish. Main areas:
- Garajım (My Garage): vehicles, maintenance reminders, fuel/expenses, traffic fines, inspection checklist.
- Ana Sayfa (Home): community feed. Every post and comment has "Şikâyet et" (Report); users can be
  blocked ("Engelle"). Reports are reviewed within 24 hours by our moderators (admin panel). Terms of
  use with zero tolerance for objectionable content must be accepted before using the app.
- OTOM SERVİS (business mode): Profil > "İşletme hesabı aç" lets repair shops create service records.
- Account deletion: Profil (menu icon top-left) > Ayarlar > "Hesabımı sil".

No in-app purchases. No payments are made in the app; prices are agreed directly with businesses.
Push notifications are optional and requested only when the user taps "Telefona bildirimleri aç".
Location (when in use only) is requested only in business mode, when the shop owner taps
"Şu an dükkândayım, konumu kaydet" (Menü > İşletme bilgileri) to save the shop's location once, so that
car owners can get driving directions to the shop. Car owners' location is never collected.
```

İnceleme hesabında önceden şunlar hazır olsun (incelemeci boş ekran görmesin):
1. 1 araç (bakım kuralları otomatik gelir), birkaç yakıt ve masraf kaydı.
2. 1 işletme (Profil → İşletme hesabı aç) ve o işletmeden bu hesaba açılmış 1 servis kaydı (kayıt kodu ile bağlanmış).
3. Ana Sayfa'da 1 paylaşım.

## 5. Ekran görüntüleri

- Gerekli boyut: 6,9" iPhone **1320 × 2868** (ya da 6,5" 1284 × 2778). En az 3, en çok 10.
- En doğrusu: TestFlight sürümünde inceleme hesabıyla gerçek iPhone'dan ekran görüntüsü almak.
- Taslak: `npm run screenshots -w mobile` web demosundan 1320 × 2868 görüntü üretir (`docs/app-store/`).
  Bunlarda "DEMO" etiketi ve "(örnek)" verileri görünür; gönderimde gerçek cihaz görüntüleri tercih edilmeli.
- Önerilen sıra: Garajım → Bakım listesi → Servis kaydı onayı → Teklif al → OTOM SERVİS paneli → Ana Sayfa.

## 6. Diğer

- Şifreleme beyanı: `ITSAppUsesNonExemptEncryption = false` (app.json'da) — yalnızca standart HTTPS.
- Gizlilik bildirimi (PrivacyInfo.xcprivacy): app.json → `ios.privacyManifests` (derlemede üretilir).
- Sürüm: app.json `version` 1.0.0; derleme numarasını EAS otomatik artırır (`appVersionSource: remote`).
- Yayın şahıs (bireysel) hesapla yapılır. Hukuk metinlerindeki `[AD SOYAD]` ve `[ADRES]` yerleri **göndermeden önce**
  doldurulmalı; metinlerin bir avukata kontrol ettirilmesi önerilir. Taslak uyarısı kalkınca `packages/core/src/legal-texts.json`
  içindeki `status` alanı boşaltılır ve `npm run site` ile sayfalar yeniden üretilir.
