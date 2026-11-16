-- Onaysız tamamlama ve kayıt silme testleri. Kendi kullanıcı ve işletmelerini oluşturur.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a4', 'silme.a@example.test'),
  ('00000000-0000-0000-0000-0000000000c4', 'silme.tek@example.test'),
  ('00000000-0000-0000-0000-0000000000e4', 'silme.musteri@example.test');

create or replace function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
declare failed boolean := false; msg text;
begin
  begin
    execute sql;
  exception when others then
    failed := true;
    msg := sqlerrm;
  end;
  if not failed then raise exception 'BEKLENEN HATA OLUŞMADI: %', sql; end if;
  if position(needle in msg) = 0 then raise exception 'YANLIŞ HATA: % → % (beklenen içerik: %)', sql, msg, needle; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', false) \g /dev/null

\echo 'D1. Hazırlık: işletme, müşteri, araç ve iki açık kayıt'
do $$ declare b uuid; r1 uuid; r2 uuid; begin
  b := public.create_business('Silme Oto', 'Can Silme', '+905321113344', null, 'Ankara', 'Çankaya', 'Sanayi 3. Sokak No 5', 'mechanic', null, null);
  perform set_config('test.biz', b::text, false);
  insert into public.business_customers (id, business_id, full_name, phone, email)
  values ('52000000-0000-0000-0000-000000000001', b, 'Silme Müşteri', '+905330009988', 'silme.musteri@example.test');
  insert into public.business_vehicles (id, business_id, customer_id, plate, make, model)
  values ('62000000-0000-0000-0000-000000000001', b, '52000000-0000-0000-0000-000000000001', '06 SL 100', 'Renault', 'Clio');
  r1 := public.save_service_record(jsonb_build_object('business_id', b, 'customer_id', '52000000-0000-0000-0000-000000000001',
    'vehicle_id', '62000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(), 'odometer_km', 1000,
    'complaint', 'Bakım', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 50000))));
  r2 := public.save_service_record(jsonb_build_object('business_id', b, 'customer_id', '52000000-0000-0000-0000-000000000001',
    'vehicle_id', '62000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(), 'odometer_km', 1200,
    'complaint', 'Fren', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 30000))));
  perform set_config('test.r1', r1::text, false);
  perform set_config('test.r2', r2::text, false);
end $$;

\echo 'D2. Müşteri onayı olmadan: ücret alınır, kayıt tamamlanır; ikinci kez tamamlanmaz'
do $$ begin
  perform public.add_service_payment(current_setting('test.r1')::uuid, 50000, 'cash', null, null, gen_random_uuid());
  perform public.complete_service_record(current_setting('test.r1')::uuid);
  if (select status from public.service_records where id = current_setting('test.r1')::uuid) <> 'completed' then raise exception 'tamamlanmadı'; end if;
  if (select completed_at from public.service_records where id = current_setting('test.r1')::uuid) is null then raise exception 'tamamlanma zamanı yok'; end if;
end $$;
select pg_temp.expect_error($$select public.complete_service_record(current_setting('test.r1')::uuid)$$, 'STATUS_INVALID');

\echo 'D3. Ödemesi olan kayıt silinemez; ödeme iptal edilince silinir'
select pg_temp.expect_error($$select public.delete_service_record(current_setting('test.r1')::uuid, 'Yanlış kayıt')$$, 'HAS_PAYMENTS');
do $$ declare p uuid; begin
  select id into p from public.service_payments where record_id = current_setting('test.r1')::uuid;
  perform public.void_service_payment(p, 'Kayıt silinecek');
  perform public.delete_service_record(current_setting('test.r1')::uuid, 'Yanlış kayıt');
  if (select deleted_at from public.service_records where id = current_setting('test.r1')::uuid) is null then raise exception 'silinmedi'; end if;
  if (select delete_reason from public.service_records where id = current_setting('test.r1')::uuid) <> 'Yanlış kayıt' then raise exception 'sebep yok'; end if;
  -- Aynı istek ikinci kez hata vermez
  perform public.delete_service_record(current_setting('test.r1')::uuid, null);
end $$;

\echo 'D4. Silinen kayıt değiştirilemez, ödeme/dosya alamaz, tamamlanamaz; satır denetim için saklanır'
do $$ begin perform public.delete_service_record(current_setting('test.r2')::uuid, null); end $$;
select pg_temp.expect_error($$select public.save_service_record(jsonb_build_object('id', current_setting('test.r2'), 'odometer_km', 1,
  'complaint', 'Sonradan değişiklik', 'items', jsonb_build_array(jsonb_build_object('title', 'Ek iş'))))$$, 'RECORD_DELETED');
select pg_temp.expect_error($$select public.complete_service_record(current_setting('test.r2')::uuid)$$, 'RECORD_DELETED');
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.r2')::uuid, 100, 'cash', null, null, gen_random_uuid())$$, 'RECORD_DELETED');
do $$ begin
  if (select count(*) from public.service_records where business_id = current_setting('test.biz')::uuid) <> 2 then raise exception 'satır fiziksel olarak silinmiş'; end if;
  if (select count(*) from public.audit_logs where row_id = current_setting('test.r2')::uuid and action = 'UPDATE' and new_values->>'deleted_at' is not null) <> 1 then
    raise exception 'silme denetime yazılmadı';
  end if;
end $$;

\echo 'D5. Müşteri silinen kayıtları görmez'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}', false) \g /dev/null
do $$ begin
  if jsonb_array_length(public.my_service_records()) <> 0 then raise exception 'müşteri silinen kaydı görüyor'; end if;
end $$;

\echo 'D6. Teknisyen kayıt silemez'
reset role;
insert into public.business_members (business_id, user_id, role) values (current_setting('test.biz')::uuid, '00000000-0000-0000-0000-0000000000c4', 'technician');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', false) \g /dev/null
do $$ declare r uuid; begin
  r := public.save_service_record(jsonb_build_object('business_id', current_setting('test.biz')::uuid, 'customer_id', '52000000-0000-0000-0000-000000000001',
    'vehicle_id', '62000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(), 'odometer_km', 1300,
    'complaint', 'Yağ', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 10000))));
  perform set_config('test.r3', r::text, false);
end $$;
select pg_temp.expect_error($$select public.delete_service_record(current_setting('test.r3')::uuid, null)$$, 'FORBIDDEN');
reset role;
