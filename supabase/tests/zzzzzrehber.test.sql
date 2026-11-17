-- Rehber, teklif talepleri, yorumlar ve yönetici testleri. Kendi kullanıcı ve işletmelerini oluşturur.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a9', 'rehber.servis@example.test'),
  ('00000000-0000-0000-0000-0000000000b9', 'rehber.parca@example.test'),
  ('00000000-0000-0000-0000-0000000000d9', 'rehber.yonetici@example.test'),
  ('00000000-0000-0000-0000-0000000000e9', 'rehber.musteri@example.test'),
  ('00000000-0000-0000-0000-0000000000f9', 'rehber.yabanci@example.test');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000d9', 'admin');

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

\echo 'R1. Hazırlık: Konya ilinde mekanik servis ve yedek parçacı (ikisi de doğrulama bekliyor)'
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
  perform set_config('test.s', public.create_business('Rehber Servis', 'Usta Servis', '+905321110091', null, 'Konya', 'Selçuklu', 'Sanayi 1. Sokak No 9', 'mechanic', null, null)::text, false);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b9');
  perform set_config('test.p', public.create_business('Rehber Parça', 'Usta Parça', '+905321110092', null, 'konya', 'Karatay', 'Sanayi 2. Sokak No 9', 'spare_parts', null, null)::text, false);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e9');
  update public.profiles set phone = '+905330009999' where id = auth.uid();
end $$;

\echo 'R2. Doğrulanmamış işletme rehberde görünmez; yönetici olmayan yönetici işlemi yapamaz; yönetici doğrular'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e9') \g /dev/null
do $$ begin if jsonb_array_length(public.public_businesses('Konya')) <> 0 then raise exception 'doğrulanmamış işletme rehberde'; end if; end $$;
select pg_temp.expect_error($$select public.admin_businesses(null)$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.admin_set_business_status(current_setting('test.s')::uuid, 'active')$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.public_business(current_setting('test.s')::uuid)$$, 'NOT_FOUND');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d9') \g /dev/null
do $$ begin
  if jsonb_array_length(public.admin_businesses('pending_verification')) < 2 then raise exception 'yönetici bekleyenleri görmüyor'; end if;
  perform public.admin_set_business_status(current_setting('test.s')::uuid, 'active');
  perform public.admin_set_business_status(current_setting('test.p')::uuid, 'active');
end $$;
select pg_temp.expect_error($$select public.admin_set_business_status(current_setting('test.s')::uuid, 'incomplete')$$, 'STATUS_INVALID');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e9') \g /dev/null
do $$ begin
  if jsonb_array_length(public.public_businesses('KONYA')) <> 2 then raise exception 'rehber sayısı yanlış'; end if;
  if jsonb_array_length(public.public_businesses('Konya', 'mechanic')) <> 1 then raise exception 'kategori süzgeci yanlış'; end if;
  if jsonb_array_length(public.public_businesses(null, null, 'parça')) <> 1 then raise exception 'arama yanlış'; end if;
  if (public.public_business(current_setting('test.s')::uuid)->>'phone') <> '+905321110091' then raise exception 'işletme sayfası açılmadı'; end if;
end $$;

\echo 'R3. Talep: servis talebi mekaniğe, parça talebi yedek parçacıya gider; işletme yoksa ve 5ten fazla seçimde reddedilir'
do $$ declare s uuid; p uuid; begin
  s := public.create_quote_request(jsonb_build_object('kind', 'service', 'category', 'mechanic', 'city', 'Konya', 'vehicle_label', 'Fiat Egea 2019',
    'title', 'Frenden ses geliyor', 'description', 'Sabah soğukken', 'client_request_id', 'a1000000-0000-0000-0000-000000000001'));
  if s <> public.create_quote_request(jsonb_build_object('kind', 'service', 'city', 'Konya', 'vehicle_label', 'x', 'title', 'aynı istek', 'client_request_id', 'a1000000-0000-0000-0000-000000000001')) then
    raise exception 'mükerrer talep açıldı';
  end if;
  p := public.create_quote_request(jsonb_build_object('kind', 'part', 'city', 'Konya', 'vehicle_label', 'Fiat Egea 2019',
    'title', 'Ön balata takımı', 'part_name', 'Ön balata', 'client_request_id', gen_random_uuid()));
  perform set_config('test.qs', s::text, false);
  perform set_config('test.qp', p::text, false);
  if (public.my_quote_requests()->0->>'target_count')::int <> 1 then raise exception 'hedef sayısı yanlış'; end if;
