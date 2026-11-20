-- İşletme konumu: yalnızca işletmeyi yöneten kaydeder, rehberde görünür, geçersiz konum reddedilir.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000098a', 'konum.isletme@example.test'),
  ('00000000-0000-0000-0000-00000000098b', 'konum.yonetici@example.test'),
  ('00000000-0000-0000-0000-00000000098c', 'konum.yabanci@example.test');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000098b', 'admin');

create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

create temp table konum_ids (b uuid);
grant all on konum_ids to authenticated;

set role authenticated;

\echo 'K1. Sahip konumu kaydeder, rehberde görünür'
do $$ declare b uuid; j jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000098a');
  b := public.create_business('Konum Oto', 'Usta Konum', '+905321110081', null, 'Ankara', 'Çankaya', 'Sanayi 1. Cadde No 2', 'mechanic', null, null);
  insert into konum_ids values (b);
  update public.businesses set latitude = 39.9208, longitude = 32.8541 where id = b;
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000098b');
  perform public.admin_set_business_status(b, 'active');
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000098c');
  j := public.public_business(b);
  if (j->>'latitude')::float8 <> 39.9208 or (j->>'longitude')::float8 <> 32.8541 then raise exception 'konum rehberde yok: %', j; end if;
end $$;

\echo 'K2. Yabancı başkasının işletme konumunu değiştiremez'
do $$ declare b uuid := (select b from konum_ids); n int; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000098c');
  update public.businesses set latitude = 41.0, longitude = 29.0 where id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'yabancı konumu değiştirdi'; end if;
end $$;

\echo 'K3. Yarım ya da Türkiye dışı konum reddedilir; konum kaldırılabilir'
do $$ declare b uuid := (select b from konum_ids); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000098a');
  begin
    update public.businesses set latitude = 40.0, longitude = null where id = b;
    raise exception 'yarım konum kabul edildi';
  exception when check_violation then null; end;
  begin
    update public.businesses set latitude = 51.5, longitude = -0.12 where id = b;
    raise exception 'yurt dışı konum kabul edildi';
  exception when check_violation then null; end;
  update public.businesses set latitude = null, longitude = null where id = b;
  if (select latitude from public.businesses where id = b) is not null then raise exception 'konum kaldırılamadı'; end if;
end $$;

reset role;
