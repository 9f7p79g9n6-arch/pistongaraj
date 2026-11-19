# Bilgisayardaki oturum için talimat — sürüm 1.0'ı App Store'a gönderme

Bu talimat Windows bilgisayardaki Claude Code oturumu içindir. **Kod değiştirme yok**: kodu bulut oturumu yazıyor.
Bu oturum yalnızca sunucuya yükleme, derleme ve Apple adımlarını yapar. Bir adım hata verirse durup hatayı kullanıcıya göster.

Kurallar:
- Gizli anahtar, şifre ya da token'ı sohbete, koda ya da depoya **yazma**. Supabase secret'ları ve App Store Connect alanları dışında hiçbir yerde tutulmaz.
- Aynı Supabase organizasyonundaki **elite** projesi başka bir uygulamaya ait: ona dokunma. Bu uygulamanın projesi `uoelkgdzxbohlxokhsqy`.
- `main` dalına doğrudan gönderme yapma.

## 1. Kodu güncelle

```powershell
cd pistongaraj
```

```powershell
git fetch origin
```

```powershell
git checkout surum/1.0
```

```powershell
git pull
```

```powershell
npm install
```

Kontrol (hepsi geçmeli; Windows'ta veritabanı testi `db:test:local` ile):

```powershell
npm run typecheck; npm run lint; npm test -w @piston/core; npm run db:test:local
```

## 2. Veritabanı değişikliklerini yükle

Yeni dosyalar: `20261127000001_kayit_kodu`, `…02_kosullar_onayi`, `…03_bildirimler`, `…04_toplu_kayit`, `…05_arac_siniri`.

```powershell
npx.cmd --yes supabase@latest db push --remote --yes
```

## 3. Fonksiyonları yayına al

```powershell
npx.cmd --yes supabase@latest functions deploy push-dispatch --use-api --yes
```

```powershell
npx.cmd --yes supabase@latest functions deploy send-reminders --use-api --yes
```

```powershell
npx.cmd --yes supabase@latest functions deploy delete-account --use-api --yes
```

```powershell
npx.cmd --yes supabase@latest functions deploy identify-warning-light --use-api --yes
```

## 4. Zamanlayıcı anahtarı (CRON_SECRET)

Rastgele bir değer üret ve **ekrana yazdırmadan** doğrudan secret olarak kaydet:

```powershell
$s = -join ((48..57) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ }); npx.cmd --yes supabase@latest secrets set "CRON_SECRET=$s"; Set-Clipboard $s
```

Değer panoya kopyalandı; 5. adımdaki SQL'e yapıştırılacak, sonra panoyu temizle (`Set-Clipboard " "`).

## 5. Zamanlamalar (Supabase panelinde)

Supabase paneli → proje → **Database → Extensions**: `pg_cron` ve `pg_net` açık olsun.
Sonra **SQL Editor**'de (`<CRON_SECRET>` yerine panodaki değer):

```sql
select cron.schedule('bakim-hatirlatma', '0 6 * * *',
  $$select net.http_post(
      url := 'https://uoelkgdzxbohlxokhsqy.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
      body := '{}'::jsonb)$$);
select cron.schedule('bildirim-gonder', '* * * * *',
  $$select net.http_post(
      url := 'https://uoelkgdzxbohlxokhsqy.supabase.co/functions/v1/push-dispatch',
      headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
      body := '{}'::jsonb)$$);
```

Daha önce `bakim-hatirlatma` kurulduysa önce `select cron.unschedule('bakim-hatirlatma');` çalıştır.
Kontrol: birkaç dakika sonra `select status, return_message from cron.job_run_details order by start_time desc limit 5;` → `succeeded`.

## 6. Gizlilik ve destek sayfalarını yayınla

Apple, gizlilik politikası ve destek için herkese açık bir adres ister. Sayfalar hazır: `docs/site/`.

1. Hukuk metnindeki şirket bilgileri doldurulduysa sayfaları yeniden üret: `npm run site`.
2. https://app.netlify.com/drop adresini aç, `docs/site` klasörünü sürükleyip bırak (ücretsiz hesapla giriş yap).
3. Çıkan adresi not et (örn. `https://otom-xxxx.netlify.app`). App Store Connect'e:
   - Gizlilik politikası: `<adres>/gizlilik.html`
   - Destek: `<adres>/destek.html`

## 7. App Store inceleme hesabı

Supabase paneli → **Authentication → Users → Add user → Create new user**:
- E-posta: `pistondestek+appreview@gmail.com`
- Şifre: güçlü bir şifre üret, kullanıcının şifre yöneticisine kaydet. **Sohbete yazma.**
- "Auto Confirm User" işaretli.

Ayrıca **Authentication → Providers → Email** içinde e-posta ile şifreli girişin kapalı olmadığından emin ol.

Uygulamada bu e-posta girilince kod yerine şifre sorulur (`EXPO_PUBLIC_REVIEW_EMAIL`, eas.json).

## 8. Derle ve TestFlight'a gönder

```powershell
cd apps/mobile
```

```powershell
npx.cmd --yes eas-cli@latest build --platform ios --profile production
```

```powershell
npx.cmd --yes eas-cli@latest submit --platform ios --profile production --latest
```

TestFlight'ta açılınca inceleme hesabıyla giriş yap ve **docs/APP-STORE.md → 4. bölüm**deki örnek verileri oluştur
(1 araç, yakıt/masraf, 1 işletme + servis kaydı + kayıt kodu ile bağlama, 1 paylaşım).
Ardından şunları dene: bildirimleri aç (Ayarlar) → işletmeden yeni servis kaydı aç → 1–2 dakika içinde telefona bildirim gelmeli.

## 9. App Store Connect

`docs/APP-STORE.md` içindeki metinleri ilgili alanlara gir:
ad, alt başlık, açıklama, anahtar kelimeler, tanıtım metni, kategori, yaş derecelendirmesi, Uygulama Gizliliği cevapları,
inceleme notu ve giriş bilgileri (şifre yalnızca oradaki alana). Ekran görüntülerini TestFlight sürümünden al
(6,9" — 1320 × 2868); taslaklar `docs/app-store/` içinde. Sonra **İncelemeye Gönder**.

## Kullanıcının yapması gerekenler (Claude yapamaz)

- [ ] Hukuk metinlerindeki `[ŞİRKET UNVANI]`, `[ŞİRKET ADRESİ]`, `[MERSİS…]`, `[KEP]` bilgilerini vermek; metinleri avukata kontrol ettirmek.
- [ ] Daha önce sohbete yazılmış 2 Gmail uygulama şifresini Google hesabından iptal edip yenilemek.
- [ ] App Store'da "OTOM" adının kullanılabilir olduğunu kontrol etmek (alınamazsa APP-STORE.md'deki yedek ad).
- [ ] Yayın sonrası trafik artınca Supabase planını (Pro) değerlendirmek.
