-- OTOM Ana Sayfa: araç sahiplerinin sosyal merkezi (1. aşama).
--   * Gönderi: aracının fotoğrafı ya da videosu + açıklama. Soru: "Soru sor" ile açılan gönderi; yanıtlar yorum olarak gelir,
--     soruyu soran en iyi yanıtı işaretler.
--   * Beğeni, yorum, takip, marka grupları (katıl/ayrıl, gruba gönderi).
--   * Hikâye ve özel mesaj 2. aşamadadır (bu dosyada yok).
--   * Her oturum açmış kullanıcı okur. Yazmak için profilde görünen ad gerekir (NAME_REQUIRED).
--   * Tablolara doğrudan erişim yok; her okuma/yazma aşağıdaki RPC'lerle (kurallar sunucuda).
--   * Kurallar packages/core/src/social.ts ile aynı: gönderi metni ≤2000, yorum ≤1000,
--     en fazla 4 fotoğraf YA DA 1 video (≤60 sn, ≤50 MB), fotoğraf ≤10 MB. Soru metni en az 10 karakter.
--   * İçerik denetimi (App Store kuralı 1.2): şikâyet, kullanıcı engelleme, kendi içeriğini silme, yönetici kaldırma.
--     3 farklı kullanıcıdan şikâyet alan gönderi/yorum herkesten gizlenir. Silme yumuşaktır (deleted_at).

create type public.social_post_kind as enum ('post', 'question');

create table public.social_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 40),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.social_group_members (
  group_id uuid not null references public.social_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.social_group_members (user_id);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid references auth.users (id) on delete cascade,
  kind public.social_post_kind not null default 'post',
  group_id uuid references public.social_groups (id) on delete set null,
  body text not null default '' check (char_length(body) <= 2000),
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  best_comment_id uuid,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (author_user_id, client_request_id)
);
create index on public.social_posts (created_at desc) where deleted_at is null;
create index on public.social_posts (author_user_id, created_at desc) where deleted_at is null;
create index on public.social_posts (group_id, created_at desc) where deleted_at is null;

create table public.social_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (author_user_id, client_request_id)
);
create index on public.social_comments (post_id, created_at);
alter table public.social_posts add constraint social_posts_best_fk
  foreign key (best_comment_id) references public.social_comments (id) on delete set null;

create table public.social_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts (id) on delete cascade,
  kind public.forum_media_kind not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'video/mp4', 'video/quicktime')),
  size_bytes bigint not null check (size_bytes > 0),
  duration_sec numeric(6, 1) check (duration_sec is null or duration_sec between 0 and 60.5),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  check (kind = 'image' and size_bytes <= 10485760 and mime_type like 'image/%'
      or kind = 'video' and size_bytes <= 52428800 and mime_type like 'video/%')
);
create index on public.social_media (post_id);

create table public.social_likes (
  post_id uuid not null references public.social_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.social_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index on public.social_follows (followee_id);

create table public.social_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.social_posts (id) on delete cascade,
  comment_id uuid references public.social_comments (id) on delete cascade,
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (comment_id is null))
);
create unique index on public.social_reports (reporter_user_id, post_id) where post_id is not null;
create unique index on public.social_reports (reporter_user_id, comment_id) where comment_id is not null;

create table public.social_blocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  blocked_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  check (user_id <> blocked_user_id)
);

create trigger social_posts_audit after insert or update or delete on public.social_posts
  for each row execute function private.audit();
create trigger social_comments_audit after insert or update or delete on public.social_comments
  for each row execute function private.audit();

