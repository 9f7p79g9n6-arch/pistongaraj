-- PISTON SERVİS erişim ve iş kuralı testleri. Her bölüm başarısızlıkta exception fırlatır.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'usta.a@example.test'),     -- İşletme A sahibi
  ('00000000-0000-0000-0000-0000000000d1', 'usta.b@example.test'),     -- İşletme B sahibi
  ('00000000-0000-0000-0000-0000000000e1', 'Musteri@Example.test'),    -- A'nın müşterisi (büyük harf: eşleşme küçük harfle yapılır)
  ('00000000-0000-0000-0000-0000000000f1', 'baskasi@example.test');    -- İlgisiz kullanıcı

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

-- ---------------- İşletme A ----------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', false) \g /dev/null

\echo 'S1. İşletme açılır; açan kişi sahip olur, durum sunucuda atanır'
do $$ declare v uuid; begin
  v := public.create_business('Usta Oto', 'Ali Usta', '+905321112233', 'Usta.A@Example.test', 'İstanbul', 'Kartal',
    'Sanayi Sitesi 5. Blok No 12', 'mechanic', null, '1234567890');
  perform set_config('test.biz_a', v::text, false);
  if (select status from public.businesses where id = v) <> 'pending_verification' then raise exception 'durum yanlış'; end if;
  if (select email from public.businesses where id = v) <> 'usta.a@example.test' then raise exception 'e-posta küçük harfe çevrilmedi'; end if;
  if (select role from public.business_members where business_id = v and user_id = auth.uid()) <> 'owner' then raise exception 'sahip üyeliği yok'; end if;
end $$;
select pg_temp.expect_error($$update public.businesses set status = 'active'$$, 'permission denied');
select pg_temp.expect_error($$insert into public.businesses (name, contact_name, phone, city, district, address, category)
  values ('X', 'Y', '+905321112233', 'A', 'B', 'C', 'other')$$, 'permission denied');
select pg_temp.expect_error($$insert into public.business_members (business_id, user_id, role)
  values (current_setting('test.biz_a')::uuid, '00000000-0000-0000-0000-0000000000f1', 'owner')$$, 'permission denied');

\echo 'S2. Hatalı işletme bilgisi sunucuda reddedilir'
select pg_temp.expect_error($$select public.create_business('Usta Oto', 'Ali Usta', '0532', null, 'İstanbul', 'Kartal', 'Sanayi Sitesi 5', 'mechanic', null, null)$$, 'check');
select pg_temp.expect_error($$select public.create_business('U', 'Ali Usta', '+905321112233', null, 'İstanbul', 'Kartal', 'Sanayi Sitesi 5', 'mechanic', null, null)$$, 'check');
select pg_temp.expect_error($$select public.create_business('Usta Oto', 'Ali Usta', '+905321112233', null, 'İstanbul', 'Kartal', 'Sanayi Sitesi 5', 'mechanic', null, '12')$$, 'check');

\echo 'S3. Müşteri ve araç eklenir; aynı telefon ve plaka ikinci kez eklenemez'
insert into public.business_customers (id, business_id, full_name, phone, email)
values ('50000000-0000-0000-0000-000000000001', current_setting('test.biz_a')::uuid, 'Ayşe Yılmaz', '+905339998877', 'musteri@example.test');
insert into public.business_vehicles (id, business_id, customer_id, plate, make, model, model_year, last_odometer_km)
values ('60000000-0000-0000-0000-000000000001', current_setting('test.biz_a')::uuid, '50000000-0000-0000-0000-000000000001', '34 ABC 123', 'Ford', 'Focus', 2016, 148000);
select pg_temp.expect_error($$insert into public.business_customers (business_id, full_name, phone)
  values (current_setting('test.biz_a')::uuid, 'Başka Ad', '+905339998877')$$, 'duplicate key');
