-- Plaka + telefon eşleşmesi testleri. Kendi kullanıcı ve işletmelerini oluşturur.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a8', 'esles.isletme@example.test'),
  ('00000000-0000-0000-0000-0000000000b8', 'esles.sahip@example.test'),
  ('00000000-0000-0000-0000-0000000000c8', 'esles.yabanci@example.test');

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

\echo 'E2. Araç sahibi: telefonu ve aracı yokken kayıt görünmez'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b8') \g /dev/null
do $$ begin if pg_temp.mine() <> 0 then raise exception 'telefon/araç yokken kayıt göründü'; end if; end $$;

\echo 'E3. Yalnızca telefon yetmez; yalnızca plaka yetmez'
update public.profiles set phone = '+905330008888' where id = auth.uid();
do $$ begin if pg_temp.mine() <> 0 then raise exception 'yalnızca telefonla göründü'; end if; end $$;
update public.profiles set phone = null where id = auth.uid();
insert into public.vehicles (make, model, model_year, fuel_type, transmission, odometer_km, plate)
values ('Fiat', 'Egea', 2019, 'diesel', 'manual', 1000, '42 AB 123');
do $$ begin if pg_temp.mine() <> 0 then raise exception 'yalnızca plakayla göründü'; end if; end $$;

\echo 'E4. Plaka + telefon birlikte tutunca kayıt görünür; araç sahibi kaydı yanıtlayabilir'
update public.profiles set phone = '+905330008888' where id = auth.uid();
do $$ begin
  if pg_temp.mine() <> 1 then raise exception 'plaka + telefonla görünmedi'; end if;
  perform public.respond_to_service_record(current_setting('test.r')::uuid, 1, 'approved');
end $$;

\echo 'E5. Araç arşivlenince kayıt görünmez'
update public.vehicles set archived_at = now() where owner_id = auth.uid();
do $$ begin if pg_temp.mine() <> 0 then raise exception 'arşivlenen araçla göründü'; end if; end $$;

\echo 'E6. Yabancı: aynı plakayı ekler ama telefonu farklı → göremez; geçersiz telefon reddedilir'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c8') \g /dev/null
insert into public.vehicles (make, model, model_year, fuel_type, transmission, odometer_km, plate)
values ('Fiat', 'Egea', 2019, 'diesel', 'manual', 1000, '42 AB 123');
update public.profiles set phone = '+905339999999' where id = auth.uid();
do $$ begin
  if pg_temp.mine() <> 0 then raise exception 'yabancı kaydı gördü'; end if;
end $$;
select pg_temp.expect_error($$select public.business_service_record(current_setting('test.r')::uuid)$$, 'FORBIDDEN');
select pg_temp.expect_error($$update public.profiles set phone = '05330008888' where id = auth.uid()$$, 'check');
select pg_temp.expect_error($$update public.profiles set plan = 'plus' where id = auth.uid()$$, 'permission denied');
reset role;
