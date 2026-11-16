# PISTON SERVİS: analiz ve Aşama 1 planı

Durum: **Aşama 1 kodlandı ve demo modunda test edildi; gerçek Supabase'de denenmedi** · Dal: `ozellik/piston-servis` · Tarih: 2026-11-16

Aşama 1 raporu belgenin sonunda (8. bölüm).

Bu belge, isterlerin 16. bölümündeki ilk dört adımı karşılar: mevcut mimari raporu, ekran listesi, veritabanı planı ve yetkilendirme tasarımı. Aşama 1'in kodlanmasına bu plan onaylandıktan sonra başlanacak.

---

## 1. Mevcut mimari (analiz)

| Katman | Nerede | Nasıl çalışıyor |
| --- | --- | --- |
| Uygulama | `apps/mobile` | Expo SDK 58, React Native 0.88, expo-router. Her dosya bir ekran (`src/app`). Alt sekmeler `(tabs)`: Ana Sayfa, Parça Pazarı, Forum, Servisler, Profil. |
| Tasarım sistemi | `src/components/ui.tsx`, `src/constants/theme.ts` | `Screen`, `Card`, `Button`, `Field`, `Pill`, `Segmented`, `ListItem`, `Empty`, `Stat` vb. Koyu tema, vurgu rengi neon yeşil `#B6F000`. |
| Veri katmanı | `src/data/repo.ts` | Ekranlar yalnızca `GarageRepo` sözleşmesini kullanır. İki uygulaması var: `DemoRepo` (veriler cihazda, AsyncStorage) ve `SupabaseRepo`. |
| Durum | `src/data/store.tsx` | `AppProvider` / `useApp()`: oturum, araçlar, seçili araç. `run()` her işlemden sonra veriyi yeniler. |
| İş kuralları | `packages/core` | Saf TypeScript (bakım, yakıt, gider, ceza, doğrulama). Vitest ile 53 test. |
| Sunucu | `supabase/` | PostgreSQL migration'ları, her tabloda RLS, `private` şemada `security definer` yardımcılar, sütun bazlı yetkiler, Edge Functions (hesap silme, hatırlatma, ışık tanıma). |
| Kimlik | Supabase Auth | E-posta + 6 haneli kod (OTP). Apple/Google girişi yok. |
| Testler | `npm test`, `npm run db:test` | `db:test` migration'ları geçici bir PostgreSQL'e kurup RLS testlerini (`rls.test.sql`) çalıştırır. |

**Önemli tespitler**

1. **Gerçek sunucu bağlı değil.** `.env` yok; uygulama (TestFlight sürümü dahil) yalnızca DEMO modunda çalışıyor. Bu yüzden PISTON SERVİS de önce DEMO'da çalışacak ve ekranda açıkça "DEMO" yazacak. Supabase tarafı (migration + RLS + `SupabaseRepo`) aynı anda yazılacak ve testlerle doğrulanacak, ama gerçek bir projeye bağlanana kadar "çalışıyor" denmeyecek.
2. **Bu bilgisayarda PostgreSQL yok.** `db:test` Linux yolu bekliyor. Öneri: `@electric-sql/pglite` (Node içinde çalışan PostgreSQL) ile Windows'ta da çalışan bir test koşucusu eklemek. Böylece işletme veri izolasyonu testleri burada gerçekten çalıştırılabilir.
3. **Mevcut `vehicles` tablosu bireysel sahiplik için tasarlanmış** (`owner_id`, ücretsiz planda 2 araç sınırı). İşletmenin müşteri araçları bu tabloya yazılmayacak; ayrı `business_vehicles` tablosu olacak. Böylece bireysel kurallar bozulmaz.
4. **Servisler sekmesi** şu an "yakında" ekranı. Bireysel modda kalacak; PISTON SERVİS bu sekmeye eklenmeyecek, kendi navigasyonuyla ayrı bir alan olacak.
5. **Push bildirimleri** Expo Go'da çalışmıyor ve sunucu gerektiriyor. Aşama 1'de "müşteriye bildirim" demo modunda uygulama içi kutu olarak gösterilecek; gerçek push Aşama 2'de, Supabase bağlanınca.

---

## 2. Ekranlar

### Yeni: PISTON SERVİS alanı (`src/app/servis/`)

Kendi alt sekmeleri olan ayrı bir bölüm. Bireysel ekranların üzerine eklenmiş bir sekme değil.

