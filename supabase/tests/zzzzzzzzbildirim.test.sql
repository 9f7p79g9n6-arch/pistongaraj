-- Olay bildirimleri: doğru kişiye gider, kişi kendi işlemi için ve engellediğinden bildirim almaz.
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000006a1', 'bil.usta@example.test'),
  ('00000000-0000-0000-0000-0000000006b1', 'bil.musteri@example.test'),
  ('00000000-0000-0000-0000-0000000006c1', 'bil.takipci@example.test'),
  ('00000000-0000-0000-0000-0000000006d1', 'bil.yonetici@example.test');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000006d1', 'admin');
update public.profiles set display_name = 'Müşteri Ayşe' where id = '00000000-0000-0000-0000-0000000006b1';
update public.profiles set display_name = 'Takipçi Can' where id = '00000000-0000-0000-0000-0000000006c1';

create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
-- Test sayaçları sistem yetkisiyle okunur
create or replace function pg_temp.n(u text, k text) returns int language sql security definer as $$
  select count(*)::int from public.notifications where user_id = u::uuid and kind = k
$$;
grant execute on function pg_temp.n(text, text) to authenticated;
set role authenticated;

\echo 'N1. Servis kaydı: e-postası eşleşen müşteriye "yeni kayıt"; kaydı açan ustaya bildirim gitmez'
select pg_temp.as_user('00000000-0000-0000-0000-0000000006a1') \g /dev/null
do $$ declare b uuid; r uuid; begin
  b := public.create_business('Bildirim Oto', 'Usta Bildirim', '+905321110061', null, 'Konya', 'Meram', 'Sanayi 6. Sokak No 1', 'mechanic', null, null);
  perform set_config('test.b', b::text, false);
  insert into public.business_customers (id, business_id, full_name, phone, email)
  values ('56100000-0000-0000-0000-000000000001', b, 'Müşteri Ayşe', '+905330006161', 'bil.musteri@example.test');
  insert into public.business_vehicles (id, business_id, customer_id, plate, make, model)
  values ('66100000-0000-0000-0000-000000000001', b, '56100000-0000-0000-0000-000000000001', '42 BL 61', 'Fiat', 'Egea');
  r := public.save_service_record(jsonb_build_object('business_id', b, 'customer_id', '56100000-0000-0000-0000-000000000001',
    'vehicle_id', '66100000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(), 'odometer_km', 1000,
    'complaint', 'Bakım', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 100000))));
  perform set_config('test.r', r::text, false);
  if pg_temp.n('00000000-0000-0000-0000-0000000006b1', 'service_new') <> 1 then raise exception 'müşteriye yeni kayıt bildirimi gitmedi'; end if;
  if pg_temp.n('00000000-0000-0000-0000-0000000006a1', 'service_new') <> 0 then raise exception 'usta kendi kaydı için bildirim aldı'; end if;
end $$;

\echo 'N2. Müşteri itiraz eder → işletme sahibine bildirim; bildirim kendi bağlantısını taşır'
select pg_temp.as_user('00000000-0000-0000-0000-0000000006b1') \g /dev/null
select public.respond_to_service_record(current_setting('test.r')::uuid, 1, 'objected', 'Fiyat konuşulandan farklı') \g /dev/null
do $$ begin
  if pg_temp.n('00000000-0000-0000-0000-0000000006a1', 'service_objected') <> 1 then raise exception 'itiraz bildirimi gitmedi'; end if;
  if pg_temp.n('00000000-0000-0000-0000-0000000006b1', 'service_objected') <> 0 then raise exception 'müşteri kendi itirazı için bildirim aldı'; end if;
end $$;

\echo 'N3. Usta kaydı düzeltir → müşteriye "kayıt düzeltildi"'
select pg_temp.as_user('00000000-0000-0000-0000-0000000006a1') \g /dev/null
select public.save_service_record(jsonb_build_object('id', current_setting('test.r'), 'business_id', current_setting('test.b'),
  'customer_id', '56100000-0000-0000-0000-000000000001', 'vehicle_id', '66100000-0000-0000-0000-000000000001', 'client_request_id', gen_random_uuid(),
  'odometer_km', 1000, 'complaint', 'Bakım', 'items', jsonb_build_array(jsonb_build_object('title', 'İşçilik', 'labor_kurus', 80000)))) \g /dev/null
do $$ begin
  if pg_temp.n('00000000-0000-0000-0000-0000000006b1', 'service_revised') <> 1 then raise exception 'düzeltme bildirimi gitmedi'; end if;
end $$;

