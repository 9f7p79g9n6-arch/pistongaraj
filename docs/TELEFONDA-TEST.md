# iPhone'da test (Windows bilgisayar ile)

İki yol var. **A** bugün 10 dakikada denemek içindir. **B**, uygulamayı TestFlight üzerinden gerçek bir uygulama gibi kurar.

Her iki yolda da uygulama **demo modunda** açılır: veriler yalnızca telefonda tutulur, gösterge ışığı fotoğrafı analiz edilmez (örnek sonuç döner). Gerçek sunucu bağlanınca bu kalkar.

---

## Hazırlık (bir kez)

1. **Node.js** kur: https://nodejs.org adresinden **LTS** sürümünü indirip kur.
2. **Git** kur: https://git-scm.com/download/win (tüm seçenekleri varsayılan bırak).
3. **PowerShell**'i aç (Başlat menüsünde "PowerShell" yaz) ve sırayla çalıştır:

```powershell
git clone https://github.com/9f7p79g9n6-arch/pistongaraj.git
```

GitHub girişi tarayıcıda açılırsa giriş yap.

```powershell
cd pistongaraj
```

```powershell
git checkout ozellik/turkiye-araclari
```

```powershell
npm install
```

---

## A) Expo Go ile hızlı deneme

1. iPhone'a App Store'dan **Expo Go** uygulamasını kur.
2. Bilgisayar ve telefon **aynı Wi-Fi**'da olsun.
3. PowerShell'de, `pistongaraj` klasöründeyken:

```powershell
npm run mobile
```

4. Ekranda çıkan QR kodu iPhone'un **Kamera** uygulamasıyla okut; Expo Go'da açılır.

QR kod açılmazsa (şirket ya da okul Wi-Fi'si engelliyor olabilir) durdurup (Ctrl+C) şunu dene:

```powershell
cd apps\mobile; npx expo start --tunnel
```

Expo Go'da bildirimler çalışmaz; diğer her şey denenebilir.

---

## B) TestFlight ile gerçek kurulum

Gerekenler: Apple Developer hesabı, ücretsiz bir **Expo hesabı** (https://expo.dev/signup).

PowerShell'de, `pistongaraj` klasöründeyken:

```powershell
cd apps\mobile
```

```powershell
npx eas-cli@latest login
```

Expo kullanıcı adı ve şifren.

```powershell
npx eas-cli@latest init
```

"Create a project?" sorusuna **Yes**. Bu komut `app.json` dosyasına proje kimliğini yazar.

```powershell
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

Sorulacaklar ve verilecek yanıtlar:

| Soru | Yanıt |
|---|---|
| Do you want to log in to your Apple account? | **Yes**, Apple ID ve iki adımlı doğrulama kodu |
| Select a Team | Apple Developer takımın |
| Generate a new Apple Distribution Certificate? | **Yes** |
| Generate a new Apple Provisioning Profile? | **Yes** |
| Set up Push Notifications? | **Yes** |
| App Store Connect'te uygulama adı | `PISTON GARAGE` alınmışsa `Piston Garage Araç` gibi bir ad dene |

Derleme Expo'nun bulut sunucularında yapılır (Mac gerekmez), yaklaşık **15–30 dakika** sürer. `--auto-submit` bitince derlemeyi App Store Connect'e kendisi yükler.

Sonra:

1. https://appstoreconnect.apple.com → **Apps** → uygulaman → **TestFlight**.
2. Derlemenin işlenmesini bekle (10–30 dakika; e-posta gelir).
3. **Internal Testing** altında bir grup oluştur ve kendini ekle.
4. iPhone'a App Store'dan **TestFlight** uygulamasını kur; davet e-postasındaki bağlantıyla uygulamayı kur.

Sonraki sürümler için yalnızca son `build` komutunu tekrar çalıştırman yeter; sürüm numarası kendiliğinden artar.

`init` komutunun `app.json`'a yazdığı proje kimliğini depoya kaydetmek için:

```powershell
git add app.json
```

```powershell
git commit -m "EAS proje kimliği"
```

```powershell
git push
```

---

## Sık karşılaşılan hatalar

- **"Bundle identifier is not available"**: `com.pistongarage.app` başka biri tarafından alınmış. `apps/mobile/app.json` içinde `ios.bundleIdentifier` değerini değiştir (ör. `com.<adin>.pistongarage`) ve build komutunu tekrar çalıştır.
- **`npx` bulunamadı**: Node.js kurulduktan sonra PowerShell'i kapatıp yeniden aç.
- **Expo Go "incompatible SDK" diyor**: Expo Go uygulamasını App Store'dan güncelle.
