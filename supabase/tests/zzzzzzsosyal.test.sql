-- Ana Sayfa (sosyal merkez) testleri: gönderi, soru, beğeni, yorum, en iyi yanıt, takip, grup, şikâyet, engelleme, yönetici.
\set ON_ERROR_STOP 1
\set QUIET 1

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000005a8', 'sosyal.ayse@example.test'),
  ('00000000-0000-0000-0000-0000000005b8', 'sosyal.mehmet@example.test'),
  ('00000000-0000-0000-0000-0000000005c8', 'sosyal.adsiz@example.test'),
  ('00000000-0000-0000-0000-0000000005d8', 'sosyal.sikayet1@example.test'),
  ('00000000-0000-0000-0000-0000000005e8', 'sosyal.sikayet2@example.test'),
  ('00000000-0000-0000-0000-0000000005f8', 'sosyal.yonetici@example.test');
update public.profiles set display_name = 'Ayşe' where id = '00000000-0000-0000-0000-0000000005a8';
update public.profiles set display_name = 'Mehmet' where id = '00000000-0000-0000-0000-0000000005b8';
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000005f8', 'admin');

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

\echo 'X1. Tablolara doğrudan erişim yok'
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005a8');
  perform pg_temp.expect_error('select * from public.social_posts', 'permission denied');
  perform pg_temp.expect_error('insert into public.social_likes (post_id, user_id) values (gen_random_uuid(), auth.uid())', 'permission denied');
end $$;

\echo 'X2. Adı olmayan kullanıcı gönderi açamaz'
do $$ begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005c8');
  perform pg_temp.expect_error($q$select public.create_social_post(jsonb_build_object('body', 'Merhaba', 'client_request_id', gen_random_uuid()))$q$, 'NAME_REQUIRED');
end $$;

\echo 'X3. Gönderi: fotoğraflı, gruba; başkasının klasöründeki dosya reddedilir; boş gönderi reddedilir'
do $$ declare v_g uuid; v_id uuid; v_req uuid := gen_random_uuid(); begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005a8');
  v_g := (select (x->>'id')::uuid from jsonb_array_elements(public.social_groups_list()) x where x->>'slug' = 'fiat');
  perform public.join_social_group(v_g, true);
  v_id := public.create_social_post(jsonb_build_object('body', 'Egea yıkandı', 'group_id', v_g, 'client_request_id', v_req,
    'media', jsonb_build_array(jsonb_build_object('kind', 'image', 'storage_path', '00000000-0000-0000-0000-0000000005a8/1.jpg',
      'mime_type', 'image/jpeg', 'size_bytes', 1000))));
  if public.create_social_post(jsonb_build_object('body', 'Egea yıkandı', 'client_request_id', v_req)) <> v_id then
    raise exception 'aynı istek iki gönderi açtı';
  end if;
  perform set_config('test.post', v_id::text, false);
  perform set_config('test.group', v_g::text, false);
  perform pg_temp.expect_error($q$select public.create_social_post(jsonb_build_object('client_request_id', gen_random_uuid(),
    'media', jsonb_build_array(jsonb_build_object('kind', 'image', 'storage_path', '00000000-0000-0000-0000-0000000005b8/x.jpg',
      'mime_type', 'image/jpeg', 'size_bytes', 1000))))$q$, 'MEDIA_PATH');
  perform pg_temp.expect_error($q$select public.create_social_post(jsonb_build_object('body', '  ', 'client_request_id', gen_random_uuid()))$q$, 'POST_EMPTY');
  perform pg_temp.expect_error($q$select public.create_social_post(jsonb_build_object('kind', 'question', 'body', 'Kısa?', 'client_request_id', gen_random_uuid()))$q$, 'QUESTION_SHORT');
  if jsonb_array_length(public.social_feed('groups', null, null, null, 30)) <> 1 then raise exception 'grup akışı yanlış'; end if;
end $$;