end $$;
select pg_temp.expect_error($$select public.create_quote_request(jsonb_build_object('kind', 'service', 'category', 'mechanic', 'city', 'Van', 'vehicle_label', 'Fiat Egea', 'title', 'Van''da servis', 'client_request_id', gen_random_uuid()))$$, 'NO_BUSINESS');
select pg_temp.expect_error($$select public.create_quote_request(jsonb_build_object('kind', 'service', 'city', 'Konya', 'vehicle_label', 'Fiat Egea', 'title', 'Çok seçim', 'client_request_id', gen_random_uuid(),
  'business_ids', jsonb_build_array(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid())))$$, 'TOO_MANY_TARGETS');

\echo 'R4. İşletme yalnızca kendine gelen talebi görür ve teklif verir; müşteri telefonu kabulden önce görünmez'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9') \g /dev/null
do $$ declare j jsonb; begin
  j := public.business_quote_requests(current_setting('test.s')::uuid);
  if jsonb_array_length(j) <> 1 or (j->0->>'title') <> 'Frenden ses geliyor' then raise exception 'servis talebi gelmedi'; end if;
  if j->0->>'customer_phone' is not null then raise exception 'telefon kabulden önce göründü'; end if;
  perform public.submit_quote_offer(jsonb_build_object('business_id', current_setting('test.s'), 'request_id', current_setting('test.qs'), 'parts_kurus', 150000, 'labor_kurus', 60000, 'eta', 'Aynı gün'));
  perform public.submit_quote_offer(jsonb_build_object('business_id', current_setting('test.s'), 'request_id', current_setting('test.qs'), 'parts_kurus', 140000, 'labor_kurus', 60000, 'eta', 'Aynı gün'));
end $$;
select pg_temp.expect_error($$select public.submit_quote_offer(jsonb_build_object('business_id', current_setting('test.s'), 'request_id', current_setting('test.qp'), 'parts_kurus', 1000))$$, 'NOT_FOUND');
select pg_temp.expect_error($$select public.business_quote_requests(current_setting('test.p')::uuid)$$, 'FORBIDDEN');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9') \g /dev/null
select pg_temp.expect_error($$select public.submit_quote_offer(jsonb_build_object('business_id', current_setting('test.p'), 'request_id', current_setting('test.qp'), 'parts_kurus', 90000))$$, 'PART_CONDITION_REQUIRED');
select public.submit_quote_offer(jsonb_build_object('business_id', current_setting('test.p'), 'request_id', current_setting('test.qp'), 'parts_kurus', 90000, 'part_condition', 'equivalent')) \g /dev/null

\echo 'R5. Müşteri teklifleri görür ve kabul eder; kabul edilen işletme telefonu görür; kabulden sonra teklif değişmez'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f9') \g /dev/null
do $$ begin if jsonb_array_length(public.my_quote_requests()) <> 0 then raise exception 'yabancı başkasının talebini görüyor'; end if; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e9') \g /dev/null
do $$ declare q jsonb; begin
  select x into q from jsonb_array_elements(public.my_quote_requests()) x where x->>'id' = current_setting('test.qs');
  if jsonb_array_length(q->'offers') <> 1 or (q->'offers'->0->>'total_kurus')::int <> 200000 then raise exception 'teklif yanlış: %', q->'offers'; end if;
  perform set_config('test.offer', q->'offers'->0->>'id', false);
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f9') \g /dev/null
select pg_temp.expect_error($$select public.accept_quote_offer(current_setting('test.offer')::uuid)$$, 'FORBIDDEN');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e9') \g /dev/null
select public.accept_quote_offer(current_setting('test.offer')::uuid) \g /dev/null
select pg_temp.expect_error($$select public.accept_quote_offer(current_setting('test.offer')::uuid)$$, 'STATUS_INVALID');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9') \g /dev/null
do $$ declare j jsonb; begin
  j := public.business_quote_requests(current_setting('test.s')::uuid);
  if (j->0->>'accepted_mine')::boolean is not true or (j->0->>'customer_phone') <> '+905330009999' then raise exception 'kabul sonrası telefon görünmedi'; end if;
end $$;
select pg_temp.expect_error($$select public.submit_quote_offer(jsonb_build_object('business_id', current_setting('test.s'), 'request_id', current_setting('test.qs'), 'labor_kurus', 1))$$, 'STATUS_INVALID');

