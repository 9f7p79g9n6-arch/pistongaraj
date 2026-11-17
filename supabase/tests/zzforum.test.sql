-- Usta Forumu testleri. Kendi kullanıcı ve işletmelerini oluşturur.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a6', 'forum.a@example.test'),
  ('00000000-0000-0000-0000-0000000000b6', 'forum.b@example.test'),
  ('00000000-0000-0000-0000-0000000000c6', 'forum.c@example.test'),
  ('00000000-0000-0000-0000-0000000000d6', 'forum.d@example.test'),
  ('00000000-0000-0000-0000-0000000000e6', 'forum.bireysel@example.test');

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

\echo 'F1. Hazırlık: dört işletme (A, B, C, D) ve işletmesi olmayan bir kullanıcı'
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
  perform set_config('test.a', public.create_business('Forum Oto A', 'Usta A', '+905321110061', null, 'Konya', 'Selçuklu', 'Sanayi 1. Sokak No 1', 'mechanic', null, null)::text, false);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  perform set_config('test.b', public.create_business('Forum Oto B', 'Usta B', '+905321110062', null, 'Bursa', 'Osmangazi', 'Sanayi 2. Sokak No 2', 'mechanic', null, null)::text, false);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c6');
  perform set_config('test.c', public.create_business('Forum Oto C', 'Usta C', '+905321110063', null, 'İzmir', 'Bornova', 'Sanayi 3. Sokak No 3', 'mechanic', null, null)::text, false);
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d6');
  perform set_config('test.d', public.create_business('Forum Oto D', 'Usta D', '+905321110064', null, 'Ankara', 'Yenimahalle', 'Sanayi 4. Sokak No 4', 'mechanic', null, null)::text, false);
end $$;

