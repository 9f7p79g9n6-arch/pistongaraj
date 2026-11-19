-- Servis kaydının araç sahibine bağlanması (kayıt kodu) testleri. Kendi kullanıcı ve işletmelerini oluşturur.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a8', 'esles.isletme@example.test'),
  ('00000000-0000-0000-0000-0000000000b8', 'esles.sahip@example.test'),
  ('00000000-0000-0000-0000-0000000000c8', 'esles.yabanci@example.test'),
  ('00000000-0000-0000-0000-0000000000d8', 'esles.tahminci@example.test');

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
create or replace function pg_temp.claim(c text) returns text language sql as $$ select public.claim_service_record(c)->>'status' $$;
grant execute on function pg_temp.claim(text) to authenticated;
create or replace function pg_temp.mine() returns int language sql as $$ select jsonb_array_length(public.my_service_records()) $$;
grant execute on function pg_temp.mine() to authenticated;

set role authenticated;

\echo 'E1. Hazırlık: işletme, e-postasız müşteri (telefon +905330008888), plakası 42 AB 123 olan araç ve kayıt'
do $$ declare b uuid; r uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a8');
  b := public.create_business('Eşleşme Oto', 'Usta Eşleşme', '+905321110081', null, 'Konya', 'Karatay', 'Sanayi 8. Sokak No 3', 'mechanic', null, null);
  insert into public.business_customers (id, business_id, full_name, phone, email)
  values ('58000000-0000-0000-0000-000000000001', b, 'Araç Sahibi', '+905330008888', null);
  insert into public.business_vehicles (id, business_id, customer_id, plate, make, model)
  values ('68000000-0000-0000-0000-000000000001', b, '58000000-0000-0000-0000-000000000001', '42 AB 123', 'Fiat', 'Egea');
  r := public.save_service_record(jsonb_build_object('business_id', b, 'customer_id', '58000000-0000-0000-0000-000000000001',
    'vehicle_id', '68000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(), 'odometer_km', 1000,
    'complaint', 'Bakım', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 100000))));
  perform set_config('test.r', r::text, false);
end $$;

\echo 'K2. Telefon + plaka artık yetmez (SMS doğrulaması yok): bilen biri kaydı göremez'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b8') \g /dev/null
update public.profiles set phone = '+905330008888' where id = auth.uid();
insert into public.vehicles (make, model, model_year, fuel_type, transmission, odometer_km, plate)
values ('Fiat', 'Egea', 2019, 'diesel', 'manual', 1000, '42 AB 123');
do $$ begin if pg_temp.mine() <> 0 then raise exception 'telefon + plakayla kayıt göründü'; end if; end $$;
select pg_temp.expect_error($$select public.respond_to_service_record(current_setting('test.r')::uuid, 1, 'approved')$$, '');

\echo 'K3. Kodu yalnızca kaydın işletmesi alır; aynı çağrı aynı kodu verir'
select pg_temp.expect_error($$select public.service_record_claim_code(current_setting('test.r')::uuid)$$, 'FORBIDDEN');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a8') \g /dev/null
do $$ declare c1 text; c2 text; begin
  c1 := public.service_record_claim_code(current_setting('test.r')::uuid);
  c2 := public.service_record_claim_code(current_setting('test.r')::uuid);
  if c1 !~ '^[A-HJ-NP-Z2-9]{8}$' then raise exception 'kod biçimi yanlış: %', c1; end if;
  if c1 <> c2 then raise exception 'kod her çağrıda değişti'; end if;
  if public.service_record_claimed(current_setting('test.r')::uuid) then raise exception 'kullanılmamış kod kullanılmış görünüyor'; end if;
  perform set_config('test.code', c1, false);
end $$;

\echo 'K4. Yanlış kod reddedilir; 10 yanlış denemeden sonra doğru kod da reddedilir (tahmin engeli)'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d8') \g /dev/null
do $$ declare i int; begin
  for i in 1..10 loop
    if pg_temp.claim('AAAA' || lpad(i::text, 4, '2')) <> 'invalid' then raise exception 'yanlış kod kabul edildi'; end if;
  end loop;
  if pg_temp.claim(current_setting('test.code')) <> 'rate_limited' then raise exception 'deneme sınırı çalışmadı'; end if;
  if pg_temp.mine() <> 0 then raise exception 'sınırdayken kayıt bağlandı'; end if;
end $$;

\echo 'K5. Araç sahibi kodu girer (küçük harf, tire, boşluk olsa da): kayıt görünür ve yanıtlanabilir'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b8') \g /dev/null
do $$ declare c text := current_setting('test.code'); begin
  if pg_temp.claim(lower(substr(c, 1, 4)) || ' - ' || lower(substr(c, 5))) <> 'claimed' then raise exception 'doğru kod bağlanmadı'; end if;
  if pg_temp.claim(c) <> 'already_mine' then raise exception 'ikinci giriş farklı sonuç verdi'; end if;
  if pg_temp.mine() <> 1 then raise exception 'kodla bağlanan kayıt görünmedi'; end if;
  perform public.respond_to_service_record(current_setting('test.r')::uuid, 1, 'approved');
end $$;

\echo 'K6. Aynı kodu başka hesap kullanamaz'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c8') \g /dev/null
do $$ begin
  if pg_temp.claim(current_setting('test.code')) <> 'already_claimed' then raise exception 'kullanılmış kod başka hesaba bağlandı'; end if;
  if pg_temp.mine() <> 0 then raise exception 'yabancı kaydı gördü'; end if;
end $$;
select pg_temp.expect_error($$select public.business_service_record(current_setting('test.r')::uuid)$$, 'FORBIDDEN');

\echo 'K7. İşletme kodu sıfırlar: eski kod geçersiz, bağlı hesap çıkarılır'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a8') \g /dev/null
do $$ declare n text; begin
  if not public.service_record_claimed(current_setting('test.r')::uuid) then raise exception 'bağlı hesap görünmedi'; end if;
  n := public.reset_service_record_claim(current_setting('test.r')::uuid);
  if n = current_setting('test.code') then raise exception 'sıfırlamada kod değişmedi'; end if;
  perform set_config('test.code2', n, false);
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b8') \g /dev/null
do $$ begin
  if pg_temp.mine() <> 0 then raise exception 'sıfırlamadan sonra kayıt hâlâ görünüyor'; end if;
  if pg_temp.claim(current_setting('test.code')) <> 'invalid' then raise exception 'eski kod hâlâ geçerli'; end if;
  if pg_temp.claim(current_setting('test.code2')) <> 'claimed' then raise exception 'yeni kod çalışmadı'; end if;
end $$;

\echo 'K8. Tablolara doğrudan erişim yok; geçersiz telefon reddedilir; plan değiştirilemez'
select pg_temp.expect_error($$select * from public.service_record_owners$$, 'permission denied');
select pg_temp.expect_error($$insert into public.service_record_owners (record_id, user_id) values (current_setting('test.r')::uuid, auth.uid())$$, 'permission denied');
select pg_temp.expect_error($$select * from private.service_record_codes$$, 'permission denied');
select pg_temp.expect_error($$update public.profiles set phone = '05330008888' where id = auth.uid()$$, 'check');
select pg_temp.expect_error($$update public.profiles set plan = 'plus' where id = auth.uid()$$, 'permission denied');
reset role;
\echo 'TÜM KAYIT KODU TESTLERİ GEÇTİ'
