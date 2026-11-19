-- Kullanım koşulları onayı: kullanıcı kendi onayını ekler ve okur, başkasınınkini göremez, değiştiremez.
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000fa', 'kosul.a@example.test'),
  ('00000000-0000-0000-0000-0000000000fb', 'kosul.b@example.test');
create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
set role authenticated;

\echo 'T1. Kullanıcı koşulları onaylar ve onayını okur'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000fa') \g /dev/null
insert into public.consents (consent, granted, text_version) values ('terms', true, '2026-11-v2');
do $$ begin
  if not exists (select 1 from public.consents where consent = 'terms' and text_version = '2026-11-v2' and granted) then
    raise exception 'onay okunamadı'; end if;
end $$;

\echo 'T2. Başka kullanıcı bu onayı görmez; onay güncellenemez, silinemez'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000fb') \g /dev/null
do $$ begin
  if exists (select 1 from public.consents where consent = 'terms') then raise exception 'başkasının onayı göründü'; end if;
end $$;
do $$ begin
  begin
    update public.consents set granted = false;
    raise exception 'güncelleme engellenmedi';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'TÜM KOŞUL ONAYI TESTLERİ GEÇTİ'
