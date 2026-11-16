-- Tahsilat ve alacak testleri. Kendi kullanıcı ve işletmelerini oluşturur.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'kasa.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'kasa.b@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'borclu@example.test');

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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', false) \g /dev/null

\echo 'T1. Hazırlık: işletme, müşteri, araç ve 1.000 ₺ servis kaydı'
do $$ declare b uuid; r uuid; begin
  b := public.create_business('Kasa Oto', 'Ali Kasa', '+905321110000', null, 'İzmir', 'Bornova', 'Sanayi 1. Sokak No 3', 'mechanic', null, null);
  perform set_config('test.biz', b::text, false);
  insert into public.business_customers (id, business_id, full_name, phone, email)
  values ('51000000-0000-0000-0000-000000000001', b, 'Borçlu Müşteri', '+905330001122', 'borclu@example.test');
  insert into public.business_vehicles (id, business_id, customer_id, plate, make, model)
  values ('61000000-0000-0000-0000-000000000001', b, '51000000-0000-0000-0000-000000000001', '35 KS 100', 'Fiat', 'Egea');
  r := public.save_service_record(jsonb_build_object('business_id', b, 'customer_id', '51000000-0000-0000-0000-000000000001',
    'vehicle_id', '61000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(), 'odometer_km', 1000,
    'complaint', 'Bakım', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 100000))));
  perform set_config('test.rec', r::text, false);
end $$;

\echo 'T2. Kısmi ödeme alınır; aynı istek iki kez ödeme açmaz'
do $$ declare p1 uuid; p2 uuid; begin
  p1 := public.add_service_payment(current_setting('test.rec')::uuid, 40000, 'cash', null, 'Peşinat', '81000000-0000-0000-0000-000000000001');
  p2 := public.add_service_payment(current_setting('test.rec')::uuid, 40000, 'cash', null, 'Peşinat', '81000000-0000-0000-0000-000000000001');
  if p1 <> p2 then raise exception 'mükerrer ödeme açıldı'; end if;
  if (select count(*) from public.service_payments) <> 1 then raise exception 'ödeme sayısı yanlış'; end if;
  perform set_config('test.pay', p1::text, false);
end $$;

\echo 'T3. Kalan borçtan fazla ödeme, sıfır/negatif tutar ve ileri tarih reddedilir'
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.rec')::uuid, 60001, 'card', null, null, gen_random_uuid())$$, 'OVERPAYMENT');
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.rec')::uuid, 0, 'card', null, null, gen_random_uuid())$$, 'OVERPAYMENT');
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.rec')::uuid, -5, 'card', null, null, gen_random_uuid())$$, 'OVERPAYMENT');
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.rec')::uuid, 100, 'card', now() + interval '2 days', null, gen_random_uuid())$$, 'PAID_AT_FUTURE');

\echo 'T4. Ödeme tabloya doğrudan yazılamaz, değiştirilemez, silinemez'
select pg_temp.expect_error($$insert into public.service_payments (record_id, business_id, amount_kurus, method, client_request_id)
  values (current_setting('test.rec')::uuid, current_setting('test.biz')::uuid, 1, 'cash', gen_random_uuid())$$, 'permission denied');
select pg_temp.expect_error($$update public.service_payments set amount_kurus = 1$$, 'permission denied');
select pg_temp.expect_error($$delete from public.service_payments$$, 'permission denied');

\echo 'T5. Yanlış ödeme sebebiyle iptal edilir; iptal edilen tutar yeniden alınabilir'
select pg_temp.expect_error($$select public.void_service_payment(current_setting('test.pay')::uuid, '')$$, 'REASON_REQUIRED');
select public.void_service_payment(current_setting('test.pay')::uuid, 'Yanlış tutar') \g /dev/null
select pg_temp.expect_error($$select public.void_service_payment(current_setting('test.pay')::uuid, 'Tekrar')$$, 'ALREADY_VOIDED');
do $$ begin
  perform public.add_service_payment(current_setting('test.rec')::uuid, 100000, 'transfer', null, null, gen_random_uuid());
  if (select count(*) from public.audit_logs where table_name = 'service_payments') < 3 then raise exception 'ödeme denetime yazılmadı'; end if;
end $$;
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.rec')::uuid, 1, 'cash', null, null, gen_random_uuid())$$, 'OVERPAYMENT');

-- ---------------- Başka işletme ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', false) \g /dev/null
\echo 'T6. Başka işletme ödemeleri göremez, ekleyemez, iptal edemez'
do $$ begin
  if (select count(*) from public.service_payments) <> 0 then raise exception 'B ödemeleri görüyor'; end if;
end $$;
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.rec')::uuid, 1, 'cash', null, null, gen_random_uuid())$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.void_service_payment(current_setting('test.pay')::uuid, 'Sızma')$$, 'FORBIDDEN');

-- ---------------- Müşteri ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', false) \g /dev/null
\echo 'T7. Müşteri kendi kaydındaki ödemeleri görür, ödeme ekleyemez'
do $$ declare j jsonb; begin
  j := public.my_service_records();
  if jsonb_array_length(j->0->'payments') <> 2 then raise exception 'müşteri ödemeleri görmüyor: %', j->0->'payments'; end if;
  if (select count(*) from public.service_payments) <> 0 then raise exception 'müşteri tabloyu doğrudan okuyor'; end if;
end $$;
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.rec')::uuid, 1, 'cash', null, null, gen_random_uuid())$$, 'FORBIDDEN');

reset role;
\echo 'T8. Teknisyen rolü ödeme alamaz (izin tablosu)'
insert into public.business_members (business_id, user_id, role) values (current_setting('test.biz')::uuid, '00000000-0000-0000-0000-0000000000b2', 'technician');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', false) \g /dev/null
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.rec')::uuid, 1, 'cash', null, null, gen_random_uuid())$$, 'FORBIDDEN');
do $$ begin
  if (select count(*) from public.service_payments) <> 2 then raise exception 'teknisyen ödemeleri göremiyor'; end if;
end $$;
reset role;

\echo 'TÜM TAHSİLAT TESTLERİ GEÇTİ'