-- Marka grupları (Türkiye'de yaygın markalar; sırası listede görünen sıradır)
insert into public.social_groups (slug, name, position) values
  ('fiat', 'Fiat', 1), ('renault', 'Renault', 2), ('volkswagen', 'Volkswagen', 3), ('ford', 'Ford', 4), ('toyota', 'Toyota', 5),
  ('hyundai', 'Hyundai', 6), ('opel', 'Opel', 7), ('peugeot', 'Peugeot', 8), ('citroen', 'Citroën', 9), ('dacia', 'Dacia', 10),
  ('honda', 'Honda', 11), ('bmw', 'BMW', 12), ('mercedes-benz', 'Mercedes-Benz', 13), ('audi', 'Audi', 14), ('skoda', 'Škoda', 15),
  ('seat', 'Seat', 16), ('kia', 'Kia', 17), ('nissan', 'Nissan', 18), ('togg', 'Togg', 19), ('volvo', 'Volvo', 20),
  ('tesla', 'Tesla', 21), ('chery', 'Chery', 22), ('byd', 'BYD', 23), ('mg', 'MG', 24), ('suzuki', 'Suzuki', 25),
  ('mazda', 'Mazda', 26), ('mitsubishi', 'Mitsubishi', 27), ('jeep', 'Jeep', 28), ('land-rover', 'Land Rover', 29),
  ('porsche', 'Porsche', 30), ('cupra', 'Cupra', 31), ('motosiklet', 'Motosiklet', 90), ('klasik', 'Klasik araçlar', 91);

-- ---------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------

-- İki kullanıcıdan biri diğerini engellediyse birbirlerinin içeriğini görmezler
create function private.social_blocked(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.social_blocks
                 where (user_id = auth.uid() and blocked_user_id = p_other) or (user_id = p_other and blocked_user_id = auth.uid()))
$$;

create function private.social_hidden(p_post_id uuid, p_comment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(distinct reporter_user_id) from public.social_reports
          where (p_post_id is not null and post_id = p_post_id) or (p_comment_id is not null and comment_id = p_comment_id)) >= 3
$$;

create function private.social_visible(p public.social_posts) returns boolean
language sql stable security definer set search_path = '' as $$
  select p.deleted_at is null and not private.social_blocked(p.author_user_id) and not private.social_hidden(p.id, null)
$$;

create function private.social_name(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(display_name), ''), 'OTOM kullanıcısı') from public.profiles where id = p_user_id
$$;

create function private.social_author(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', p_user_id, 'name', coalesce(private.social_name(p_user_id), 'OTOM kullanıcısı'))
$$;

-- Yazmak için profilde görünen ad gerekir
create function private.social_require_name() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and char_length(btrim(coalesce(display_name, ''))) >= 2) then
    raise exception 'NAME_REQUIRED' using errcode = '22023';
  end if;
end $$;

create function private.social_media_json(p_post_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'storage_path', m.storage_path, 'mime_type', m.mime_type,
           'size_bytes', m.size_bytes, 'duration_sec', m.duration_sec) order by m.position), '[]'::jsonb)
  from public.social_media m where m.post_id = p_post_id
$$;

create function private.social_post_json(p_post_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'author', private.social_author(p.author_user_id), 'mine', p.author_user_id = auth.uid(),
    'kind', p.kind, 'group', case when g.id is null then null else jsonb_build_object('id', g.id, 'name', g.name) end,
    'body', p.body, 'like_count', p.like_count, 'comment_count', p.comment_count,
    'liked', exists (select 1 from public.social_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    'best_comment_id', p.best_comment_id, 'created_at', p.created_at, 'media', private.social_media_json(p.id))
  from public.social_posts p left join public.social_groups g on g.id = p.group_id
  where p.id = p_post_id
$$;

-- ---------------------------------------------------------------------
-- Okuma
-- ---------------------------------------------------------------------

-- Akış. p_scope: 'all' (herkes), 'following' (takip ettiklerim + ben), 'groups' (katıldığım gruplar), 'questions' (sorular).
-- p_group_id ya da p_user_id verilirse yalnızca o grubun / kullanıcının gönderileri.
create function public.social_feed(p_scope text default 'all', p_group_id uuid default null, p_user_id uuid default null,
                                   p_before timestamptz default null, p_limit int default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(private.social_post_json(x.id) order by x.created_at desc)
    from (
      select p.id, p.created_at from public.social_posts p
      where private.social_visible(p)
        and (p_group_id is null or p.group_id = p_group_id)
        and (p_user_id is null or p.author_user_id = p_user_id)
        and (p_before is null or p.created_at < p_before)
        and case coalesce(p_scope, 'all')
              when 'following' then p.author_user_id = auth.uid()
                or exists (select 1 from public.social_follows f where f.follower_id = auth.uid() and f.followee_id = p.author_user_id)
              when 'groups' then exists (select 1 from public.social_group_members m where m.user_id = auth.uid() and m.group_id = p.group_id)
              when 'questions' then p.kind = 'question'
              else true
            end
      order by p.created_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 50)
    ) x
  ), '[]'::jsonb);
