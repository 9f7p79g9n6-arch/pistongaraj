-- PISTON SERVİS Usta Forumu: işletmeler arası soru, tartışma ve tecrübe paylaşımı (fotoğraf ya da video ile).
--   * Yalnızca bir işletmenin üyesi olan (işletmesi askıda olmayan) kullanıcılar okur ve yazar.
--   * Tablolara doğrudan yazılmaz; her yazma işlemi aşağıdaki RPC'lerle yapılır (kurallar sunucuda).
--   * Kurallar packages/core/src/forum.ts ile aynı: başlık 5–120, açıklama ≤3000, yanıt ≤2000,
--     en fazla 4 fotoğraf YA DA 1 video (≤60 sn, ≤50 MB), fotoğraf ≤10 MB.
--   * İçerik denetimi (App Store kuralı 1.2): şikâyet, işletme engelleme, kendi gönderisini silme.
--     3 farklı işletmeden şikâyet alan gönderi/yanıt herkesten gizlenir (denetim kaydı kalır).
--   * Silme yumuşaktır (deleted_at); satır ve dosya yolu denetim için saklanır.

create type public.forum_category as enum ('ariza', 'motor', 'elektrik', 'kaporta', 'parca', 'genel');
create type public.forum_media_kind as enum ('image', 'video');

create table public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  category public.forum_category not null,
  title text not null check (char_length(btrim(title)) between 5 and 120),
  body text not null default '' check (char_length(body) <= 3000),
  solved boolean not null default false,
  comment_count integer not null default 0 check (comment_count >= 0),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (author_user_id, client_request_id)
);
create index on public.forum_posts (last_activity_at desc) where deleted_at is null;
create index on public.forum_posts (category, last_activity_at desc) where deleted_at is null;

create table public.forum_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  body text not null default '' check (char_length(body) <= 2000),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (author_user_id, client_request_id)
);
create index on public.forum_comments (post_id, created_at);

create table public.forum_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.forum_posts (id) on delete cascade,
  comment_id uuid references public.forum_comments (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind public.forum_media_kind not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'video/mp4', 'video/quicktime')),
  size_bytes bigint not null check (size_bytes > 0),
  duration_sec numeric(6, 1) check (duration_sec is null or duration_sec between 0 and 60.5),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (comment_id is null)),
  check (kind = 'image' and size_bytes <= 10485760 and mime_type like 'image/%'
      or kind = 'video' and size_bytes <= 52428800 and mime_type like 'video/%')
);
create index on public.forum_media (post_id);
create index on public.forum_media (comment_id);

create table public.forum_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.forum_posts (id) on delete cascade,
  comment_id uuid references public.forum_comments (id) on delete cascade,
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reporter_business_id uuid not null references public.businesses (id) on delete cascade,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (comment_id is null))
);
create unique index on public.forum_reports (reporter_user_id, post_id) where post_id is not null;
create unique index on public.forum_reports (reporter_user_id, comment_id) where comment_id is not null;

-- Kullanıcının engellediği işletmeler: onların gönderi ve yanıtları bu kullanıcıya gösterilmez
create table public.forum_blocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  blocked_business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_business_id)
);

create trigger forum_posts_audit after insert or update or delete on public.forum_posts
  for each row execute function private.audit();
create trigger forum_comments_audit after insert or update or delete on public.forum_comments
  for each row execute function private.audit();

-- ---------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------

-- Forumu kullanabilir mi: askıda olmayan bir işletmenin üyesi
create function private.is_forum_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m join public.businesses b on b.id = m.business_id
    where m.user_id = auth.uid() and b.status in ('pending_verification', 'active')
  )
$$;

-- Bu işletme adına yazabilir mi: üye ve işletme askıda değil
create function private.can_post_as(p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_members where business_id = p_business_id and user_id = auth.uid())
     and private.business_writable(p_business_id)
$$;

