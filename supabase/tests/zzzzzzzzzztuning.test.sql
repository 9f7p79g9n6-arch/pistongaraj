-- Tuning kategorisi: tuning işletmesi açılır, rehberde süzülür ve tuning teklif talebi ona gider.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000097a', 'tuning.isletme@example.test'),
  ('00000000-0000-0000-0000-00000000097b', 'tuning.yonetici@example.test'),
  ('00000000-0000-0000-0000-00000000097c', 'tuning.musteri@example.test');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000097b', 'admin');

create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

set role authenticated;

\echo 'T1. Tuning işletmesi açılır, doğrulanınca rehberde "tuning" süzgecinde görünür ve talebi alır'
do $$ declare b uuid; q uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000097a');
  b := public.create_business('Hız Tuning', 'Usta Tuning', '+905321110071', null, 'Kocaeli', 'İzmit', 'Sanayi 7. Sokak No 1', 'tuning', null, null);
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000097b');
  perform public.admin_set_business_status(b, 'active');
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000097c');
  if jsonb_array_length(public.public_businesses('Kocaeli', 'tuning')) <> 1 then raise exception 'tuning süzgeci yanlış'; end if;
  if jsonb_array_length(public.public_businesses('Kocaeli', 'mechanic')) <> 0 then raise exception 'tuning mekanikte görünüyor'; end if;
  q := public.create_quote_request(jsonb_build_object('kind', 'service', 'category', 'tuning', 'city', 'Kocaeli', 'vehicle_label', 'Honda Civic 2020',
    'title', 'Yazılım ve egzoz', 'description', 'Stage 1 yazılım fiyatı', 'client_request_id', gen_random_uuid()));
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000097a');
  if not exists (select 1 from jsonb_array_elements(public.business_quote_requests(b)) x where (x->>'id')::uuid = q) then
    raise exception 'tuning talebi işletmeye gitmedi';
  end if;
end $$;

reset role;