| Ekran | Dosya | Aşama |
| --- | --- | --- |
| İşletme kaydı (adım adım) | `servis/kayit.tsx` | 1 |
| Panel (ana ekran) | `servis/(sekmeler)/index.tsx` | 1 |
| Servis kayıtları listesi | `servis/(sekmeler)/kayitlar.tsx` | 1 |
| Müşteriler | `servis/(sekmeler)/musteriler.tsx` | 1 |
| Araçlar (plaka ile bul) | `servis/(sekmeler)/araclar.tsx` | 1 |
| Menü: işletme profili, basit/gelişmiş mod, bireysel moda dön | `servis/(sekmeler)/menu.tsx` | 1 |
| Yeni servis kaydı sihirbazı (6 adım) | `servis/yeni-kayit.tsx` | 1 |
| Servis kaydı detayı (işletme görünümü, itiraz ve geçmiş) | `servis/kayit/[id].tsx` | 1 |
| Müşteri detayı / müşteri ekle | `servis/musteri/[id].tsx`, `servis/musteri-ekle.tsx` | 1 |
| Araç detayı | `servis/arac/[id].tsx` | 1 |
| İşletme profili düzenle | `servis/profil.tsx` | 1 |
| Gelişmiş mod ekranları (iş emirleri, personel, stok, raporlar, randevular) | `servis/...` | 3–4; Aşama 1'de menüde "sonraki aşama" diye görünür, sahte veri gösterilmez |

Panel düzeni: üstte büyük **+ YENİ SERVİS KAYDI**, altında **+ MÜŞTERİ EKLE**. Sonra sayaç kartları (bugünkü servisler, onay bekleyen, itiraz edilen, bugünkü müşteri) ve son kayıtlar listesi. Grafik yok.

### Yeni: bireysel tarafta müşteri ekranları

| Ekran | Dosya | Aşama |
| --- | --- | --- |
| Servis kayıtlarım (onay bekleyenler üstte) | `servis-kayitlarim.tsx` | 1 |
| Servis kaydı: görüntüle, **ONAYLA / İTİRAZ ET** | `servis-kaydi/[id].tsx` | 1 |

### Değişecek mevcut dosyalar (küçük, ekleme şeklinde)

| Dosya | Değişiklik |
| --- | --- |
| `src/app/_layout.tsx` | Yeni ekranları korumalı (giriş gerekli) yığına eklemek |
| `src/app/(tabs)/profile.tsx` | "PISTON SERVİS" bölümü: "İşletme hesabı aç" ya da "İşletme moduna geç"; "Servis kayıtlarım" satırı |
| `src/app/(tabs)/index.tsx` | Onay bekleyen servis kaydı varsa tek bir uyarı kartı |
| `src/constants/theme.ts` | İşletme modu renkleri (yeni anahtarlar; mevcutlar değişmez) |

Bireysel ekranlarda başka değişiklik yok.

---

## 3. Veri katmanı (uygulama)

- `packages/core/src/service.ts`: saf iş kuralları ve testleri:
  - Tutar hesabı: kuruş cinsinden tam sayı; parça ve işçilik ayrı; ara toplam, indirim, KDV oranı ve tutarı, genel toplam.
  - Plaka ve Türkiye telefon numarası normalleştirme.
  - Kayıt durum makinesi: hangi durumdan hangisine geçilebilir.
  - Form doğrulama.
- `src/data/service-repo.ts`: `ServiceRepo` sözleşmesi. `GarageRepo`'ya eklenmiyor; mevcut sözleşme şişmesin ve bireysel tarafa dokunulmasın diye ayrı tutuluyor.
- `src/data/service-demo-repo.ts`: veriler cihazda, mevcut DEMO kuralıyla. Örnek kayıtlar "örnek" etiketli.
- `src/data/service-supabase-repo.ts`: sunucu uygulaması.
- `src/data/business-store.tsx`: `BusinessProvider` / `useBusiness()`. Aktif mod (bireysel/işletme) ve basit/gelişmiş tercihi cihazda saklanır.

---

## 4. Veritabanı planı (migration `20261116000001_piston_servis.sql`)

