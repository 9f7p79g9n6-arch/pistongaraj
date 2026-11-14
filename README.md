# PISTON GARAGE

Türkiye'deki araç sahipleri için otomotiv platformu. Bu depo **Aşama 1**'i içerir: üyelik, garaj, araç ekleme, bakım hatırlatmaları, yakıt ve masraf takibi.

## Depo yapısı

```
apps/mobile/          Expo (SDK 58) + React Native + TypeScript, expo-router
  src/app/            Ekranlar (her dosya bir rota)
  src/components/     Tasarım sistemi bileşenleri (ui.tsx), grafikler, ikonlar
  src/data/           Veri katmanı: repo.ts (sözleşme), supabase-repo.ts, demo-repo.ts, store.tsx
  e2e/demo-flow.cjs   Tarayıcıda uçtan uca akış testi
packages/core/        İş kuralları (saf TS): bakım durumu, depo dolum tüketimi, giderler, doğrulama
supabase/
  migrations/         Şema, RLS politikaları, tetikleyiciler, storage
  functions/          Edge Functions: delete-account, send-reminders
  tests/              Migration + RLS testleri (geçici PostgreSQL üzerinde)
prototip.html         Tıklanabilir tasarım prototipi ve rakip analizi
```

## Hızlı başlangıç (demo modu, sunucu gerekmez)

```bash
npm install
npm run mobile
```

Telefonda **Expo Go** ile QR kodu okut. `.env` yoksa uygulama **DEMO** modunda açılır: veriler yalnızca cihazda tutulur, ekranda "DEMO" etiketi görünür ve örnek kayıtlar "örnek" diye işaretlidir.

> Expo Go yalnızca kendi içindeki modülleri çalıştırır. Bildirim (push) testi için geliştirme derlemesi gerekir: `npx eas-cli@latest build --profile development`.

## Supabase'e bağlama