select pg_temp.expect_error($$insert into public.business_vehicles (business_id, plate, make, model)
  values (current_setting('test.biz_a')::uuid, '34 ABC 123', 'Fiat', 'Egea')$$, 'duplicate key');
select pg_temp.expect_error($$insert into public.business_vehicles (business_id, plate, make, model)
  values (current_setting('test.biz_a')::uuid, '34ABC123', 'Fiat', 'Egea')$$, 'check');
select pg_temp.expect_error($$insert into public.business_customers (business_id, full_name, phone, email)
  values (current_setting('test.biz_a')::uuid, 'Mehmet Kaya', '+905331112233', 'BUYUK@harf.com')$$, 'check');

\echo 'S4. Plaka ile kayıtlı araç bulunur'
do $$ begin
  if (select count(*) from public.business_vehicles where plate = '34 ABC 123') <> 1 then raise exception 'plaka bulunamadı'; end if;
end $$;

\echo 'S5. Servis kaydı oluşur; parça ve işçilik ayrı, toplamlar sunucuda hesaplanır'
do $$ declare v uuid; r public.service_records; begin
  v := public.save_service_record(jsonb_build_object(
    'business_id', current_setting('test.biz_a'), 'customer_id', '50000000-0000-0000-0000-000000000001',
    'vehicle_id', '60000000-0000-0000-0000-000000000001', 'client_request_id', '70000000-0000-0000-0000-000000000001',
    'odometer_km', 148760, 'complaint', 'Periyodik bakım', 'vat_rate', 20,
    'items', jsonb_build_array(
      jsonb_build_object('title', 'Yağ değişimi', 'part_name', 'Motor yağı 5W-30', 'part_qty', 4, 'part_unit_kurus', 45000, 'labor_kurus', 60000),
      jsonb_build_object('title', 'Filtre', 'part_name', 'Yağ filtresi', 'part_qty', 1, 'part_unit_kurus', 25050, 'discount_kurus', 5050),
      -- İstemcinin gönderdiği toplam yok sayılır
      jsonb_build_object('title', 'Kontrol', 'labor_kurus', 0, 'grand_kurus', 1))));
  perform set_config('test.rec', v::text, false);
  select * into r from public.service_records where id = v;
  if r.status <> 'awaiting_approval' or r.approval_version <> 1 then raise exception 'başlangıç durumu yanlış: %', r.status; end if;
  if r.parts_kurus <> 205050 or r.labor_kurus <> 60000 or r.discount_kurus <> 5050 then raise exception 'ara toplamlar yanlış: %', row_to_json(r); end if;
  if r.vat_kurus <> 52000 or r.grand_kurus <> 312000 then raise exception 'KDV/genel toplam yanlış: %', row_to_json(r); end if;
  if r.created_by <> auth.uid() then raise exception 'oluşturan kaydedilmedi'; end if;
  if (select last_odometer_km from public.business_vehicles where id = r.vehicle_id) <> 148760 then raise exception 'araç kilometresi ilerlemedi'; end if;
  if (select count(*) from public.service_status_history where record_id = v) <> 1 then raise exception 'durum geçmişi yazılmadı'; end if;
end $$;

\echo 'S6. Aynı istek ikinci kez gelirse yeni kayıt açılmaz (internet kesintisi)'
do $$ declare v uuid; begin
  v := public.save_service_record(jsonb_build_object(
    'business_id', current_setting('test.biz_a'), 'customer_id', '50000000-0000-0000-0000-000000000001',
    'vehicle_id', '60000000-0000-0000-0000-000000000001', 'client_request_id', '70000000-0000-0000-0000-000000000001',
    'odometer_km', 148760, 'complaint', 'Periyodik bakım', 'items', jsonb_build_array(jsonb_build_object('title', 'Yağ değişimi'))));
  if v::text <> current_setting('test.rec') then raise exception 'farklı kayıt döndü'; end if;
  if (select count(*) from public.service_records) <> 1 then raise exception 'mükerrer kayıt oluştu'; end if;