| Tablo | Amaç | Not |
| --- | --- | --- |
| `businesses` | İşletme profili | Ad, yetkili, telefon, e-posta, il, ilçe, adres, kategori, vergi dairesi/no (isteğe bağlı), logo yolu, durum. Durumlar: `incomplete`, `pending_verification`, `active`, `suspended`. |
| `business_members` | Kullanıcı ↔ işletme, rol | Roller: `owner`, `manager`, `technician`, `front_desk`. İşletmeyi açan otomatik `owner` olur. Çalışan ekleme ekranı Aşama 3'te, tablo ve yetki fonksiyonu şimdiden hazır. |
| `business_customers` | İşletmenin kendi müşteri kaydı | `business_id` + telefon tekil (tekrar kaydı önler). İsteğe bağlı e-posta. |
| `business_vehicles` | İşletmenin kendi araç kaydı | `business_id` + plaka tekil. Müşteriye bağlı. Kilometre geçmişi servis kayıtlarından çıkar. |
| `service_records` | Servis kaydı | Kabul tarihi, km, şikâyet, ilk gözlem, yakıt seviyesi, mevcut hasarlar, durum, `approval_version`, tutar alanları (sunucuda hesaplanır), oluşturan/güncelleyen ve zamanları, onay zamanı, `client_request_id` (tekil: internet kesilip tekrar gönderilince çift kayıt oluşmaz). |
| `service_record_items` | Yapılan işlemler | İşlem adı, açıklama, parça adı, adet, parça birim fiyatı, işçilik, indirim (kuruş). |
| `service_files` | Fotoğraf ve belgeler | Türleri: `intake`, `replaced_part`, `work`, `document`. Mime, boyut, depolama yolu. İsterlerdeki `service_photos` ve `service_documents` tek tabloda `kind` ile ayrılıyor; davranışları aynı. |
| `service_approvals` | Müşteri yanıtları | Onay ya da itiraz, itiraz sebebi, hangi sürüme verildiği, kim, nereden (uygulama / bağlantı), zaman. Hiçbir zaman silinmez. İsterlerdeki `service_objections` burada `action = 'objected'` satırı. |
| `service_status_history` | Durum geçmişi | Her durum değişikliği; zaman ve kişiyle. |
| `audit_logs` | Denetim | Servis kaydı ve kalemlerindeki her değişikliğin eski ve yeni değeri (tetikleyici ile; istemci yazamaz). |

Kayıt durumları: `awaiting_approval` (Müşteri onayı bekliyor), `approved`, `objected`, `revised` (İşletme düzeltme gönderdi, yeniden onay bekliyor), `completed`. `service_status` alanı iş emri durumlarından (Aşama 3) ayrı tutulur.

**Sunucu kuralları (tetikleyici / fonksiyon)**

- Tutarlar istemciden gelen değerle değil, kalemlerden sunucuda hesaplanır.
- Onaylanmış ya da itiraz edilmiş kayıtta kalem veya tutar değişirse: kayıt `revised` olur, `approval_version` artar, değişiklik `audit_logs`'a yazılır. Müşteriden yeniden onay istenir.
- Servis kaydı ve onay satırları silinemez; yalnızca `completed` / iptal gibi durumlar alır.
- `suspended` işletme yeni kayıt açamaz.
- Basit hız sınırı: işletme başına günlük kayıt üst sınırı (ör. 300).
- Storage: özel `service-files` kovası, yol `<business_id>/<record_id>/...`, en fazla 10 MB, yalnızca jpeg/png/heic/webp/pdf.

---

## 5. Yetkilendirme ve veri izolasyonu

- Her ticari tabloda `business_id` var. RLS kuralı: `private.has_business_perm(business_id, '<izin>')`. Bu fonksiyon, `business_members` tablosuna ve rol → izin tablosuna bakar.
- İzinler: `record.create`, `record.edit`, `record.view`, `customer.manage`, `business.manage`, `member.manage`. Aşama 1'de yalnızca `owner` rolü kullanılacak. Diğer roller tanımlı olacak ama Aşama 3'e kadar atanamayacak.
- **Müşteri erişimi (Aşama 1):** Müşteri, işletmenin `business_customers` kaydına yazdığı e-posta adresi ile kendi PISTON hesabının e-postası eşleşirse kaydı görür. Giriş zaten e-posta koduyla yapıldığı için e-postanın sahibi doğrulanmış olur.
  - Müşteri tablolara doğrudan yazamaz. Onay ve itiraz yalnızca `respond_to_service_record(record_id, version, action, reason)` fonksiyonuyla verilir. Fonksiyon, sürüm eşleşmesini ve kaydın durumunu kontrol eder.
  - Müşteri başka müşterilerin kayıtlarını ve işletmenin iç notlarını göremez. Telefonla eşleştirme SMS doğrulaması gerektirdiği için Aşama 2'de.