end $$;

create function public.social_post(p_post_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_post public.social_posts;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_post from public.social_posts where id = p_post_id;
  if v_post.id is null or not private.social_visible(v_post) then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  return private.social_post_json(v_post.id) || jsonb_build_object('comments', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'author', private.social_author(c.author_user_id), 'mine', c.author_user_id = auth.uid(),
      'body', c.body, 'created_at', c.created_at, 'best', c.id = v_post.best_comment_id)
      order by (c.id = v_post.best_comment_id) desc, c.created_at)
    from public.social_comments c
    where c.post_id = v_post.id and c.deleted_at is null
      and not private.social_blocked(c.author_user_id) and not private.social_hidden(null, c.id)
  ), '[]'::jsonb));
end $$;

-- Kullanıcı profili: ad, gönderi/takipçi/takip sayısı, takip ediyor muyum, engelledim mi
create function public.social_user(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = p_user_id)
     or exists (select 1 from public.social_blocks where user_id = p_user_id and blocked_user_id = auth.uid()) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'user_id', p_user_id, 'name', coalesce(private.social_name(p_user_id), 'OTOM kullanıcısı'), 'me', p_user_id = auth.uid(),
    'has_name', exists (select 1 from public.profiles where id = p_user_id and char_length(btrim(coalesce(display_name, ''))) >= 2),
    'post_count', (select count(*) from public.social_posts where author_user_id = p_user_id and deleted_at is null),
    'follower_count', (select count(*) from public.social_follows where followee_id = p_user_id),
    'following_count', (select count(*) from public.social_follows where follower_id = p_user_id),
    'following', exists (select 1 from public.social_follows where follower_id = auth.uid() and followee_id = p_user_id),
    'blocked', exists (select 1 from public.social_blocks where user_id = auth.uid() and blocked_user_id = p_user_id),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.position)
                        from public.social_group_members m join public.social_groups g on g.id = m.group_id
                        where m.user_id = p_user_id), '[]'::jsonb));
end $$;

create function public.social_groups_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'slug', g.slug, 'name', g.name,
      'member_count', (select count(*) from public.social_group_members m where m.group_id = g.id),
      'post_count', (select count(*) from public.social_posts p where p.group_id = g.id and p.deleted_at is null),
      'joined', exists (select 1 from public.social_group_members m where m.group_id = g.id and m.user_id = auth.uid()))
      order by g.position, g.name)
    from public.social_groups g
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Yazma
-- ---------------------------------------------------------------------

