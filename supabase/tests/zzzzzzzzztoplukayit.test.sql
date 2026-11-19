-- Toplu servis kaydı getirme: yetki ve sonuç
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000007a1', 'toplu.isletme@example.test'),
  ('00000000-0000-0000-0000-0000000007b1', 'toplu.yabanci@example.test');
create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
set role authenticated;

\echo 'T1. İşletme üç kaydını tek çağrıda, en yeniden eskiye alır; sınır ve sayfalama çalışır'
do $$ declare b uuid; c uuid; v uuid; i int; j jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000007a1');
  b := public.create_business('Toplu Oto', 'Usta Toplu', '+905321110071', null, 'Bursa', 'Nilüfer', 'Sanayi 1', 'mechanic', null, null);
  insert into public.business_customers (business_id, full_name, phone) values (b, 'Müşteri', '+905330007777') returning id into c;
  insert into public.business_vehicles (business_id, customer_id, plate, make, model) values (b, c, '16 TT 100', 'Renault', 'Clio') returning id into v;
  for i in 1..3 loop
    perform public.save_service_record(jsonb_build_object('business_id', b, 'customer_id', c, 'vehicle_id', v,
      'client_request_id', gen_random_uuid(), 'odometer_km', 1000 * i, 'complaint', 'İş ' || i,
      'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 10000 * i))));
  end loop;
  perform set_config('test.b', b::text, false);
end $$;
-- Aynı işlemde eklenen kayıtların zamanı eşittir; sıralamayı sınamak için zamanları ayır
reset role;
update public.service_records set created_at = now() - (interval '1 minute' * (4 - odometer_km / 1000))
 where business_id = current_setting('test.b')::uuid;
set role authenticated;
do $$ declare b uuid := current_setting('test.b')::uuid; j jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000007a1');
  j := public.business_service_records(b);
  if jsonb_array_length(j) <> 3 then raise exception 'üç kayıt bekleniyordu: %', jsonb_array_length(j); end if;
  if (j->0->>'complaint') <> 'İş 3' then raise exception 'sıralama yanlış: %', j->0->>'complaint'; end if;
  if j->0->'items' is null or j->0->>'grand_kurus' is null then raise exception 'tek kayıt görünümüyle aynı alanlar yok'; end if;
  if jsonb_array_length(public.business_service_records(b, 2)) <> 2 then raise exception 'sınır çalışmadı'; end if;
  if jsonb_array_length(public.business_service_records(b, 200, (j->1->>'created_at')::timestamptz)) <> 1 then raise exception 'sayfalama çalışmadı'; end if;
end $$;

\echo 'T2. Başka kullanıcı işletmenin kayıtlarını alamaz'
select pg_temp.as_user('00000000-0000-0000-0000-0000000007b1') \g /dev/null
do $$ begin
  begin
    perform public.business_service_records(current_setting('test.b')::uuid);
    raise exception 'yabancı kayıtları aldı';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'TÜM TOPLU KAYIT TESTLERİ GEÇTİ'