1. [supabase.com](https://supabase.com) üzerinde proje aç. Bölge olarak **AB (ör. Frankfurt)** seç (KVKK md. 9 yurt dışı aktarım değerlendirmesi için hukuk ekibiyle teyit et).
2. Migration'ları uygula:
   ```bash
   npx supabase link --project-ref <proje-ref>
   npx supabase db push
   ```
3. Şasi numarası şifreleme anahtarını Vault'a ekle (SQL Editor, en az 32 karakter rastgele değer):
   ```sql
   select vault.create_secret('<rastgele-uzun-anahtar>', 'vin_encryption_key');
   ```
4. Edge Functions:
   ```bash
   npx supabase functions deploy delete-account
   npx supabase functions deploy send-reminders --no-verify-jwt
   npx supabase functions deploy identify-warning-light
   npx supabase secrets set REMINDERS_CRON_SECRET=<rastgele-değer>
   npx supabase secrets set ANTHROPIC_API_KEY=<anthropic-api-anahtarı>
   ```
5. `apps/mobile/.env` oluştur (`.env.example`'dan kopyala) ve proje adresi ile **anon** anahtarı yaz. Service role anahtarını asla uygulamaya koyma.
6. Authentication > Providers > Email: "Confirm email" açık, e-posta şablonunda `{{ .Token }}` (6 haneli kod) kullan.

### Bildirimler

- `app.json` içine `extra.eas.projectId` ekle (`npx eas-cli@latest init` yazar).
- Günlük gönderim için Supabase'de `pg_cron` ve `pg_net` eklentilerini aç, ardından:
  ```sql
  select cron.schedule('bakim-hatirlatma', '0 6 * * *',  -- 06:00 UTC = 09:00 İstanbul
    $$select net.http_post(
        url := 'https://<proje-ref>.supabase.co/functions/v1/send-reminders',
        headers := jsonb_build_object('x-cron-secret', '<REMINDERS_CRON_SECRET>', 'Content-Type', 'application/json'),
        body := '{}'::jsonb)$$);
  ```
- Aynı hatırlatma için 7 gün içinde ikinci bildirim gönderilmez.

### Gösterge ışığı tanıma

- Fotoğraf, uygulamada en fazla 1568 piksele küçültülüp `identify-warning-light` fonksiyonuna gönderilir; hiçbir yerde saklanmaz.
- Fonksiyon sırasıyla oturumu, açık rızayı (`consents.ai_processing`) ve aylık kotayı (`ai_quota`: ücretsiz 10, Plus 100) kontrol eder, ardından Claude'u (`claude-opus-5-5`, yapılandırılmış çıktı) çağırır.
- Model yalnızca hangi ışığın yandığını söyler. "Aracı kullanabilir miyim?" kararı `packages/core/src/warning-lights.json` kataloğundan gelir; katalogda olmayan kırmızı ışık her zaman "dur" sayılır.
- Katalog değişince `npm run sync:shared` ile sunucudaki kopyayı güncelle (test, iki kopyanın aynı olduğunu kontrol eder).
- Anthropic API anahtarını yalnızca Supabase secret olarak tut; uygulamaya koyma.
- Demo modunda fotoğraf analiz edilmez; akışı göstermek için "örnek sonuç" etiketli sabit bir sonuç döner.

## Testler ve kontroller

```bash
npm run check        # tür kontrolü + lint + birim testleri + veritabanı testleri
npm test             # packages/core birim testleri (Vitest)
npm run db:test      # migration'ları geçici PostgreSQL'e uygular, RLS testlerini çalıştırır
npm run web:build    # web derlemesi (apps/mobile/dist)
npm run e2e          # derlenmiş web uygulamasında uçtan uca akış (BASE_URL ile)
npm run fn:test      # identify-warning-light fonksiyonunu sahte Supabase ve sahte Claude API'ye karşı çalıştırır (ücretsiz)
```

`db:test` için makinede PostgreSQL 15+ ikili dosyaları gerekir (`initdb`, `pg_ctl`, `psql`). Supabase'in `auth`, `vault` ve `storage` nesneleri `supabase/tests/supabase_stub.sql` ile taklit edilir.

Bakım durumu hesabı iki yerde yapılır: uygulamada `packages/core` ve sunucuda `public.compute_due` (bildirimler için). İkisi `packages/core/test/fixtures/due-cases.json` içindeki aynı vakalarla test edilir; biri değişirse test kırılır.

## Güvenlik kararları

| Konu | Uygulama |
| --- | --- |
| Erişim | Her tabloda RLS. Kullanıcı yalnızca kendi araçlarına ve onların kayıtlarına erişir. |
| Değiştirilemez alanlar | `profiles.plan`, `vehicles.vin_masked`, `vehicles.owner_id` sütun izinleriyle kapalı. Plan yalnızca sunucudan değişir. |
| Şasi numarası | `private.vehicle_vins` içinde `pgp_sym_encrypt` ile şifreli; anahtar Vault'ta. Tabloda yalnızca maskeli hali var. |
| Üretici aralığı | `manufacturer_verified` etiketi yalnızca servis rolü/yönetici atayabilir; kullanıcı aralığı değiştirirse etiket düşer. |
| Kilometre | Kayıtlı en yüksek değerin altına inemez; yakıt ve bakım kayıtları kilometreyi ileri taşır. |
| Araç sınırı | Ücretsiz plan 2 araç; sunucuda tetikleyiciyle de uygulanır. |
| KVKK izinleri | `consents` ekle-oku tablosu; değiştirilemez, geri çekme yeni satırla yapılır. |
| Hesap silme | Uygulama içinden (App Store 5.1.1(v)). Edge Function dosyaları ve kullanıcıyı siler; veriler cascade ile gider. |

## Aşama 1'de olmayanlar (bilerek)

- Parça Pazarı, Forum ve Servisler sekmeleri bilgilendirme ekranı olarak duruyor; sahte ürün, servis veya gönderi gösterilmiyor.
- Apple ve Google ile giriş: Aşama 2 (Apple ile giriş, Google girişi eklendiği anda zorunlu olur).
- Fatura/fiş fotoğrafı yükleme ve otomatik okuma: veritabanı ve storage hazır, arayüz Aşama 2'de.
- Araç kataloğu tabloları hazır ama boş; lisanslı katalog (ör. TecDoc) sözleşmesi sonrası doldurulacak. Şimdilik marka ve model serbest metin.
- Marka yazı tipleri (Chakra Petch / Barlow) henüz yüklenmedi; sistem yazı tipi kullanılıyor.