\echo 'F2. A fotoğraflı konu açar; aynı istek iki kez konu açmaz'
do $$ declare p1 uuid; p2 uuid; a text := current_setting('test.a'); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
  p1 := public.create_forum_post(jsonb_build_object('business_id', a, 'category', 'ariza', 'title', '  Egea frenden ses geliyor  ',
    'body', 'Balata yeni, disk ölçüde. Fikri olan?', 'client_request_id', 'f1000000-0000-0000-0000-000000000001',
    'media', jsonb_build_array(
      jsonb_build_object('kind', 'image', 'storage_path', a || '/1.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 200000),
      jsonb_build_object('kind', 'image', 'storage_path', a || '/2.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 300000))));
  p2 := public.create_forum_post(jsonb_build_object('business_id', a, 'category', 'ariza', 'title', 'Egea frenden ses geliyor',
    'client_request_id', 'f1000000-0000-0000-0000-000000000001'));
  if p1 <> p2 then raise exception 'mükerrer konu açıldı'; end if;
  perform set_config('test.post', p1::text, false);
  if (public.forum_post(p1)->>'title') <> 'Egea frenden ses geliyor' then raise exception 'başlık kırpılmadı'; end if;
  if jsonb_array_length(public.forum_post(p1)->'media') <> 2 then raise exception 'ekler yazılmadı'; end if;
  if (public.forum_post(p1)->>'mine')::boolean is not true then raise exception 'kendi gönderisi işaretlenmedi'; end if;
end $$;

\echo 'F3. Kurallar: 5 fotoğraf, fotoğraf+video, uzun video, başka işletmenin klasörü, kısa başlık reddedilir'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6') \g /dev/null
select pg_temp.expect_error($$select public.create_forum_post(jsonb_build_object('business_id', current_setting('test.a'), 'category', 'genel',
  'title', 'Beş fotoğraf denemesi', 'client_request_id', gen_random_uuid(), 'media', (select jsonb_agg(jsonb_build_object('kind', 'image',
  'storage_path', current_setting('test.a') || '/x' || i || '.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 100)) from generate_series(1, 5) i)))$$, 'MEDIA_LIMIT');
select pg_temp.expect_error($$select public.create_forum_post(jsonb_build_object('business_id', current_setting('test.a'), 'category', 'genel',
  'title', 'Karışık ek denemesi', 'client_request_id', gen_random_uuid(), 'media', jsonb_build_array(
  jsonb_build_object('kind', 'image', 'storage_path', current_setting('test.a') || '/k1.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 100),
  jsonb_build_object('kind', 'video', 'storage_path', current_setting('test.a') || '/k2.mp4', 'mime_type', 'video/mp4', 'size_bytes', 100, 'duration_sec', 10))))$$, 'MEDIA_LIMIT');
select pg_temp.expect_error($$select public.create_forum_post(jsonb_build_object('business_id', current_setting('test.a'), 'category', 'genel',
  'title', 'Uzun video denemesi', 'client_request_id', gen_random_uuid(), 'media', jsonb_build_array(
  jsonb_build_object('kind', 'video', 'storage_path', current_setting('test.a') || '/uzun.mp4', 'mime_type', 'video/mp4', 'size_bytes', 100, 'duration_sec', 90))))$$, 'check');
select pg_temp.expect_error($$select public.create_forum_post(jsonb_build_object('business_id', current_setting('test.a'), 'category', 'genel',
  'title', 'Başkasının dosyası', 'client_request_id', gen_random_uuid(), 'media', jsonb_build_array(
  jsonb_build_object('kind', 'image', 'storage_path', current_setting('test.b') || '/x.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 100))))$$, 'MEDIA_PATH');
select pg_temp.expect_error($$select public.create_forum_post(jsonb_build_object('business_id', current_setting('test.a'), 'category', 'genel',
  'title', 'Kısa', 'client_request_id', gen_random_uuid()))$$, 'check');
select pg_temp.expect_error($$select public.create_forum_post(jsonb_build_object('business_id', current_setting('test.b'), 'category', 'genel',
  'title', 'Başka işletme adına', 'client_request_id', gen_random_uuid()))$$, 'FORBIDDEN');
-- Kurala uyan video kabul edilir
select public.create_forum_post(jsonb_build_object('business_id', current_setting('test.a'), 'category', 'motor',
  'title', 'Motor sesi videosu', 'client_request_id', gen_random_uuid(), 'media', jsonb_build_array(
  jsonb_build_object('kind', 'video', 'storage_path', current_setting('test.a') || '/motor.mp4', 'mime_type', 'video/mp4', 'size_bytes', 9000000, 'duration_sec', 42)))) \g /dev/null

\echo 'F4. B konuyu görür ve yanıtlar; yanıt sayısı ve son hareket güncellenir; boş yanıt reddedilir'
do $$ declare c uuid; before timestamptz; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  if jsonb_array_length(public.forum_feed()) <> 2 then raise exception 'akış sayısı yanlış: %', jsonb_array_length(public.forum_feed()); end if;
  if jsonb_array_length(public.forum_feed('motor')) <> 1 then raise exception 'kategori süzgeci çalışmıyor'; end if;
  before := (public.forum_post(current_setting('test.post')::uuid)->>'last_activity_at')::timestamptz;
  c := public.add_forum_comment(jsonb_build_object('business_id', current_setting('test.b'), 'post_id', current_setting('test.post'),
    'body', 'Kaliper pimlerini gresle, toz lastiğine bak.', 'client_request_id', gen_random_uuid()));
  perform set_config('test.comment', c::text, false);
  if (public.forum_post(current_setting('test.post')::uuid)->>'comment_count')::int <> 1 then raise exception 'yanıt sayısı artmadı'; end if;
  if (public.forum_post(current_setting('test.post')::uuid)->>'last_activity_at')::timestamptz < before then raise exception 'son hareket güncellenmedi'; end if;
  if (public.forum_post(current_setting('test.post')::uuid)->'comments'->0->'author'->>'business_name') <> 'Forum Oto B' then raise exception 'yanıt yazarı yanlış'; end if;
end $$;
select pg_temp.expect_error($$select public.add_forum_comment(jsonb_build_object('business_id', current_setting('test.b'), 'post_id', current_setting('test.post'),
  'body', '   ', 'client_request_id', gen_random_uuid()))$$, 'COMMENT_EMPTY');

\echo 'F5. İşletmesi olmayan kullanıcı forumu göremez; tablolara doğrudan erişim yok'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e6') \g /dev/null
select pg_temp.expect_error($$select public.forum_feed()$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.forum_post(current_setting('test.post')::uuid)$$, 'FORBIDDEN');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b6') \g /dev/null
select pg_temp.expect_error($$select count(*) from public.forum_posts$$, 'permission denied');
select pg_temp.expect_error($$insert into public.forum_posts (business_id, category, title, client_request_id) values (current_setting('test.b')::uuid, 'genel', 'Doğrudan yazma', gen_random_uuid())$$, 'permission denied');

\echo 'F6. Başkasının gönderisi silinemez, çözüldü işaretlenemez; kendi yanıtı silinince sayı düşer'
select pg_temp.expect_error($$select public.delete_forum_post(current_setting('test.post')::uuid)$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.set_forum_post_solved(current_setting('test.post')::uuid, true)$$, 'FORBIDDEN');
do $$ begin
  perform public.delete_forum_comment(current_setting('test.comment')::uuid);
  if (public.forum_post(current_setting('test.post')::uuid)->>'comment_count')::int <> 0 then raise exception 'yanıt sayısı düşmedi'; end if;
  if jsonb_array_length(public.forum_post(current_setting('test.post')::uuid)->'comments') <> 0 then raise exception 'silinen yanıt görünüyor'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
  perform public.set_forum_post_solved(current_setting('test.post')::uuid, true);
  if (public.forum_post(current_setting('test.post')::uuid)->>'solved')::boolean is not true then raise exception 'çözüldü işaretlenmedi'; end if;
end $$;

\echo 'F7. Engelleme: B, A işletmesini engelleyince onun gönderilerini görmez; kendini engelleyemez'
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  perform public.block_forum_business(current_setting('test.a')::uuid, true);
  if jsonb_array_length(public.forum_feed()) <> 0 then raise exception 'engellenen işletme görünüyor'; end if;
  perform public.block_forum_business(current_setting('test.a')::uuid, false);
  if jsonb_array_length(public.forum_feed()) <> 2 then raise exception 'engel kaldırılamadı'; end if;
end $$;
select pg_temp.expect_error($$select public.block_forum_business(current_setting('test.b')::uuid, true)$$, 'BLOCK_SELF');

\echo 'F8. Şikâyet: 3 farklı işletmeden şikâyet alan gönderi herkesten gizlenir; aynı kişi iki kez sayılmaz'
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
  perform public.report_forum_content(current_setting('test.b')::uuid, current_setting('test.post')::uuid, null, 'Uygunsuz');
  perform public.report_forum_content(current_setting('test.b')::uuid, current_setting('test.post')::uuid, null, 'Tekrar');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000c6');
  perform public.report_forum_content(current_setting('test.c')::uuid, current_setting('test.post')::uuid, null, null);
  if jsonb_array_length(public.forum_feed()) <> 2 then raise exception '2 şikâyette gizlenmemeli'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000d6');
  perform public.report_forum_content(current_setting('test.d')::uuid, current_setting('test.post')::uuid, null, null);
  if jsonb_array_length(public.forum_feed()) <> 1 then raise exception '3 şikâyette gizlenmeli'; end if;
end $$;
select pg_temp.expect_error($$select public.forum_post(current_setting('test.post')::uuid)$$, 'NOT_FOUND');

\echo 'F9. Storage: işletme kendi forum klasörüne yükler, başkasınınkine yükleyemez; işletmesi olmayan okuyamaz'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6') \g /dev/null
insert into storage.objects (bucket_id, name) values ('forum-media', current_setting('test.a') || '/foto-1.jpg');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('forum-media', current_setting('test.b') || '/sizma.jpg')$$, 'row-level security');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e6') \g /dev/null
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'forum-media') <> 0 then raise exception 'bireysel kullanıcı forum dosyasını görüyor'; end if;
end $$;

\echo 'F10. Kendi gönderisini silen işletme: gönderi akıştan çıkar, satır denetim için kalır'
do $$ declare v uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
  select (e->>'id')::uuid into v from jsonb_array_elements(public.forum_feed()) e limit 1;
  perform public.delete_forum_post(v);
  if jsonb_array_length(public.forum_feed()) <> 0 then raise exception 'silinen gönderi görünüyor'; end if;
  reset role;
  if (select deleted_at from public.forum_posts where id = v) is null then raise exception 'satır silinmiş ya da işaretlenmemiş'; end if;
end $$;
reset role;