end $$;

\echo 'S7. Hatalı servis verisi reddedilir; tablolara doğrudan yazılamaz'
select pg_temp.expect_error($$select public.save_service_record(jsonb_build_object('business_id', current_setting('test.biz_a'),
  'customer_id', '50000000-0000-0000-0000-000000000001', 'vehicle_id', '60000000-0000-0000-0000-000000000001',
  'client_request_id', gen_random_uuid(), 'odometer_km', 1000, 'complaint', 'Ses var', 'items', '[]'::jsonb))$$, 'ITEMS_REQUIRED');
select pg_temp.expect_error($$select public.save_service_record(jsonb_build_object('business_id', current_setting('test.biz_a'),
  'customer_id', '50000000-0000-0000-0000-000000000001', 'vehicle_id', '60000000-0000-0000-0000-000000000001',
  'client_request_id', gen_random_uuid(), 'odometer_km', 1000, 'complaint', 'Ses var',
  'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 100, 'discount_kurus', 101))))$$, 'check');
select pg_temp.expect_error($$select public.save_service_record(jsonb_build_object('business_id', current_setting('test.biz_a'),
  'customer_id', '50000000-0000-0000-0000-000000000001', 'vehicle_id', '60000000-0000-0000-0000-000000000001',
  'client_request_id', gen_random_uuid(), 'odometer_km', 1000, 'complaint', 'Ses var',
  'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', -5))))$$, 'check');
select pg_temp.expect_error($$select public.save_service_record(jsonb_build_object('business_id', current_setting('test.biz_a'),
  'customer_id', '50000000-0000-0000-0000-000000000001', 'vehicle_id', '60000000-0000-0000-0000-000000000001',
  'client_request_id', gen_random_uuid(), 'odometer_km', 1000, 'complaint', 'X',
  'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik'))))$$, 'check');
select pg_temp.expect_error($$select public.save_service_record(jsonb_build_object('business_id', current_setting('test.biz_a'),
  'customer_id', '50000000-0000-0000-0000-000000000001', 'vehicle_id', '60000000-0000-0000-0000-000000000001',
  'client_request_id', gen_random_uuid(), 'odometer_km', 1000, 'complaint', 'Ses var',
  'items', jsonb_build_array(jsonb_build_object('title', 'Balata', 'part_qty', 2, 'part_unit_kurus', 100))))$$, 'check');
select pg_temp.expect_error($$insert into public.service_records (business_id, customer_id, vehicle_id, intake_at, odometer_km, complaint, client_request_id)
  values (current_setting('test.biz_a')::uuid, '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', now(), 1, 'abc', gen_random_uuid())$$, 'permission denied');
select pg_temp.expect_error($$update public.service_records set status = 'approved'$$, 'permission denied');
select pg_temp.expect_error($$update public.service_records set grand_kurus = 1$$, 'permission denied');
select pg_temp.expect_error($$insert into public.audit_logs (table_name, row_id, action) values ('x', gen_random_uuid(), 'INSERT')$$, 'permission denied');

-- ---------------- İşletme B ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', false) \g /dev/null

\echo 'S8. Başka işletmenin kayıtlarına erişilemez'
do $$ declare v uuid; begin
  v := public.create_business('Başka Servis', 'Veli Usta', '+902165554433', null, 'Ankara', 'Ostim', 'OSB 1234. Cadde No 5', 'auto_electric', null, null);
  perform set_config('test.biz_b', v::text, false);
  if (select count(*) from public.businesses) <> 1 then raise exception 'B başka işletmeyi görüyor'; end if;
  if (select count(*) from public.business_customers) <> 0 then raise exception 'B A''nın müşterilerini görüyor'; end if;
  if (select count(*) from public.business_vehicles) <> 0 then raise exception 'B A''nın araçlarını görüyor'; end if;
  if (select count(*) from public.service_records) <> 0 then raise exception 'B A''nın servis kayıtlarını görüyor'; end if;
  if (select count(*) from public.service_record_items) <> 0 then raise exception 'B A''nın kalemlerini görüyor'; end if;
  if (select count(*) from public.service_status_history) <> 0 then raise exception 'B A''nın durum geçmişini görüyor'; end if;
  if (select count(*) from public.audit_logs) <> 0 then raise exception 'B A''nın denetim kaydını görüyor'; end if;
  if (select count(*) from public.business_members) <> 1 then raise exception 'B başka üyelikleri görüyor'; end if;
  if jsonb_array_length(public.my_service_records()) <> 0 then raise exception 'B müşteri olarak kayıt görüyor'; end if;