- Bir işletme başka işletmenin hiçbir satırını okuyamaz ve değiştiremez. Bu kural RLS testleriyle kanıtlanacak.
- Plakadan araç sahibi sorgusu **yapılmayacak.** Plaka araması yalnızca işletmenin kendi kayıtlarında çalışır.

---

## 6. Aşama 1 kapsamı ve kabul testleri

**Yapılacak:**
- İşletme kaydı ve profili
- Panel ve basit/gelişmiş ayrımı
- Müşteri ve araç ekleme, plaka ile bulma
- 6 adımlı yeni servis kaydı: fotoğraf ekleme dahil; fotoğraflar demo modunda cihazda, Supabase'de kovada tutulur
- Parça/işçilik ayrımı ve KDV gösterimi
- "Müşteri onayı bekliyor" durumu
- Müşteri onay ve itiraz ekranı
- İtiraz sonrası işletmenin düzeltme göndermesi
- Denetim geçmişi

**Aşama 1'de yapılmayacaklar (sonraki aşamalara):**
- WhatsApp bağlantısı
- Gerçek push bildirimi
- Telefonla müşteri eşleştirme
- Çalışan ekleme ekranı
- İş emirleri, randevu, PISTON CHECK, stok, rapor ve diğer modüller

**Test planı:**

| # | Kabul kriteri | Nasıl test edilecek |
| --- | --- | --- |
| 1 | İşletme hesabı açılır | Demo akışı + SQL testi |
| 4 | Plaka ile kayıtlı araç bulunur | core birim testi (normalleştirme) + demo akışı |
| 5 | Araç ve müşteri eklenir; aynı telefon/plaka tekrar eklenmez | SQL (tekil kısıt) + demo |
| 6–7 | Servis kaydı oluşur; parça ve işçilik ayrı hesaplanır | core birim testleri (kuruş, KDV, indirim) + SQL tetikleyici testi |
| 9–11 | Müşteri kaydı görür, onaylar, itiraz eder | SQL (RLS + fonksiyon) + demo (aynı cihazda iki rol) |
| 12 | İtiraz edilen kayıt silinmez | SQL: silme reddedilir |
| 14 | Başka işletmenin kayıtlarına erişilemez | SQL: işletme B, A'nın her tablosunda 0 satır görür ve yazamaz |
| 15 | Geçmiş kayıtlar görülür | Demo |
| 16 | Bireysel mod bozulmadı | Mevcut 53 test + typecheck + lint + Expo Go'da bireysel akış |
| 17 | İnternet kesilince çift kayıt olmaz | SQL: aynı `client_request_id` ikinci kez reddedilir; sihirbaz taslağı cihazda saklanır |
| 18 | Hatalı veri sunucuda reddedilir | SQL: check kısıtları (negatif tutar, geçersiz plaka/telefon, uzun metin) |

Kriter 2, 3, 8 ve 13 (çalışanlar, push, WhatsApp) kendi aşamalarında test edilecek.

---

## 7. Onay bekleyen kararlar (varsayılanlarım)

1. **Renk:** İsterlerde vurgu rengi kırmızı yazıyor; mevcut marka rengi neon yeşil. Varsayılanım: bireysel mod yeşil kalsın, **PISTON SERVİS kırmızı vurgu** kullansın. Böylece kullanıcı hangi modda olduğunu renkten anlar ve bireysel taraf değişmez.
2. **Doğrulama bekleyen işletme:** Aşama 1'de işletme açılır açılmaz `pending_verification` olur ve kayıt açabilir. Müşteri ekranında "İşletme henüz doğrulanmadı" etiketi görünür. Doğrulama süreci (belge / vergi no kontrolü) yönetici paneli gerektirdiği için ayrı bir iş.
3. **Windows'ta veritabanı testi:** `@electric-sql/pglite`, kök `devDependencies`'e eklenecek. Bu paket uygulamaya girmez; yalnızca test aracıdır.
4. **KDV:** Varsayılan oran %20, kayıt başına değiştirilebilir ya da "KDV yok" seçilebilir. Ekranda "Bu belge fatura yerine geçmez." notu yer alır.
5. **KVKK:** Müşteri adı, telefon ve plaka işletmenin kendi müşteri verisidir; veri sorumlusu işletmedir. Aydınlatma metni taslağı eklenecek ama hukuki inceleme gerektiği belirtilecek.

---

## 8. Aşama 1 raporu (2026-11-16)