\echo 'R6. Yorum: yalnızca tamamlanan kaydın müşterisi, kayıt başına bir kez; ortalama rehberde görünür'
do $$ declare r uuid; r2 uuid; b uuid := current_setting('test.s')::uuid; begin
  insert into public.business_customers (id, business_id, full_name, phone, email)
  values ('59000000-0000-0000-0000-000000000001', b, 'Rehber Müşteri', '+905330009999', 'rehber.musteri@example.test');
  insert into public.business_vehicles (id, business_id, customer_id, plate, make, model)
  values ('69000000-0000-0000-0000-000000000001', b, '59000000-0000-0000-0000-000000000001', '42 RH 09', 'Fiat', 'Egea');
  r := public.save_service_record(jsonb_build_object('business_id', b, 'customer_id', '59000000-0000-0000-0000-000000000001',
    'vehicle_id', '69000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(), 'odometer_km', 1000,
    'complaint', 'Fren', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 60000))));
  r2 := public.save_service_record(jsonb_build_object('business_id', b, 'customer_id', '59000000-0000-0000-0000-000000000001',
    'vehicle_id', '69000000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(), 'odometer_km', 1100,
    'complaint', 'Yağ', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 30000))));
  perform public.complete_service_record(r);
  perform set_config('test.rec', r::text, false);
  perform set_config('test.rec2', r2::text, false);
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f9') \g /dev/null
select pg_temp.expect_error($$select public.add_business_review(current_setting('test.rec')::uuid, 1, 'kötü')$$, 'FORBIDDEN');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e9') \g /dev/null
select pg_temp.expect_error($$select public.add_business_review(current_setting('test.rec2')::uuid, 5, null)$$, 'NOT_COMPLETED');
select pg_temp.expect_error($$select public.add_business_review(current_setting('test.rec')::uuid, 6, null)$$, 'RATING_INVALID');
do $$ declare j jsonb; begin
  perform public.add_business_review(current_setting('test.rec')::uuid, 3, 'İyi');
  perform public.add_business_review(current_setting('test.rec')::uuid, 5, 'Çok iyi, hızlı');
  j := public.public_business(current_setting('test.s')::uuid);
  if (j->>'rating_count')::int <> 1 or (j->>'rating_avg')::numeric <> 5 then raise exception 'yorum ortalaması yanlış: %', j; end if;
  if (j->'reviews'->0->>'comment') <> 'Çok iyi, hızlı' then raise exception 'yorum güncellenmedi'; end if;
  if (public.my_review_for_record(current_setting('test.rec')::uuid)->>'rating')::int <> 5 then raise exception 'kendi yorumu okunamadı'; end if;
end $$;

\echo 'R7. Yönetici askıya alınca rehberden çıkar; şikâyetleri görür ve içeriği kaldırır'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9') \g /dev/null
select set_config('test.post', public.create_forum_post(jsonb_build_object('business_id', current_setting('test.s'), 'category', 'genel', 'title', 'Şikâyet edilecek konu', 'client_request_id', gen_random_uuid()))::text, false) \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9') \g /dev/null
select public.report_forum_content(current_setting('test.p')::uuid, current_setting('test.post')::uuid, null, 'Reklam') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d9') \g /dev/null
do $$ declare j jsonb; begin
  select x into j from jsonb_array_elements(public.admin_forum_reports()) x where x->>'post_id' = current_setting('test.post');
  if j is null or (j->>'report_count')::int <> 1 or (j->'reasons'->>0) <> 'Reklam' or (j->>'deleted')::boolean then raise exception 'şikâyet listesi yanlış: %', j; end if;
  perform public.admin_remove_forum_content(current_setting('test.post')::uuid, null);
  select x into j from jsonb_array_elements(public.admin_forum_reports()) x where x->>'post_id' = current_setting('test.post');
  if (j->>'deleted')::boolean is not true then raise exception 'içerik kaldırılmadı'; end if;
  perform public.admin_set_business_status(current_setting('test.s')::uuid, 'suspended');
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e9') \g /dev/null
do $$ begin if jsonb_array_length(public.public_businesses('Konya')) <> 1 then raise exception 'askıdaki işletme rehberde'; end if; end $$;
select pg_temp.expect_error($$select public.admin_forum_reports()$$, 'FORBIDDEN');

\echo 'R8. Tablolara doğrudan erişim yok'
select pg_temp.expect_error($$select count(*) from public.quote_requests$$, 'permission denied');
select pg_temp.expect_error($$select count(*) from public.business_reviews$$, 'permission denied');
select pg_temp.expect_error($$insert into public.quote_offers (request_id, business_id, labor_kurus) values (current_setting('test.qs')::uuid, current_setting('test.s')::uuid, 1)$$, 'permission denied');
reset role;