end $$;
select pg_temp.expect_error($$select public.business_service_record(current_setting('test.rec')::uuid)$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.save_service_record(jsonb_build_object('id', current_setting('test.rec'),
  'odometer_km', 1, 'complaint', 'Değiştirdim', 'items', jsonb_build_array(jsonb_build_object('title', 'Sahte'))))$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.save_service_record(jsonb_build_object('business_id', current_setting('test.biz_a'),
  'customer_id', '50000000-0000-0000-0000-000000000001', 'vehicle_id', '60000000-0000-0000-0000-000000000001',
  'client_request_id', gen_random_uuid(), 'odometer_km', 1, 'complaint', 'Sahte kayıt', 'items', jsonb_build_array(jsonb_build_object('title', 'Sahte'))))$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.complete_service_record(current_setting('test.rec')::uuid)$$, 'FORBIDDEN');
select pg_temp.expect_error($$insert into public.business_customers (business_id, full_name, phone)
  values (current_setting('test.biz_a')::uuid, 'Sızma Deneme', '+905330000000')$$, 'row-level security');
-- B, A'nın müşterisini kendi aracına bağlayamaz (bileşik yabancı anahtar)
select pg_temp.expect_error($$insert into public.business_vehicles (business_id, customer_id, plate, make, model)
  values (current_setting('test.biz_b')::uuid, '50000000-0000-0000-0000-000000000001', '06 B 1234', 'Fiat', 'Egea')$$, 'foreign key');
do $$ begin
  update public.businesses set name = 'Ele geçirildi' where id = current_setting('test.biz_a')::uuid;
  update public.business_customers set full_name = 'Ele geçirildi';
end $$;

-- ---------------- Müşteri ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', false) \g /dev/null

\echo 'S9. Müşteri kaydı uygulamadan görür; tablolara doğrudan erişemez'
do $$ declare j jsonb; begin
  j := public.my_service_records();
  if jsonb_array_length(j) <> 1 then raise exception 'müşteri kaydını görmüyor: %', j; end if;
  if j->0->>'business_name' <> 'Usta Oto' then raise exception 'işletme adı yanlış (B değiştirebilmiş olabilir): %', j->0->>'business_name'; end if;
  if (j->0->>'grand_kurus')::bigint <> 312000 then raise exception 'genel toplam yanlış'; end if;
  if jsonb_array_length(j->0->'items') <> 3 then raise exception 'kalemler eksik'; end if;
  if (j->0->'items'->0) ? 'business_id' then raise exception 'iç alan sızıyor'; end if;
  if (select count(*) from public.service_records) <> 0 then raise exception 'müşteri tabloyu doğrudan okuyor'; end if;
  if (select count(*) from public.business_customers) <> 0 then raise exception 'müşteri işletmenin müşteri listesini okuyor'; end if;
end $$;
select pg_temp.expect_error($$select public.business_service_record(current_setting('test.rec')::uuid)$$, 'FORBIDDEN');

