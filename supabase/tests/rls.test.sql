-- Erişim ve iş kuralı testleri. Her bölüm başarısızlıkta exception fırlatır (psql ON_ERROR_STOP).
\set ON_ERROR_STOP 1
\set QUIET 1

-- Hazırlık: iki kullanıcı (A, B)
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

create or replace function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
declare failed boolean := false; msg text;
begin
  begin
    execute sql;
  exception when others then
    failed := true;
    msg := sqlerrm;
  end;
  if not failed then
    raise exception 'BEKLENEN HATA OLUŞMADI: %', sql;
  end if;
  if position(needle in msg) = 0 then
    raise exception 'YANLIŞ HATA: % → % (beklenen içerik: %)', sql, msg, needle;
  end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

\echo '1. Kayıtla profil otomatik oluşur'
do $$ begin
  if (select count(*) from public.profiles) <> 2 then raise exception 'profil oluşmadı'; end if;
end $$;

-- ---------------- Kullanıcı A ----------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false) \g /dev/null

\echo '2. A araç ekler (owner_id otomatik)'
insert into public.vehicles (id, make, model, model_year, fuel_type, transmission, odometer_km, plate)
values ('10000000-0000-0000-0000-000000000001', 'Ford', 'Focus', 2016, 'diesel', 'manual', 148760, '34 ABC 123');

\echo '3. A plan alanını değiştiremez, başkası adına araç ekleyemez'
select pg_temp.expect_error($$update public.profiles set plan = 'plus'$$, 'permission denied');
select pg_temp.expect_error($$insert into public.vehicles (make, model, model_year, fuel_type, transmission, odometer_km, owner_id)
  values ('X','Y',2020,'diesel','manual',1,'00000000-0000-0000-0000-00000000000b')$$, 'permission denied');
select pg_temp.expect_error($$update public.vehicles set vin_masked = 'X'$$, 'permission denied');

\echo '4. Geçersiz plaka ve gelecek model yılı reddedilir'
select pg_temp.expect_error($$insert into public.vehicles (make, model, model_year, fuel_type, transmission, odometer_km, plate)
  values ('Ford','Courier',2020,'diesel','manual',1,'34abc123')$$, 'vehicles_plate_check');
select pg_temp.expect_error($$insert into public.vehicles (make, model, model_year, fuel_type, transmission, odometer_km)
  values ('Ford','Courier',2099,'diesel','manual',1)$$, 'MODEL_YEAR_INVALID');

\echo '5. Ücretsiz planda 6. araç reddedilir; arşivleyince yer açılır'
insert into public.vehicles (id, make, model, model_year, fuel_type, transmission, odometer_km)
values ('10000000-0000-0000-0000-000000000002', 'Ford', 'Transit Courier', 2020, 'diesel', 'manual', 86300);
insert into public.vehicles (id, make, model, model_year, fuel_type, transmission, odometer_km) values
  ('10000000-0000-0000-0000-0000000000e1', 'Fiat', 'Doblo', 2018, 'diesel', 'manual', 1000),
  ('10000000-0000-0000-0000-0000000000e2', 'Fiat', 'Egea', 2019, 'diesel', 'manual', 1000),
  ('10000000-0000-0000-0000-0000000000e3', 'Fiat', 'Linea', 2015, 'diesel', 'manual', 1000);
select pg_temp.expect_error($$insert into public.vehicles (make, model, model_year, fuel_type, transmission, odometer_km)
  values ('Renault','Clio',2022,'gasoline','manual',1000)$$, 'VEHICLE_LIMIT');
update public.vehicles set archived_at = now() where id = '10000000-0000-0000-0000-000000000002';
insert into public.vehicles (id, make, model, model_year, fuel_type, transmission, odometer_km)
values ('10000000-0000-0000-0000-000000000003', 'Renault', 'Clio', 2022, 'gasoline', 'manual', 1000);
select pg_temp.expect_error($$update public.vehicles set archived_at = null where id = '10000000-0000-0000-0000-000000000002'$$, 'VEHICLE_LIMIT');
-- Sonraki adımlar için ek araçlar arşivlenir (2 aktif araç kalır)
update public.vehicles set archived_at = now() where id in ('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e3');

\echo '6. Şasi numarası şifreli saklanır, yalnızca maskeli hali tabloda'
select pg_temp.expect_error($$select public.set_vehicle_vin('10000000-0000-0000-0000-000000000001', 'WF0XXXGCDXGO12345')$$, 'VIN_INVALID');
do $$ begin
  if public.set_vehicle_vin('10000000-0000-0000-0000-000000000001', 'wf0xxxgcdxga12345') <> 'WF0••••••••••2345' then raise exception 'maske yanlış'; end if;
  if public.get_vehicle_vin('10000000-0000-0000-0000-000000000001') <> 'WF0XXXGCDXGA12345' then raise exception 'çözme yanlış'; end if;
  if (select vin_masked from public.vehicles where id = '10000000-0000-0000-0000-000000000001') <> 'WF0••••••••••2345' then raise exception 'vin_masked yazılmadı'; end if;
