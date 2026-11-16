-- Gider testleri. Kendi kullanıcı ve işletmelerini oluşturur.
-- (Dosya adı "z" ile başlar: diğer test dosyalarından sonra çalışsın, onların sayım beklentilerini bozmasın.)
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a3', 'gider.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'gider.b@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'teknisyen@example.test');

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
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', false) \g /dev/null

\echo 'G1. Gider eklenir; tarih verilmezse bugün olur; aynı istek iki kez gider açmaz'
do $$ declare b uuid; begin
  b := public.create_business('Gider Oto', 'Ayşe Gider', '+905321112299', null, 'Bursa', 'Nilüfer', 'Sanayi 2. Cadde No 9', 'tire', null, null);
  perform set_config('test.biz', b::text, false);
  insert into public.business_expenses (business_id, amount_kurus, description, client_request_id)
  values (b, 1500000, '  Kira  ', '91000000-0000-0000-0000-000000000001');
  insert into public.business_expenses (business_id, amount_kurus, spent_on, client_request_id)
  values (b, 25050, private.istanbul_today() - 3, '91000000-0000-0000-0000-000000000002');
  if (select spent_on from public.business_expenses where amount_kurus = 1500000) <> private.istanbul_today() then raise exception 'varsayılan tarih bugün değil'; end if;
  if (select description from public.business_expenses where amount_kurus = 1500000) <> 'Kira' then raise exception 'açıklama kırpılmadı'; end if;
  if (select description from public.business_expenses where amount_kurus = 25050) is not null then raise exception 'boş açıklama null olmalı'; end if;
end $$;
select pg_temp.expect_error($$insert into public.business_expenses (business_id, amount_kurus, client_request_id)
  values (current_setting('test.biz')::uuid, 1, '91000000-0000-0000-0000-000000000001')$$, 'duplicate key');

\echo 'G2. Hatalı gider reddedilir: sıfır/negatif tutar, ileri tarih, uzun açıklama'
select pg_temp.expect_error($$insert into public.business_expenses (business_id, amount_kurus, client_request_id) values (current_setting('test.biz')::uuid, 0, gen_random_uuid())$$, 'check');
select pg_temp.expect_error($$insert into public.business_expenses (business_id, amount_kurus, client_request_id) values (current_setting('test.biz')::uuid, -100, gen_random_uuid())$$, 'check');
select pg_temp.expect_error($$insert into public.business_expenses (business_id, amount_kurus, spent_on, client_request_id) values (current_setting('test.biz')::uuid, 100, private.istanbul_today() + 1, gen_random_uuid())$$, 'EXPENSE_DATE_FUTURE');
select pg_temp.expect_error($$insert into public.business_expenses (business_id, amount_kurus, description, client_request_id) values (current_setting('test.biz')::uuid, 100, repeat('x', 201), gen_random_uuid())$$, 'check');

\echo 'G3. Gider düzenlenir ve silinir; eski hâli denetim kaydında kalır'
do $$ declare v uuid; begin
  select id into v from public.business_expenses where amount_kurus = 25050;
  update public.business_expenses set amount_kurus = 30000, description = 'Elektrik' where id = v;
  if (select updated_by from public.business_expenses where id = v) <> auth.uid() then raise exception 'güncelleyen yazılmadı'; end if;
  delete from public.business_expenses where id = v;
  if exists (select 1 from public.business_expenses where id = v) then raise exception 'silinmedi'; end if;
  if (select count(*) from public.audit_logs where row_id = v) <> 3 then raise exception 'denetim kaydı eksik'; end if;
  if (select (old_values->>'amount_kurus')::bigint from public.audit_logs where row_id = v and action = 'DELETE') <> 30000 then raise exception 'silinen tutar denetimde yok'; end if;
end $$;
select pg_temp.expect_error($$update public.business_expenses set business_id = gen_random_uuid()$$, 'permission denied');
select pg_temp.expect_error($$update public.business_expenses set created_by = null$$, 'permission denied');

-- ---------------- Başka işletme ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', false) \g /dev/null
\echo 'G4. Başka işletme giderleri göremez, ekleyemez, değiştiremez, silemez'
do $$ begin
  if (select count(*) from public.business_expenses) <> 0 then raise exception 'B giderleri görüyor'; end if;
  update public.business_expenses set amount_kurus = 1;
  delete from public.business_expenses;
end $$;
select pg_temp.expect_error($$insert into public.business_expenses (business_id, amount_kurus, client_request_id) values (current_setting('test.biz')::uuid, 100, gen_random_uuid())$$, 'row-level security');

reset role;
\echo 'G5. Teknisyen işletmenin giderlerini göremez'
insert into public.business_members (business_id, user_id, role) values (current_setting('test.biz')::uuid, '00000000-0000-0000-0000-0000000000c3', 'technician');
do $$ begin
  if (select amount_kurus from public.business_expenses where description = 'Kira') <> 1500000 then raise exception 'B kirayı değiştirmiş'; end if;
  if (select count(*) from public.business_expenses) <> 1 then raise exception 'B gider silmiş'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', false) \g /dev/null
do $$ begin
  if (select count(*) from public.business_expenses) <> 0 then raise exception 'teknisyen giderleri görüyor'; end if;
end $$;
reset role;

\echo 'TÜM GİDER TESTLERİ GEÇTİ'