\echo 'S10. Müşteri itiraz eder: sebep zorunlu, eski sürüme yanıt verilemez'
select pg_temp.expect_error($$select public.respond_to_service_record(current_setting('test.rec')::uuid, 1, 'objected', '')$$, 'REASON_REQUIRED');
select pg_temp.expect_error($$select public.respond_to_service_record(current_setting('test.rec')::uuid, 9, 'approved')$$, 'VERSION_CHANGED');
select pg_temp.expect_error($$select public.respond_to_service_record(current_setting('test.rec')::uuid, 1, 'sil')$$, 'ACTION_INVALID');
select public.respond_to_service_record(current_setting('test.rec')::uuid, 1, 'objected', 'Filtre değişmedi, eski filtre duruyor') \g /dev/null
do $$ begin
  if (public.my_service_records()->0->>'status') <> 'objected' then raise exception 'itiraz işlenmedi'; end if;
end $$;
select pg_temp.expect_error($$select public.respond_to_service_record(current_setting('test.rec')::uuid, 1, 'approved')$$, 'STATUS_INVALID');

-- ---------------- İlgisiz kullanıcı ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', false) \g /dev/null

\echo 'S11. İlgisiz kullanıcı kaydı göremez ve yanıtlayamaz'
do $$ begin
  if jsonb_array_length(public.my_service_records()) <> 0 then raise exception 'ilgisiz kullanıcı kayıt görüyor'; end if;
end $$;
select pg_temp.expect_error($$select public.respond_to_service_record(current_setting('test.rec')::uuid, 1, 'approved')$$, 'FORBIDDEN');

-- ---------------- İşletme A: itirazı görür, düzeltir ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', false) \g /dev/null

\echo 'S12. İtiraz edilen kayıt silinmez; işletme itirazı görür ve düzeltme gönderir'
select pg_temp.expect_error($$delete from public.service_records$$, 'permission denied');
select pg_temp.expect_error($$delete from public.service_approvals$$, 'permission denied');
do $$ declare r public.service_records; begin
  if (select reason from public.service_approvals where record_id = current_setting('test.rec')::uuid) not like 'Filtre%' then
    raise exception 'işletme itiraz sebebini görmüyor';
  end if;
  if (select name from public.businesses where id = current_setting('test.biz_a')::uuid) <> 'Usta Oto' then raise exception 'B, A''nın adını değiştirmiş'; end if;
  if (select full_name from public.business_customers where id = '50000000-0000-0000-0000-000000000001') <> 'Ayşe Yılmaz' then raise exception 'B, A''nın müşterisini değiştirmiş'; end if;
  perform public.save_service_record(jsonb_build_object('id', current_setting('test.rec'), 'odometer_km', 148760,
    'complaint', 'Periyodik bakım', 'vat_rate', 20,
    'items', jsonb_build_array(
      jsonb_build_object('title', 'Yağ değişimi', 'part_name', 'Motor yağı 5W-30', 'part_qty', 4, 'part_unit_kurus', 45000, 'labor_kurus', 60000))));
  select * into r from public.service_records where id = current_setting('test.rec')::uuid;
  if r.status <> 'revised' or r.approval_version <> 2 then raise exception 'düzeltme durumu yanlış: % v%', r.status, r.approval_version; end if;
  if r.grand_kurus <> 288000 then raise exception 'düzeltilmiş toplam yanlış: %', r.grand_kurus; end if;
  if r.updated_by <> auth.uid() then raise exception 'güncelleyen kaydedilmedi'; end if;
  if (select count(*) from public.audit_logs where row_id = r.id and action = 'UPDATE') = 0 then raise exception 'denetim kaydı yok'; end if;
  if (select count(*) from public.audit_logs where table_name = 'service_record_items' and action = 'DELETE') <> 3 then raise exception 'silinen kalemler denetime yazılmadı'; end if;
  if (select array_agg(status::text order by id) from public.service_status_history where record_id = r.id) <> array['awaiting_approval', 'objected', 'revised'] then
    raise exception 'durum geçmişi yanlış';
  end if;
end $$;