-- 3 farklı işletmeden şikâyet alan içerik gizlenir
create function private.forum_hidden(p_post_id uuid, p_comment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(distinct reporter_business_id) from public.forum_reports
          where (p_post_id is not null and post_id = p_post_id) or (p_comment_id is not null and comment_id = p_comment_id)) >= 3
$$;

create function private.forum_author(p_business_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('business_id', b.id, 'business_name', b.name, 'city', b.city, 'verified', b.status = 'active')
  from public.businesses b where b.id = p_business_id
$$;

create function private.forum_media_json(p_post_id uuid, p_comment_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'storage_path', m.storage_path, 'mime_type', m.mime_type,
           'size_bytes', m.size_bytes, 'duration_sec', m.duration_sec) order by m.position), '[]'::jsonb)
  from public.forum_media m
  where (p_post_id is not null and m.post_id = p_post_id) or (p_comment_id is not null and m.comment_id = p_comment_id)
$$;

-- Ekleri doğrular ve yazar. p_media: [{kind, storage_path, mime_type, size_bytes, duration_sec}]
-- Dosya yolu yazan işletmenin klasöründe olmalı: forum/<business_id>/<dosya>
create function private.forum_attach(p_business_id uuid, p_post_id uuid, p_comment_id uuid, p_media jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m jsonb; v_images int := 0; v_videos int := 0; v_pos int := 0;
begin
  if p_media is null or jsonb_typeof(p_media) <> 'array' then return; end if;
  for v_m in select * from jsonb_array_elements(p_media) loop
    if v_m->>'kind' = 'image' then v_images := v_images + 1;
    elsif v_m->>'kind' = 'video' then v_videos := v_videos + 1;
    else raise exception 'MEDIA_INVALID' using errcode = '22023';
    end if;
    if (v_m->>'storage_path') not like p_business_id::text || '/%' then raise exception 'MEDIA_PATH' using errcode = '42501'; end if;
  end loop;
  if v_videos > 1 or (v_videos > 0 and v_images > 0) or v_images > 4 then raise exception 'MEDIA_LIMIT' using errcode = '22023'; end if;
  for v_m in select * from jsonb_array_elements(p_media) loop
    insert into public.forum_media (post_id, comment_id, business_id, kind, storage_path, mime_type, size_bytes, duration_sec, position)
    values (p_post_id, p_comment_id, p_business_id, (v_m->>'kind')::public.forum_media_kind, v_m->>'storage_path', v_m->>'mime_type',
            (v_m->>'size_bytes')::bigint, nullif(v_m->>'duration_sec', '')::numeric, v_pos);
    v_pos := v_pos + 1;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Okuma
-- ---------------------------------------------------------------------

create function private.forum_post_json(p_post_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'author', private.forum_author(p.business_id), 'mine', p.author_user_id = auth.uid(),
    'category', p.category, 'title', p.title, 'body', p.body, 'solved', p.solved,
    'comment_count', p.comment_count, 'created_at', p.created_at, 'last_activity_at', p.last_activity_at,
    'media', private.forum_media_json(p.id, null))
  from public.forum_posts p where p.id = p_post_id
$$;

-- Akış: en son hareket görenler önce. Silinen, gizlenen ve engellenen işletmenin gönderileri çıkar.
create function public.forum_feed(p_category public.forum_category default null, p_before timestamptz default null, p_limit int default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_forum_user() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(private.forum_post_json(p.id) order by p.last_activity_at desc)
    from (
      select p.id, p.last_activity_at from public.forum_posts p
      where p.deleted_at is null
        and (p_category is null or p.category = p_category)
        and (p_before is null or p.last_activity_at < p_before)
        and not exists (select 1 from public.forum_blocks k where k.user_id = auth.uid() and k.blocked_business_id = p.business_id)
        and not private.forum_hidden(p.id, null)
      order by p.last_activity_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 50)
    ) p
  ), '[]'::jsonb);
end $$;