end $$;
select pg_temp.expect_error($$select * from private.vehicle_vins$$, 'permission denied');

\echo '7. Bakım kuralı: üretici etiketini kullanıcı atayamaz'
insert into public.maintenance_rules (id, vehicle_id, item_key, title, every_km, every_months, last_done_km, last_done_on)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'engine_oil', 'Motor yağı', 15000, 12, 136000, '2026-03-10');
select pg_temp.expect_error($$insert into public.maintenance_rules (vehicle_id, item_key, title, every_km, last_done_km, source)
  values ('10000000-0000-0000-0000-000000000001','air_filter','Hava filtresi',30000,121000,'manufacturer_verified')$$, 'SOURCE_NOT_ALLOWED');
select pg_temp.expect_error($$insert into public.maintenance_rules (vehicle_id, item_key, title, kind)
  values ('10000000-0000-0000-0000-000000000001','x','Aralıksız','interval')$$, 'check');

\echo '8. Yapılan işlem kuralı ve kilometreyi günceller'
insert into public.maintenance_events (vehicle_id, rule_id, title, performed_on, odometer_km, cost)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Motor yağı', '2026-11-14', 149000, 1980);
do $$ begin
  if (select last_done_km from public.maintenance_rules where id = '20000000-0000-0000-0000-000000000001') <> 149000 then raise exception 'last_done_km güncellenmedi'; end if;
  if (select last_done_on from public.maintenance_rules where id = '20000000-0000-0000-0000-000000000001') <> '2026-11-14' then raise exception 'last_done_on güncellenmedi'; end if;
  if (select odometer_km from public.vehicles where id = '10000000-0000-0000-0000-000000000001') <> 149000 then raise exception 'kilometre ilerlemedi'; end if;
end $$;

\echo '9. Yakıt kaydı kilometreyi ilerletir; kilometre geçmişin altına inemez'
insert into public.fuel_records (vehicle_id, filled_on, odometer_km, quantity, unit_price, total_amount, fuel_type)
values ('10000000-0000-0000-0000-000000000001', '2026-11-14', 149500, 45.2, 63.5, 2870.20, 'diesel');
select pg_temp.expect_error($$update public.vehicles set odometer_km = 149400 where id = '10000000-0000-0000-0000-000000000001'$$, 'ODOMETER_BELOW_HISTORY');
update public.vehicles set odometer_km = 149600 where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect_error($$insert into public.fuel_records (vehicle_id, filled_on, odometer_km, quantity, unit_price, total_amount, fuel_type)
  values ('10000000-0000-0000-0000-000000000001','2026-11-14',149700,0,63.5,0,'diesel')$$, 'check');

\echo '10. Bakım durumu görünümü sahibine görünür'
do $$ begin
  if (select count(*) from public.maintenance_due) <> 1 then raise exception 'maintenance_due satır sayısı yanlış'; end if;
end $$;

\echo '10b. Trafik cezası: kurallar ve indirim süresi görünümü'
insert into public.traffic_fines (id, vehicle_id, fine_date, notified_on, amount)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-11-01', '2026-11-03', 2000);
select pg_temp.expect_error($$insert into public.traffic_fines (vehicle_id, fine_date, notified_on, amount)
  values ('10000000-0000-0000-0000-000000000001', '2026-11-05', '2026-11-01', 100)$$, 'check');
select pg_temp.expect_error($$update public.traffic_fines set paid_on = '2026-11-10' where id = '30000000-0000-0000-0000-000000000001'$$, 'check');
do $$ begin
  if (select discount_until from public.fine_due where fine_id = '30000000-0000-0000-0000-000000000001') <> '2026-11-18' then raise exception 'indirim son günü yanlış'; end if;
  if (select due_on from public.fine_due where fine_id = '30000000-0000-0000-0000-000000000001') <> '2026-12-03' then raise exception 'ödeme son günü yanlış'; end if;
end $$;
update public.traffic_fines set paid_on = '2026-11-10', paid_amount = 1500 where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.fine_due) <> 0 then raise exception 'ödenen ceza hâlâ listede'; end if;
end $$;

\echo '11. İzin kaydı eklenir ama değiştirilemez'
insert into public.consents (consent, granted, text_version) values ('kvkk_notice', true, '2026-11-v1');
select pg_temp.expect_error($$update public.consents set granted = false$$, 'permission denied');
select pg_temp.expect_error($$delete from public.consents$$, 'permission denied');