\echo 'N4. Teklif: talep işletmeye, teklif müşteriye, kabul işletmeye'
select pg_temp.as_user('00000000-0000-0000-0000-0000000006d1') \g /dev/null
select public.admin_set_business_status(current_setting('test.b')::uuid, 'active') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-0000000006b1') \g /dev/null
do $$ declare q uuid; begin
  q := public.create_quote_request(jsonb_build_object('kind', 'service', 'category', 'mechanic', 'city', 'Konya', 'vehicle_label', 'Fiat Egea 2019',
    'title', 'Frenden ses geliyor', 'client_request_id', gen_random_uuid()));
  perform set_config('test.q', q::text, false);
  if pg_temp.n('00000000-0000-0000-0000-0000000006a1', 'quote_request') <> 1 then raise exception 'talep bildirimi gitmedi'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006a1') \g /dev/null
select public.submit_quote_offer(jsonb_build_object('business_id', current_setting('test.b'), 'request_id', current_setting('test.q'), 'parts_kurus', 150000, 'labor_kurus', 60000)) \g /dev/null
do $$ begin
  if pg_temp.n('00000000-0000-0000-0000-0000000006b1', 'quote_offer') <> 1 then raise exception 'teklif bildirimi gitmedi'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006b1') \g /dev/null
do $$ declare o uuid; begin
  select (x->'offers'->0->>'id')::uuid into o from jsonb_array_elements(public.my_quote_requests()) x where x->>'id' = current_setting('test.q');
  perform public.accept_quote_offer(o);
end $$;
do $$ begin
  if pg_temp.n('00000000-0000-0000-0000-0000000006a1', 'quote_accepted') <> 1 then raise exception 'kabul bildirimi gitmedi'; end if;
end $$;

\echo 'N5. Topluluk: takip ve yorum bildirimi; engellenen kişiden bildirim gelmez'
select pg_temp.as_user('00000000-0000-0000-0000-0000000006c1') \g /dev/null
select public.follow_user('00000000-0000-0000-0000-0000000006b1', true) \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-0000000006b1') \g /dev/null
do $$ declare p uuid; begin
  p := public.create_social_post(jsonb_build_object('body', 'Egea yıkandı', 'client_request_id', gen_random_uuid()));
  perform set_config('test.p', p::text, false);
  if pg_temp.n('00000000-0000-0000-0000-0000000006b1', 'social_follow') <> 1 then raise exception 'takip bildirimi gitmedi'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006c1') \g /dev/null
select public.add_social_comment(jsonb_build_object('post_id', current_setting('test.p'), 'body', 'Güzel olmuş', 'client_request_id', gen_random_uuid())) \g /dev/null
do $$ begin
  if pg_temp.n('00000000-0000-0000-0000-0000000006b1', 'social_comment') <> 1 then raise exception 'yorum bildirimi gitmedi'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000006b1') \g /dev/null
select public.block_social_user('00000000-0000-0000-0000-0000000006c1', true) \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-0000000006c1') \g /dev/null
do $$ begin
  begin
    perform public.add_social_comment(jsonb_build_object('post_id', current_setting('test.p'), 'body', 'Tekrar yazıyorum', 'client_request_id', gen_random_uuid()));
  exception when others then null; -- engellenince yorum zaten reddedilebilir
  end;
  if pg_temp.n('00000000-0000-0000-0000-0000000006b1', 'social_comment') <> 1 then raise exception 'engellenen kişiden bildirim geldi'; end if;
end $$;

\echo 'N6. Kullanıcı yalnızca kendi bildirimlerini görür, hepsini okundu işaretler; tercihlerini değiştirir'
select pg_temp.as_user('00000000-0000-0000-0000-0000000006b1') \g /dev/null
do $$ begin
  if exists (select 1 from public.notifications where user_id <> auth.uid()) then raise exception 'başkasının bildirimi göründü'; end if;
  if (select count(*) from public.notifications where read_at is null) < 4 then raise exception 'okunmamış bildirimler eksik'; end if;
  perform public.mark_notifications_read();
  if exists (select 1 from public.notifications where read_at is null) then raise exception 'okundu işaretlenmedi'; end if;
  update public.profiles set notify_social = false where id = auth.uid();
  if public.notification_category('social_comment') <> 'social' or public.notification_category('quote_offer') <> 'quotes'
     or public.notification_category('maintenance_due') <> 'reminders' or public.notification_category('service_new') <> 'service' then
    raise exception 'kategori eşlemesi yanlış';
  end if;
end $$;
do $$ begin
  begin
    insert into public.notifications (user_id, kind, title) values (auth.uid(), 'x', 'sahte');
    raise exception 'kullanıcı kendine bildirim yazabildi';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'TÜM BİLDİRİM TESTLERİ GEÇTİ'