-- ---------------- Müşteri onaylar ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', false) \g /dev/null
\echo 'S13. Müşteri düzeltilmiş kaydı onaylar'
select pg_temp.expect_error($$select public.respond_to_service_record(current_setting('test.rec')::uuid, 1, 'approved')$$, 'VERSION_CHANGED');
select public.respond_to_service_record(current_setting('test.rec')::uuid, 2, 'approved') \g /dev/null

-- ---------------- İşletme A: tamamlar ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', false) \g /dev/null
\echo 'S14. Onaylanan kayıt tamamlanır; tamamlanan kayıt düzeltilince tamamlanmış kalır'
do $$ begin
  if (select approved_at from public.service_records where id = current_setting('test.rec')::uuid) is null then raise exception 'onay zamanı yok'; end if;
  if (select count(*) from public.service_approvals where record_id = current_setting('test.rec')::uuid) <> 2 then raise exception 'onay geçmişi eksik'; end if;
  perform public.complete_service_record(current_setting('test.rec')::uuid);
end $$;
-- Tamamlanan kayıt düzeltilebilir ve tamamlanmış kalır (20261124000001)
do $$ begin
  perform public.save_service_record(jsonb_build_object('id', current_setting('test.rec'), 'odometer_km', 1,
    'complaint', 'Sonradan değişiklik', 'items', jsonb_build_array(jsonb_build_object('title', 'Ek iş', 'labor_kurus', 50000))));
  if (select status from public.service_records where id = current_setting('test.rec')::uuid) <> 'completed' then raise exception 'düzeltme sonrası tamamlanmış kalmadı'; end if;
  if (select grand_kurus from public.service_records where id = current_setting('test.rec')::uuid) <> 50000 then raise exception 'düzeltilmiş tutar yanlış: %', (select grand_kurus from public.service_records where id = current_setting('test.rec')::uuid); end if;
  if (select completed_at from public.service_records where id = current_setting('test.rec')::uuid) is null then raise exception 'tamamlanma tarihi silindi'; end if;
end $$;

\echo 'S15. Storage: işletme kendi klasörüne yükler, başkasınınkine yükleyemez'
insert into storage.objects (bucket_id, name) values ('service-files', current_setting('test.biz_a') || '/' || current_setting('test.rec') || '/kabul-1.jpg');
insert into public.service_files (record_id, business_id, kind, storage_path, mime_type, size_bytes)
values (current_setting('test.rec')::uuid, current_setting('test.biz_a')::uuid, 'intake',
  current_setting('test.biz_a') || '/' || current_setting('test.rec') || '/kabul-1.jpg', 'image/jpeg', 120000);
select pg_temp.expect_error($$insert into public.service_files (record_id, business_id, kind, storage_path, mime_type, size_bytes)
  values (current_setting('test.rec')::uuid, current_setting('test.biz_a')::uuid, 'intake', current_setting('test.biz_a') || '/' || current_setting('test.rec') || '/x.exe', 'application/x-msdownload', 10)$$, 'check');
select pg_temp.expect_error($$insert into public.service_files (record_id, business_id, kind, storage_path, mime_type, size_bytes)
  values (current_setting('test.rec')::uuid, current_setting('test.biz_a')::uuid, 'intake', current_setting('test.biz_a') || '/' || current_setting('test.rec') || '/buyuk.jpg', 'image/jpeg', 20000000)$$, 'check');
select pg_temp.expect_error($$insert into public.service_files (record_id, business_id, kind, storage_path, mime_type, size_bytes)
  values (current_setting('test.rec')::uuid, current_setting('test.biz_a')::uuid, 'intake', 'baska/yol.jpg', 'image/jpeg', 10)$$, 'check');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', false) \g /dev/null
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('service-files', current_setting('test.biz_a') || '/' || current_setting('test.rec') || '/sahte.jpg')$$, 'row-level security');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('service-files', 'gecersiz/yol/sahte.jpg')$$, 'row-level security');
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'service-files') <> 0 then raise exception 'B, A''nın dosyasını görüyor'; end if;
  if (select count(*) from public.service_files) <> 0 then raise exception 'B, A''nın dosya kaydını görüyor'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', false) \g /dev/null
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'service-files') <> 1 then raise exception 'müşteri kendi kaydının fotoğrafını göremiyor'; end if;
  if jsonb_array_length(public.my_service_records()->0->'files') <> 1 then raise exception 'müşteri görünümünde dosya yok'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', false) \g /dev/null
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'service-files') <> 0 then raise exception 'ilgisiz kullanıcı fotoğrafı görüyor'; end if;
end $$;