### Yapılanlar

- **İşletme hesabı:** Profil → "İşletme hesabı aç". Kayıt formu sunucuda da doğrulanıyor. Açan kişi sahip (owner) oluyor, durum "Doğrulama bekliyor". Bir hesap en fazla 3 işletme açabiliyor.
- **Ayrı işletme alanı:** Kırmızı vurgu rengi ve kendi alt sekmeleri var: Panel, Kayıtlar, Müşteriler, Araçlar, Menü. Menü'den bireysel moda dönülüyor. Uygulama en son işletme modunda kapatıldıysa o modda açılıyor.
- **Panel:** "+ YENİ SERVİS KAYDI" ve "+ MÜŞTERİ EKLE" düğmeleri en üstte. Altında bugünkü servis, bugünkü müşteri, onay bekleyen ve itiraz edilen sayıları, hızlı erişim ve son kayıtlar var. Grafik yok.
- **Basit / gelişmiş mod:** Menü'deki düğmeyle seçiliyor. Gelişmiş bölümler "Aşama 3 / 4" etiketiyle görünüyor; içlerinde sahte veri yok.
- **Müşteri ve araç:**
  - Ekleme, listeleme, arama ve detay sayfaları.
  - Aynı telefon ya da plaka ikinci kez eklenemiyor; numara farklı yazılmış olsa da (+90 / 0 / boşluklu) yakalanıyor.
  - Plaka araması yalnızca işletmenin kendi kayıtlarında yapılıyor.
- **6 adımlı servis kaydı:**
  - Adımlar: araç → müşteri → kabul → işlemler → fotoğraflar → özet.
  - Kayıtlı plaka bulunursa araç ve müşteri bilgisi otomatik geliyor.
  - Parça ile işçilik ayrı gösteriliyor; indirim ve KDV seçilebiliyor (%20 / %10 / %1 / yok).
  - Taslak cihaza kaydediliyor; uygulama kapanınca "kaldığın yerden devam et" sunuluyor.
  - Tekrar gönderimde ikinci kayıt açılmıyor.
- **Müşteri onayı:**
  - Bireysel tarafta yeni "Servis kayıtlarım" ekranı var; ana sayfada "onayını bekleyen kayıt" kartı çıkıyor.
  - Müşteri ONAYLA ya da İTİRAZ ET diyebiliyor; itirazda sebep zorunlu.
  - İşletme itirazı görüyor ve düzeltme gönderiyor. Bu durumda sürüm artıyor ve yeniden onay isteniyor.
  - Onaylanan kayıt tamamlanabiliyor; tamamlanan kayıt kilitleniyor.
  - İtiraz, onay ve durum geçmişi silinmiyor.
- **Sunucu (Supabase migration):**
  - Tablolar, RLS, rol ve izin tablosu.
  - Tutarlar sunucuda hesaplanıyor.
  - Denetim kaydı tutuluyor: eski ve yeni değerler.
  - Silme yasağı, günlük kayıt üst sınırı ve askıya alınan işletme kontrolü var.
  - Fotoğraflar için storage kuralları var.
- **Windows'ta veritabanı testi:** `npm run db:test:local` (PGlite).

### Değiştirilen ve eklenen dosyalar

| Tür | Dosyalar |
| --- | --- |
| İş kuralları | `packages/core/src/service.ts` (yeni), `packages/core/src/index.ts`, `packages/core/test/service.test.ts` (yeni) |
| Veritabanı | `supabase/migrations/20261116000001_piston_servis.sql` (yeni), `supabase/tests/servis.test.sql` (yeni), `supabase/tests/run-pglite.mjs` (yeni), `supabase/tests/run.sh` (tüm `*.test.sql` dosyalarını çalıştırır) |
| Veri katmanı | `src/data/service-repo.ts`, `service-demo-repo.ts`, `service-supabase-repo.ts`, `service-errors.ts`, `business-store.tsx` (hepsi yeni) |
| Ekranlar (yeni) | `src/app/servis/**` (12 ekran), `src/app/servis-kayitlarim.tsx`, `src/app/servis-kaydi/[id].tsx` |
| Bileşenler | `src/components/servis.tsx`, `business-form.tsx` (yeni); `ui.tsx` (vurgu rengi bağlamı, varsayılan yeşil); `icons.tsx` (6 yeni simge) |
| Mevcut ekranlara ekleme | `src/app/_layout.tsx`, `(tabs)/profile.tsx`, `(tabs)/index.tsx`, `src/constants/theme.ts`, `src/lib/photo.ts` |
| Diğer | Kök `package.json` (`@electric-sql/pglite` geliştirme bağımlılığı, `db:test:local`), `.claude/launch.json` |