create function public.forum_post(p_post_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_post public.forum_posts;
begin
  if not private.is_forum_user() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_post from public.forum_posts where id = p_post_id;
  if v_post.id is null or v_post.deleted_at is not null or private.forum_hidden(v_post.id, null)
     or exists (select 1 from public.forum_blocks k where k.user_id = auth.uid() and k.blocked_business_id = v_post.business_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return private.forum_post_json(v_post.id) || jsonb_build_object('comments', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'post_id', c.post_id, 'author', private.forum_author(c.business_id), 'mine', c.author_user_id = auth.uid(),
      'body', c.body, 'created_at', c.created_at, 'media', private.forum_media_json(null, c.id)) order by c.created_at)
    from public.forum_comments c
    where c.post_id = v_post.id and c.deleted_at is null
      and not exists (select 1 from public.forum_blocks k where k.user_id = auth.uid() and k.blocked_business_id = c.business_id)
      and not private.forum_hidden(null, c.id)
  ), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Yazma
-- ---------------------------------------------------------------------

-- p: {business_id, category, title, body, client_request_id, media: [...]}
create function public.create_forum_post(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_biz uuid := (p->>'business_id')::uuid; v_req uuid := (p->>'client_request_id')::uuid; v_id uuid;
begin
  if v_biz is null or not private.can_post_as(v_biz) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_req is null then raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023'; end if;
  select id into v_id from public.forum_posts where author_user_id = auth.uid() and client_request_id = v_req;
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.forum_posts where author_user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.forum_posts (business_id, author_user_id, category, title, body, client_request_id)
  values (v_biz, auth.uid(), (p->>'category')::public.forum_category, btrim(p->>'title'), btrim(coalesce(p->>'body', '')), v_req)
  returning id into v_id;
  perform private.forum_attach(v_biz, v_id, null, p->'media');
  return v_id;
end $$;

-- p: {business_id, post_id, body, client_request_id, media: [...]}
create function public.add_forum_comment(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_biz uuid := (p->>'business_id')::uuid; v_req uuid := (p->>'client_request_id')::uuid; v_post public.forum_posts; v_id uuid;
begin
  if v_biz is null or not private.can_post_as(v_biz) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_req is null then raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023'; end if;
  select id into v_id from public.forum_comments where author_user_id = auth.uid() and client_request_id = v_req;
  if v_id is not null then return v_id; end if;
  select * into v_post from public.forum_posts where id = (p->>'post_id')::uuid for update;
  if v_post.id is null or v_post.deleted_at is not null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if char_length(btrim(coalesce(p->>'body', ''))) = 0 and coalesce(jsonb_array_length(p->'media'), 0) = 0 then
    raise exception 'COMMENT_EMPTY' using errcode = '22023';
  end if;
  if (select count(*) from public.forum_comments where author_user_id = auth.uid() and created_at > now() - interval '1 day') >= 200 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.forum_comments (post_id, business_id, author_user_id, body, client_request_id)
  values (v_post.id, v_biz, auth.uid(), btrim(coalesce(p->>'body', '')), v_req)
  returning id into v_id;
  perform private.forum_attach(v_biz, null, v_id, p->'media');
  update public.forum_posts set comment_count = comment_count + 1, last_activity_at = now() where id = v_post.id;
  return v_id;
end $$;

-- Gönderiyi yalnızca yazan kişi siler
create function public.delete_forum_post(p_post_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.forum_posts set deleted_at = now()
   where id = p_post_id and author_user_id = auth.uid() and deleted_at is null;
  if not found and not exists (select 1 from public.forum_posts where id = p_post_id and author_user_id = auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;

create function public.delete_forum_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_c public.forum_comments;
begin
  select * into v_c from public.forum_comments where id = p_comment_id;
  if v_c.id is null or v_c.author_user_id is distinct from auth.uid() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_c.deleted_at is not null then return; end if;
  update public.forum_comments set deleted_at = now() where id = p_comment_id;
  update public.forum_posts set comment_count = greatest(comment_count - 1, 0) where id = v_c.post_id;
end $$;

-- "Çözüldü" işaretini yalnızca konuyu açan kişi değiştirir
create function public.set_forum_post_solved(p_post_id uuid, p_solved boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.forum_posts set solved = p_solved where id = p_post_id and author_user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
end $$;

create function public.report_forum_content(p_business_id uuid, p_post_id uuid, p_comment_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_post_as(p_business_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if (p_post_id is null) = (p_comment_id is null) then raise exception 'TARGET_INVALID' using errcode = '22023'; end if;
  insert into public.forum_reports (post_id, comment_id, reporter_user_id, reporter_business_id, reason)
  values (p_post_id, p_comment_id, auth.uid(), p_business_id, nullif(btrim(left(coalesce(p_reason, ''), 300)), ''))
  on conflict do nothing;
end $$;

create function public.block_forum_business(p_business_id uuid, p_block boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_forum_user() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if exists (select 1 from public.business_members where business_id = p_business_id and user_id = auth.uid()) then
    raise exception 'BLOCK_SELF' using errcode = '22023';
  end if;
  if p_block then
    insert into public.forum_blocks (user_id, blocked_business_id) values (auth.uid(), p_business_id) on conflict do nothing;
  else
    delete from public.forum_blocks where user_id = auth.uid() and blocked_business_id = p_business_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Erişim: tablolara doğrudan erişim yok; okuma ve yazma yalnızca RPC ile
-- ---------------------------------------------------------------------
alter table public.forum_posts enable row level security;
alter table public.forum_comments enable row level security;
alter table public.forum_media enable row level security;
alter table public.forum_reports enable row level security;
alter table public.forum_blocks enable row level security;
create policy "engellemeler: kendi" on public.forum_blocks for select to authenticated using (user_id = auth.uid());

revoke all on public.forum_posts, public.forum_comments, public.forum_media, public.forum_reports, public.forum_blocks from anon, authenticated;
grant select on public.forum_blocks to authenticated;
grant all on public.forum_posts, public.forum_comments, public.forum_media, public.forum_reports, public.forum_blocks to service_role;

revoke execute on function private.is_forum_user(), private.can_post_as(uuid), private.forum_hidden(uuid, uuid), private.forum_author(uuid),
  private.forum_media_json(uuid, uuid), private.forum_attach(uuid, uuid, uuid, jsonb), private.forum_post_json(uuid) from public;
grant execute on function private.is_forum_user() to authenticated;

revoke execute on function public.forum_feed(public.forum_category, timestamptz, int), public.forum_post(uuid), public.create_forum_post(jsonb),
  public.add_forum_comment(jsonb), public.delete_forum_post(uuid), public.delete_forum_comment(uuid), public.set_forum_post_solved(uuid, boolean),
  public.report_forum_content(uuid, uuid, uuid, text), public.block_forum_business(uuid, boolean) from public, anon;
grant execute on function public.forum_feed(public.forum_category, timestamptz, int), public.forum_post(uuid), public.create_forum_post(jsonb),
  public.add_forum_comment(jsonb), public.delete_forum_post(uuid), public.delete_forum_comment(uuid), public.set_forum_post_solved(uuid, boolean),
  public.report_forum_content(uuid, uuid, uuid, text), public.block_forum_business(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: forum fotoğraf ve videoları. Yol: <business_id>/<dosya>
-- Her işletme kullanıcısı okur; yalnızca kendi işletmesinin klasörüne yükler.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('forum-media', 'forum-media', false, 52428800, array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

create policy "forum dosyası: işletme kullanıcıları okur" on storage.objects for select to authenticated
  using (bucket_id = 'forum-media' and private.is_forum_user());
create policy "forum dosyası: kendi işletmesine yükler" on storage.objects for insert to authenticated
  with check (bucket_id = 'forum-media' and exists (
    select 1 from public.business_members m
    where m.user_id = auth.uid() and m.business_id = private.try_uuid((storage.foldername(name))[1])));
