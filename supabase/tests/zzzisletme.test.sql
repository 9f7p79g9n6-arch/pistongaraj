-- İşletme silme testleri. Kendi kullanıcı ve işletmelerini oluşturur.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'sil.sahip@example.test'),
  ('00000000-0000-0000-0000-0000000000b7', 'sil.baska@example.test'),
  ('00000000-0000-0000-0000-0000000000c7', 'sil.teknisyen@example.test'),
  ('00000000-0000-0000-0000-0000000000e7', 'sil.musteri@example.test');

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
create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

set role authenticated;

\echo 'I1. Hazırlık: silinecek işletme (müşteri, kayıt, ödeme, forum) ve başka bir işletme'
do $$ declare a uuid; b uuid; r uuid; p uuid; q uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b7');
  b := public.create_business('Kalan Oto', 'Usta Kalan', '+905321110072', null, 'Bursa', 'Nilüfer', 'Sanayi 7. Sokak No 2', 'mechanic', null, null);
  q := public.create_forum_post(jsonb_build_object('business_id', b, 'category', 'genel', 'title', 'Kalan işletmenin konusu', 'client_request_id', gen_random_uuid()));
  perform set_config('test.b', b::text, false);
  perform set_config('test.q', q::text, false);

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
  a := public.create_business('Test Oto Servis', 'Usta Sahip', '+905321110071', null, 'Konya', 'Selçuklu', 'Sanayi 1. Sokak No 5', 'mechanic', null, null);
  perform set_config('test.a', a::text, false);
  insert into public.business_customers (id, business_id, full_name, phone, email)
  values ('57000000-0000-0000-0000-000000000001', a, 'Silinecek Müşteri', '+905330007777', 'sil.musteri@example.test');
  insert into public.business_vehicles (id, business_id, customer_id, plate, make, model)
  values ('67000000-0000-0000-0000-000000000001', a, '57000000-0000-0000-0000-000000000001', '42 SL 07', 'Fiat', 'Egea');
  r := public.save_service_record(jsonb_build_object('business_id', a, 'customer_id', '57000000-0000-0000-0000-000000000001',
    'vehicle_id', '67000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(), 'odometer_km', 1000,
    'complaint', 'Bakım', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 100000))));
  perform public.add_service_payment(r, 40000, 'cash', null, null, gen_random_uuid());
  perform set_config('test.r', r::text, false);
  p := public.create_forum_post(jsonb_build_object('business_id', a, 'category', 'genel', 'title', 'Silinecek işletmenin konusu', 'client_request_id', gen_random_uuid()));
  perform public.add_forum_comment(jsonb_build_object('business_id', a, 'post_id', q, 'body', 'Silinecek yanıt', 'client_request_id', gen_random_uuid()));
end $$;
reset role;
insert into public.business_members (business_id, user_id, role) values (current_setting('test.a')::uuid, '00000000-0000-0000-0000-0000000000c7', 'technician');
set role authenticated;

\echo 'I2. Yanlış ad yazılırsa ve sahip olmayan silmeye çalışırsa reddedilir'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c7') \g /dev/null
select pg_temp.expect_error($$select public.delete_business(current_setting('test.a')::uuid, 'Test Oto Servis')$$, 'FORBIDDEN');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b7') \g /dev/null
select pg_temp.expect_error($$select public.delete_business(current_setting('test.a')::uuid, 'Test Oto Servis')$$, 'FORBIDDEN');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7') \g /dev/null
select pg_temp.expect_error($$select public.delete_business(current_setting('test.a')::uuid, 'Test Oto')$$, 'NAME_MISMATCH');

\echo 'I3. Sahip adı yazarak siler (büyük/küçük harf ve boşluk önemsiz); işletmenin verilerine erişim kapanır'
do $$ begin
  perform public.delete_business(current_setting('test.a')::uuid, '  test oto servis ');
  if (select count(*) from public.businesses where id = current_setting('test.a')::uuid) <> 0 then raise exception 'silinen işletme görünüyor'; end if;
  if (select count(*) from public.service_records) <> 0 then raise exception 'kayıtlar görünüyor'; end if;
  if (select count(*) from public.business_customers) <> 0 then raise exception 'müşteriler görünüyor'; end if;
  if (select count(*) from public.service_payments) <> 0 then raise exception 'ödemeler görünüyor'; end if;
end $$;
select pg_temp.expect_error($$select public.add_service_payment(current_setting('test.r')::uuid, 100, 'cash', null, null, gen_random_uuid())$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.business_service_record(current_setting('test.r')::uuid)$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.delete_business(current_setting('test.a')::uuid, 'Test Oto Servis')$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.forum_feed()$$, 'FORBIDDEN');

\echo 'I4. Satırlar silinmez (yasal saklama); silinen işletme 3 işletme sınırına sayılmaz'
reset role;
do $$ begin
  if (select deleted_at from public.businesses where id = current_setting('test.a')::uuid) is null then raise exception 'silindi işareti yok'; end if;
  if (select count(*) from public.service_records where id = current_setting('test.r')::uuid) <> 1 then raise exception 'kayıt fiziksel silinmiş'; end if;
end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7') \g /dev/null
do $$ declare i int; begin
  for i in 1..3 loop
    perform public.create_business('Yeni Oto ' || i, 'Usta Sahip', '+90532111008' || i, null, 'Konya', 'Meram', 'Sanayi 9. Sokak No 1', 'mechanic', null, null);
  end loop;
end $$;
select pg_temp.expect_error($$select public.create_business('Dördüncü Oto', 'Usta Sahip', '+905321110089', null, 'Konya', 'Meram', 'Sanayi 9. Sokak No 1', 'mechanic', null, null)$$, 'BUSINESS_LIMIT');

\echo 'I5. Müşteri silinen işletmenin kaydını görmez; forumda işletmenin konu ve yanıtları kalkar'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e7') \g /dev/null
do $$ begin
  if jsonb_array_length(public.my_service_records()) <> 0 then raise exception 'müşteri silinen işletmenin kaydını görüyor'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b7') \g /dev/null
do $$ begin
  if jsonb_array_length(public.forum_feed()) <> 1 then raise exception 'silinen işletmenin konusu görünüyor'; end if;
  if (public.forum_post(current_setting('test.q')::uuid)->>'comment_count')::int <> 0 then raise exception 'yanıt sayısı düzeltilmedi'; end if;
  if jsonb_array_length(public.forum_post(current_setting('test.q')::uuid)->'comments') <> 0 then raise exception 'silinen işletmenin yanıtı görünüyor'; end if;
end $$;
reset role;