-- p: {kind, group_id, body, client_request_id, media: [{kind, storage_path, mime_type, size_bytes, duration_sec}]}
-- Dosya yolu yazanın klasöründe olmalı: <user_id>/<dosya>
create function public.create_social_post(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_req uuid := (p->>'client_request_id')::uuid; v_id uuid; v_kind public.social_post_kind := coalesce(p->>'kind', 'post')::public.social_post_kind;
  v_group uuid := nullif(p->>'group_id', '')::uuid; v_body text := btrim(coalesce(p->>'body', ''));
  v_m jsonb; v_images int := 0; v_videos int := 0; v_pos int := 0;
begin
  perform private.social_require_name();
  if v_req is null then raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023'; end if;
  select id into v_id from public.social_posts where author_user_id = auth.uid() and client_request_id = v_req;
  if v_id is not null then return v_id; end if;
  if v_group is not null and not exists (select 1 from public.social_groups where id = v_group) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p->'media' is not null and jsonb_typeof(p->'media') = 'array' then
    for v_m in select * from jsonb_array_elements(p->'media') loop
      if v_m->>'kind' = 'image' then v_images := v_images + 1;
      elsif v_m->>'kind' = 'video' then v_videos := v_videos + 1;
      else raise exception 'MEDIA_INVALID' using errcode = '22023';
      end if;
      if (v_m->>'storage_path') not like auth.uid()::text || '/%' then raise exception 'MEDIA_PATH' using errcode = '42501'; end if;
    end loop;
  end if;
  if v_videos > 1 or (v_videos > 0 and v_images > 0) or v_images > 4 then raise exception 'MEDIA_LIMIT' using errcode = '22023'; end if;
  if v_kind = 'question' and char_length(v_body) < 10 then raise exception 'QUESTION_SHORT' using errcode = '22023'; end if;
  if v_kind = 'post' and v_body = '' and v_images + v_videos = 0 then raise exception 'POST_EMPTY' using errcode = '22023'; end if;
  if (select count(*) from public.social_posts where author_user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.social_posts (author_user_id, kind, group_id, body, client_request_id)
  values (auth.uid(), v_kind, v_group, v_body, v_req) returning id into v_id;
  if v_images + v_videos > 0 then
    for v_m in select * from jsonb_array_elements(p->'media') loop
      insert into public.social_media (post_id, kind, storage_path, mime_type, size_bytes, duration_sec, position)
      values (v_id, (v_m->>'kind')::public.forum_media_kind, v_m->>'storage_path', v_m->>'mime_type',
              (v_m->>'size_bytes')::bigint, nullif(v_m->>'duration_sec', '')::numeric, v_pos);
      v_pos := v_pos + 1;
    end loop;
  end if;
  return v_id;
end $$;

-- p: {post_id, body, client_request_id}
create function public.add_social_comment(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_req uuid := (p->>'client_request_id')::uuid; v_post public.social_posts; v_id uuid;
begin
  perform private.social_require_name();
  if v_req is null then raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023'; end if;
  select id into v_id from public.social_comments where author_user_id = auth.uid() and client_request_id = v_req;
  if v_id is not null then return v_id; end if;
  select * into v_post from public.social_posts where id = (p->>'post_id')::uuid for update;
  if v_post.id is null or not private.social_visible(v_post) then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if char_length(btrim(coalesce(p->>'body', ''))) = 0 then raise exception 'COMMENT_EMPTY' using errcode = '22023'; end if;
  if (select count(*) from public.social_comments where author_user_id = auth.uid() and created_at > now() - interval '1 day') >= 200 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.social_comments (post_id, author_user_id, body, client_request_id)
  values (v_post.id, auth.uid(), btrim(p->>'body'), v_req) returning id into v_id;
  update public.social_posts set comment_count = comment_count + 1 where id = v_post.id;
  return v_id;
end $$;

create function public.delete_social_post(p_post_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.social_posts where id = p_post_id and author_user_id = auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.social_posts set deleted_at = now() where id = p_post_id and deleted_at is null;
end $$;

create function public.delete_social_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_c public.social_comments;
begin
  select * into v_c from public.social_comments where id = p_comment_id;
  if v_c.id is null or v_c.author_user_id is distinct from auth.uid() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_c.deleted_at is not null then return; end if;
  update public.social_comments set deleted_at = now() where id = p_comment_id;
  update public.social_posts set comment_count = greatest(comment_count - 1, 0),
         best_comment_id = case when best_comment_id = p_comment_id then null else best_comment_id end
   where id = v_c.post_id;
end $$;

-- Beğen / beğeniyi geri al. Yeni beğeni sayısını döner.
create function public.like_social_post(p_post_id uuid, p_like boolean default true) returns int
language plpgsql security definer set search_path = '' as $$
declare v_post public.social_posts; v_n int;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_post from public.social_posts where id = p_post_id for update;
  if v_post.id is null or not private.social_visible(v_post) then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if p_like then
    insert into public.social_likes (post_id, user_id) values (p_post_id, auth.uid()) on conflict do nothing;
  else
    delete from public.social_likes where post_id = p_post_id and user_id = auth.uid();
  end if;
  select count(*) into v_n from public.social_likes where post_id = p_post_id;
  update public.social_posts set like_count = v_n where id = p_post_id;
  return v_n;
end $$;

-- En iyi yanıt: yalnızca soruyu soran işaretler (null: işareti kaldır)
create function public.set_best_answer(p_post_id uuid, p_comment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.social_posts where id = p_post_id and author_user_id = auth.uid() and kind = 'question' and deleted_at is null) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_comment_id is not null and not exists (
    select 1 from public.social_comments where id = p_comment_id and post_id = p_post_id and deleted_at is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.social_posts set best_comment_id = p_comment_id where id = p_post_id;
end $$;

create function public.follow_user(p_user_id uuid, p_follow boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user_id = auth.uid() then raise exception 'FOLLOW_SELF' using errcode = '22023'; end if;
  if p_follow then
    if private.social_blocked(p_user_id) or not exists (select 1 from auth.users where id = p_user_id) then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if (select count(*) from public.social_follows where follower_id = auth.uid() and created_at > now() - interval '1 day') >= 200 then
      raise exception 'RATE_LIMIT' using errcode = 'P0001';
    end if;
    insert into public.social_follows (follower_id, followee_id) values (auth.uid(), p_user_id) on conflict do nothing;
  else
    delete from public.social_follows where follower_id = auth.uid() and followee_id = p_user_id;
  end if;
end $$;

create function public.join_social_group(p_group_id uuid, p_join boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_groups where id = p_group_id) then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if p_join then
    insert into public.social_group_members (group_id, user_id) values (p_group_id, auth.uid()) on conflict do nothing;
  else
    delete from public.social_group_members where group_id = p_group_id and user_id = auth.uid();
  end if;
end $$;

create function public.report_social_content(p_post_id uuid, p_comment_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if (p_post_id is null) = (p_comment_id is null) then raise exception 'TARGET_INVALID' using errcode = '22023'; end if;
  insert into public.social_reports (post_id, comment_id, reporter_user_id, reason)
  values (p_post_id, p_comment_id, auth.uid(), nullif(btrim(left(coalesce(p_reason, ''), 300)), ''))
  on conflict do nothing;
end $$;

-- Engelleme: iki taraf birbirinin içeriğini görmez; aradaki takipler kaldırılır
create function public.block_social_user(p_user_id uuid, p_block boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user_id = auth.uid() then raise exception 'BLOCK_SELF' using errcode = '22023'; end if;
  if p_block then
    insert into public.social_blocks (user_id, blocked_user_id) values (auth.uid(), p_user_id) on conflict do nothing;
    delete from public.social_follows
     where (follower_id = auth.uid() and followee_id = p_user_id) or (follower_id = p_user_id and followee_id = auth.uid());
  else
    delete from public.social_blocks where user_id = auth.uid() and blocked_user_id = p_user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Yönetici: şikâyet edilen içerikler ve kaldırma
-- ---------------------------------------------------------------------
create function public.admin_social_reports() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(x order by (x->>'report_count')::int desc, x->>'last_report_at' desc)
    from (
      select jsonb_build_object(
        'post_id', r.post_id, 'comment_id', r.comment_id,
        'author_name', coalesce(private.social_name(coalesce(p.author_user_id, c.author_user_id)), 'OTOM kullanıcısı'),
        'text', coalesce(p.body, c.body),
        'deleted', coalesce(p.deleted_at, c.deleted_at) is not null,
        'report_count', count(*), 'last_report_at', max(r.created_at),
        'reasons', jsonb_agg(r.reason) filter (where r.reason is not null)
      ) x
      from public.social_reports r
      left join public.social_posts p on p.id = r.post_id
      left join public.social_comments c on c.id = r.comment_id
      group by r.post_id, r.comment_id, p.author_user_id, c.author_user_id, p.body, c.body, p.deleted_at, c.deleted_at
    ) s
  ), '[]'::jsonb);
end $$;

create function public.admin_remove_social_content(p_post_id uuid, p_comment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_post uuid;
begin
  perform private.require_admin();
  if p_post_id is not null then
    update public.social_posts set deleted_at = coalesce(deleted_at, now()) where id = p_post_id;
  elsif p_comment_id is not null then
    update public.social_comments set deleted_at = now() where id = p_comment_id and deleted_at is null returning post_id into v_post;
    if v_post is not null then
      update public.social_posts set comment_count = greatest(comment_count - 1, 0),
             best_comment_id = case when best_comment_id = p_comment_id then null else best_comment_id end
       where id = v_post;
    end if;
  else
    raise exception 'TARGET_INVALID' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Erişim: tablolara doğrudan erişim yok; okuma ve yazma yalnızca RPC ile
-- ---------------------------------------------------------------------
alter table public.social_groups enable row level security;
alter table public.social_group_members enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_comments enable row level security;
alter table public.social_media enable row level security;
alter table public.social_likes enable row level security;
alter table public.social_follows enable row level security;
alter table public.social_reports enable row level security;
alter table public.social_blocks enable row level security;

revoke all on public.social_groups, public.social_group_members, public.social_posts, public.social_comments, public.social_media,
  public.social_likes, public.social_follows, public.social_reports, public.social_blocks from anon, authenticated;
grant all on public.social_groups, public.social_group_members, public.social_posts, public.social_comments, public.social_media,
  public.social_likes, public.social_follows, public.social_reports, public.social_blocks to service_role;

revoke execute on function private.social_blocked(uuid), private.social_hidden(uuid, uuid), private.social_visible(public.social_posts),
  private.social_name(uuid), private.social_author(uuid), private.social_require_name(), private.social_media_json(uuid),
  private.social_post_json(uuid) from public;

revoke execute on function public.social_feed(text, uuid, uuid, timestamptz, int), public.social_post(uuid), public.social_user(uuid),
  public.social_groups_list(), public.create_social_post(jsonb), public.add_social_comment(jsonb), public.delete_social_post(uuid),
  public.delete_social_comment(uuid), public.like_social_post(uuid, boolean), public.set_best_answer(uuid, uuid),
  public.follow_user(uuid, boolean), public.join_social_group(uuid, boolean), public.report_social_content(uuid, uuid, text),
  public.block_social_user(uuid, boolean), public.admin_social_reports(), public.admin_remove_social_content(uuid, uuid) from public, anon;
grant execute on function public.social_feed(text, uuid, uuid, timestamptz, int), public.social_post(uuid), public.social_user(uuid),
  public.social_groups_list(), public.create_social_post(jsonb), public.add_social_comment(jsonb), public.delete_social_post(uuid),
  public.delete_social_comment(uuid), public.like_social_post(uuid, boolean), public.set_best_answer(uuid, uuid),
  public.follow_user(uuid, boolean), public.join_social_group(uuid, boolean), public.report_social_content(uuid, uuid, text),
  public.block_social_user(uuid, boolean), public.admin_social_reports(), public.admin_remove_social_content(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: Ana Sayfa fotoğraf ve videoları. Yol: <user_id>/<dosya>
-- Oturum açmış herkes okur; herkes yalnızca kendi klasörüne yükler.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', false, 52428800, array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

create policy "sosyal dosya: oturum açanlar okur" on storage.objects for select to authenticated
  using (bucket_id = 'social-media');
create policy "sosyal dosya: kendi klasörüne yükler" on storage.objects for insert to authenticated
  with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text);