\echo '11b. Yapay zekâ kotası: kullanıcı kendi sayacını yazamaz, başkasının kotasını soramaz'
insert into public.consents (consent, granted, text_version) values ('ai_processing', true, '2026-11-v1');
select pg_temp.expect_error($$insert into public.ai_usage (user_id, feature) values (auth.uid(), 'warning_light')$$, 'permission denied');
select pg_temp.expect_error($$select * from public.ai_quota('warning_light', '00000000-0000-0000-0000-00000000000b')$$, 'NOT_ALLOWED');
do $$ declare q record; begin
  select * into q from public.ai_quota('warning_light');
  if q.used <> 0 or q.monthly_limit <> 10 then raise exception 'kota yanlış: %', row_to_json(q); end if;
end $$;
reset role;
insert into public.ai_usage (user_id, feature) select '00000000-0000-0000-0000-00000000000a', 'warning_light' from generate_series(1, 3);
insert into public.ai_usage (user_id, feature, created_at) values ('00000000-0000-0000-0000-00000000000a', 'warning_light', now() - interval '40 days');
set role authenticated;
do $$ declare q record; begin
  select * into q from public.ai_quota('warning_light');
  if q.used <> 3 then raise exception '30 gün dışı kullanım sayıldı: %', row_to_json(q); end if;
end $$;

\echo '12. Cihaz anahtarı kaydı'
select public.register_device_token('ExponentPushToken[aaa]', 'ios');

-- ---------------- Kullanıcı B ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false) \g /dev/null

\echo '13. B, A verisini göremez ve değiştiremez'
do $$ begin
  if (select count(*) from public.vehicles) <> 0 then raise exception 'B, A araçlarını görüyor'; end if;
  if (select count(*) from public.maintenance_rules) <> 0 then raise exception 'B, A kurallarını görüyor'; end if;
  if (select count(*) from public.fuel_records) <> 0 then raise exception 'B, A yakıt kayıtlarını görüyor'; end if;
  if (select count(*) from public.maintenance_due) <> 0 then raise exception 'B, A bakım durumunu görüyor'; end if;
  if (select count(*) from public.consents) <> 0 then raise exception 'B, A izinlerini görüyor'; end if;
  if (select count(*) from public.ai_usage) <> 0 then raise exception 'B, A yapay zekâ kullanımını görüyor'; end if;
  if (select count(*) from public.traffic_fines) <> 0 then raise exception 'B, A cezalarını görüyor'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'B başka profilleri görüyor'; end if;
end $$;
update public.vehicles set odometer_km = 1 where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect_error($$insert into public.fuel_records (vehicle_id, filled_on, odometer_km, quantity, unit_price, total_amount, fuel_type)
  values ('10000000-0000-0000-0000-000000000001','2026-11-14',150000,10,60,600,'diesel')$$, 'row-level security');
select pg_temp.expect_error($$select public.get_vehicle_vin('10000000-0000-0000-0000-000000000001')$$, 'NOT_FOUND');
select pg_temp.expect_error($$select public.set_vehicle_vin('10000000-0000-0000-0000-000000000001', 'WF0XXXGCDXGA12345')$$, 'NOT_FOUND');

\echo '14. Cihaz anahtarı yeni hesaba taşınır'
select public.register_device_token('ExponentPushToken[aaa]', 'ios');
do $$ begin
  if (select count(*) from public.device_tokens) <> 1 then raise exception 'anahtar taşınmadı'; end if;
end $$;

\echo '15. Storage: başkasının klasörüne yükleyemez'
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('documents', '00000000-0000-0000-0000-00000000000a/fatura.pdf')$$, 'row-level security');
insert into storage.objects (bucket_id, name) values ('documents', '00000000-0000-0000-0000-00000000000b/fatura.pdf');

-- ---------------- Anonim ----------------
reset role;
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false) \g /dev/null
\echo '16. Anonim kullanıcı kataloğu okur, araçları okuyamaz'
select count(*) from public.vehicle_makes \g /dev/null
select pg_temp.expect_error($$select * from public.vehicles$$, 'permission denied');

reset role;
\echo '17. Kullanıcı silinince verisi silinir (KVKK)'
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from public.vehicles) <> 0 then raise exception 'araçlar silinmedi'; end if;
  if (select count(*) from private.vehicle_vins) <> 0 then raise exception 'şasi numaraları silinmedi'; end if;
  if (select count(*) from public.fuel_records) <> 0 then raise exception 'yakıt kayıtları silinmedi'; end if;
  if (select count(*) from public.traffic_fines) <> 0 then raise exception 'cezalar silinmedi'; end if;
  if (select count(*) from public.consents where user_id = '00000000-0000-0000-0000-00000000000a') <> 0 then raise exception 'izinler silinmedi'; end if;
  if (select count(*) from public.ai_usage where user_id = '00000000-0000-0000-0000-00000000000a') <> 0 then raise exception 'yapay zekâ kullanım kayıtları silinmedi'; end if;
end $$;

\echo 'TÜM RLS TESTLERİ GEÇTİ'