\echo 'S16. KDV yuvarlama ve "KDV yok" (packages/core ile aynı)'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', false) \g /dev/null
do $$ declare v uuid; begin
  v := public.save_service_record(jsonb_build_object(
    'business_id', current_setting('test.biz_a'), 'customer_id', '50000000-0000-0000-0000-000000000001',
    'vehicle_id', '60000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(),
    'odometer_km', 149000, 'complaint', 'Küçük iş', 'vat_rate', 10,
    'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 125))));
  if (select vat_kurus from public.service_records where id = v) <> 13 then raise exception 'yuvarlama core ile farklı'; end if;
  v := public.save_service_record(jsonb_build_object(
    'business_id', current_setting('test.biz_a'), 'customer_id', '50000000-0000-0000-0000-000000000001',
    'vehicle_id', '60000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(),
    'odometer_km', 149000, 'complaint', 'Küçük iş',
    'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 12345))));
  if (select (vat_kurus, grand_kurus) from public.service_records where id = v) <> (0::bigint, 12345::bigint) then raise exception 'KDV yok hesabı yanlış'; end if;
end $$;

\echo 'S17. İşletme sınırı: bir kullanıcı en fazla 3 işletme açar'
do $$ begin
  perform public.create_business('İkinci', 'Ali Usta', '+905321112233', null, 'İstanbul', 'Kartal', 'Sanayi Sitesi 6', 'tire', null, null);
  perform public.create_business('Üçüncü', 'Ali Usta', '+905321112233', null, 'İstanbul', 'Kartal', 'Sanayi Sitesi 7', 'tire', null, null);
end $$;
select pg_temp.expect_error($$select public.create_business('Dördüncü', 'Ali Usta', '+905321112233', null, 'İstanbul', 'Kartal', 'Sanayi Sitesi 8', 'tire', null, null)$$, 'BUSINESS_LIMIT');

\echo 'S18. Askıya alınan işletme yeni kayıt açamaz'
reset role;
update public.businesses set status = 'suspended' where id = current_setting('test.biz_a')::uuid;
select pg_temp.expect_error($$delete from public.service_records$$, 'DELETE_FORBIDDEN');
set role authenticated;
select pg_temp.expect_error($$select public.save_service_record(jsonb_build_object('business_id', current_setting('test.biz_a'),
  'customer_id', '50000000-0000-0000-0000-000000000001', 'vehicle_id', '60000000-0000-0000-0000-000000000001',
  'client_request_id', gen_random_uuid(), 'odometer_km', 1, 'complaint', 'Yeni iş', 'items', jsonb_build_array(jsonb_build_object('title', 'İş'))))$$, 'BUSINESS_SUSPENDED');
select pg_temp.expect_error($$insert into public.business_customers (business_id, full_name, phone)
  values (current_setting('test.biz_a')::uuid, 'Yeni Müşteri', '+905330000001')$$, 'BUSINESS_SUSPENDED');

\echo 'S19. Anonim kullanıcı hiçbir işletme verisine erişemez'
reset role;
set role anon;
select pg_temp.expect_error($$select * from public.service_records$$, 'permission denied');
select pg_temp.expect_error($$select public.my_service_records()$$, 'permission denied');
reset role;

\echo 'TÜM PISTON SERVİS TESTLERİ GEÇTİ'