### Test sonuçları

- **Birim testleri:** 76 testin hepsi geçti. 23'ü yeni: tutar hesabı, telefon, durum geçişleri, doğrulama, rol izinlerinin sunucuyla aynı olması.
- **Veritabanı testleri (PGlite):**
  - Mevcut 17 RLS testi ve yeni 19 PISTON SERVİS testi geçti.
  - Testlerin hatayı gerçekten yakaladığı, bir beklenti kasıtlı bozularak doğrulandı.
- **Tür kontrolü ve lint:** temiz.
- **Tarayıcıda demo akışı** (expo web, 390 px genişlik):
  - İşletme açma (boş formda doğrulama dahil)
  - Hatalı plakanın reddi
  - Yeni müşteri ve aracın oluşturulması
  - İki işlem ekleme ve tutar kontrolü: 3.050,50 + 1.350 − 100 + %20 KDV = 5.160,60 ₺
  - Sayfa yenilenince taslağın geri gelmesi
  - Kaydetme
  - Aynı plakayla yeni kayıtta aracın bulunması
  - Müşteri olarak sebepsiz itirazın reddi ve sebepli itiraz
  - İşletmenin düzeltmesi: sürüm 2, toplam 2.880 ₺
  - Müşteri onayı
  - Tamamlama ve kilit
  - Aynı telefonun farklı yazımla tekrar eklenememesi
  - Bireysel moda dönüş

**Kabul kriterleri:**

| # | Durum |
| --- | --- |
| 1, 4, 5, 6, 7, 9, 10, 11, 12, 15, 16, 18 | Geçti (demo + SQL testleri) |
| 14 | Geçti (SQL testleri; demo tek cihazda olduğu için anlamlı değil) |
| 17 | Kısmen: tekrar gönderimde çift kayıt yok (SQL + demo) ve taslak saklanıyor. Gerçek ağ kesintisi Supabase bağlanınca denenecek. |
| 2, 3 (çalışanlar), 8 (bildirim), 13 (WhatsApp) | Planlandığı gibi sonraki aşamalarda |

### Tamamlanmayanlar

- Gerçek Supabase projesinde deneme: `service-supabase-repo.ts` yazıldı, ama uçtan uca hiç çalıştırılmadı. Migration yalnızca PGlite'ta test edildi.
- Logo/fotoğraf yükleme (işletme profili).
- PDF belge ekleme. `expo-document-picker` gerekiyor; şimdilik belgenin fotoğrafı çekiliyor.
- Kabul tarihi için tarih seçici yok; tarih "16.11.2026 10:30" biçiminde yazılıyor.
- Push bildirim ve WhatsApp bağlantısı (Aşama 2).
- Çalışan ekleme ekranı (Aşama 3). Tablolar ve izinler hazır.
- KVKK aydınlatma metni: yalnızca kısa not var, hukuki inceleme gerekli.

### Bilinen sorunlar ve riskler

1. **E-postayla eşleşme riski:** Müşteri, işletmenin yazdığı e-postayla eşleşiyor. İşletme yanlış e-posta yazarsa kayıt (ad, plaka, tutar) başka bir kişinin "Servis kayıtlarım" ekranında görünür. Aşama 2'de müşterinin eşleşmeyi onaylaması (ya da telefon doğrulaması) eklenmeli.
2. **Sahibin hesabını silmesi:** İşletme sahibi bireysel hesabını silerse sunucuda işletme sahipsiz kalır; servis kayıtları korunur. Bu durumda ne olacağına (devir, kapatma, saklama süresi) karar verilmeli. Demo modunda hesap silinince işletme verisi de silinir.
3. **Demo fotoğrafları (web):** Web demosunda fotoğraflar sayfa yenilenince kaybolabilir. Telefonda (Expo Go) sorun yok.
4. **Renklerin görsel kontrolü:** Bu bilgisayarda Windows kontrast teması açık olduğu için tarayıcıda renkler görsel olarak doğrulanamadı. Kırmızı vurgunun telefonda bir kez kontrol edilmesi gerekiyor.
5. **Önceden var olan uyarı:** Bireysel ana sayfada web'de "iç içe düğme" uyarısı var. PISTON SERVİS ile ilgisi yok.