\echo 'X4. Beğeni ve yorum; takip akışı'
do $$ declare v_post uuid := current_setting('test.post')::uuid; v_feed jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005b8');
  if jsonb_array_length(public.social_feed('following', null, null, null, 30)) <> 0 then raise exception 'takip etmeden akış dolu'; end if;
  perform public.follow_user('00000000-0000-0000-0000-0000000005a8', true);
  v_feed := public.social_feed('following', null, null, null, 30);
  if jsonb_array_length(v_feed) <> 1 or v_feed->0->'author'->>'name' <> 'Ayşe' then raise exception 'takip akışı yanlış: %', v_feed; end if;
  if public.like_social_post(v_post, true) <> 1 then raise exception 'beğeni sayılmadı'; end if;
  if public.like_social_post(v_post, true) <> 1 then raise exception 'çift beğeni'; end if;
  if not (public.social_post(v_post)->>'liked')::boolean then raise exception 'beğendim görünmüyor'; end if;
  perform public.add_social_comment(jsonb_build_object('post_id', v_post, 'body', 'Çok temiz olmuş', 'client_request_id', gen_random_uuid()));
  if (public.social_post(v_post)->>'comment_count')::int <> 1 then raise exception 'yorum sayılmadı'; end if;
  perform pg_temp.expect_error('select public.follow_user(''00000000-0000-0000-0000-0000000005b8'', true)', 'FOLLOW_SELF');
  if (public.social_user('00000000-0000-0000-0000-0000000005a8')->>'follower_count')::int <> 1 then raise exception 'takipçi sayısı yanlış'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005a8');
  perform pg_temp.expect_error(format('select public.delete_social_comment(%L)',
    (select (c->>'id') from jsonb_array_elements(public.social_post(v_post)->'comments') c limit 1)), 'FORBIDDEN');
end $$;

\echo 'X5. Soru ve en iyi yanıt: yalnızca soruyu soran işaretler'
do $$ declare v_q uuid; v_c uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005b8');
  v_q := public.create_social_post(jsonb_build_object('kind', 'question', 'body', 'Clio 4 triger seti kaç km de değişir?', 'client_request_id', gen_random_uuid()));
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005a8');
  v_c := public.add_social_comment(jsonb_build_object('post_id', v_q, 'body', '120 bin km ya da 5 yıl', 'client_request_id', gen_random_uuid()));
  perform pg_temp.expect_error(format('select public.set_best_answer(%L, %L)', v_q, v_c), 'FORBIDDEN');
  if jsonb_array_length(public.social_feed('questions', null, null, null, 30)) <> 1 then raise exception 'sorular akışı yanlış'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005b8');
  perform public.set_best_answer(v_q, v_c);
  if (public.social_post(v_q)->'comments'->0->>'best')::boolean is not true then raise exception 'en iyi yanıt işaretlenmedi'; end if;
  perform set_config('test.question', v_q::text, false);
end $$;

\echo 'X6. Engelleme: iki taraf birbirini görmez, takip kalkar'
do $$ declare v_post uuid := current_setting('test.post')::uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005a8');
  perform public.block_social_user('00000000-0000-0000-0000-0000000005b8', true);
  if jsonb_array_length(public.social_feed('questions', null, null, null, 30)) <> 0 then raise exception 'engellenen görünüyor'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005b8');
  perform pg_temp.expect_error(format('select public.social_post(%L)', v_post), 'NOT_FOUND');
  if (public.social_user('00000000-0000-0000-0000-0000000005b8')->>'following_count')::int <> 0 then raise exception 'takip kalkmadı'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005a8');
  perform public.block_social_user('00000000-0000-0000-0000-0000000005b8', false);
end $$;

\echo 'X7. 3 farklı şikâyet gönderiyi gizler; yönetici görür ve kaldırır'
do $$ declare v_q uuid := current_setting('test.question')::uuid; v_r jsonb; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005a8');
  perform public.report_social_content(v_q, null, 'Uygunsuz');
  perform public.report_social_content(v_q, null, 'Uygunsuz');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005d8');
  perform public.report_social_content(v_q, null, null);
  if jsonb_array_length(public.social_feed('questions', null, null, null, 30)) <> 1 then raise exception '2 şikâyette gizlendi'; end if;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005e8');
  perform public.report_social_content(v_q, null, null);
  if jsonb_array_length(public.social_feed('questions', null, null, null, 30)) <> 0 then raise exception '3 şikâyette gizlenmedi'; end if;
  perform pg_temp.expect_error('select public.admin_social_reports()', 'FORBIDDEN');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005f8');
  v_r := public.admin_social_reports();
  if (v_r->0->>'report_count')::int <> 3 or v_r->0->>'author_name' <> 'Mehmet' then raise exception 'yönetici listesi yanlış: %', v_r; end if;
  perform public.admin_remove_social_content(v_q, null);
  if not (public.admin_social_reports()->0->>'deleted')::boolean then raise exception 'kaldırılmadı'; end if;
end $$;

\echo 'X8. Gönderiyi yalnızca sahibi siler'
do $$ declare v_post uuid := current_setting('test.post')::uuid; begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005b8');
  perform pg_temp.expect_error(format('select public.delete_social_post(%L)', v_post), 'FORBIDDEN');
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000005a8');
  perform public.delete_social_post(v_post);
  if jsonb_array_length(public.social_feed('all', null, '00000000-0000-0000-0000-0000000005a8', null, 30)) <> 0 then raise exception 'silinen görünüyor'; end if;
end $$;

reset role;
