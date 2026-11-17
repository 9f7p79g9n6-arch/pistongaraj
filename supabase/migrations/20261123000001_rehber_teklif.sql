-- Servis rehberi, teklif talepleri (servis + parça), onaylı yorumlar ve yönetici işlemleri.
--   * Rehberde yalnızca DOĞRULANMIŞ (status = 'active') ve silinmemiş işletmeler görünür.
--   * Araç sahibi talep açar; talep, seçtiği işletmelere (en fazla 5) ya da şehrindeki ilgili kategorideki
--     doğrulanmış işletmelere (en fazla 20) gider. Parça talebi "Yedek parça" kategorisine gider.
--   * İşletme teklif verir (parça + işçilik ayrı). Talep sahibi teklifleri görür, birini kabul eder.
--     Talep sahibinin telefonu yalnızca KABUL EDİLEN işletmeye görünür (o da profilinde telefon varsa).
--   * Yorum: yalnızca o işletmede TAMAMLANMIŞ servis kaydı olan müşteri, kayıt başına bir yorum yazar.
--   * Yönetici (user_roles.role = 'admin'): işletme doğrulama/askıya alma, forum şikâyetlerini görme ve içeriği kaldırma.
--   * Tablolara doğrudan erişim yok; okuma ve yazma yalnızca aşağıdaki RPC'lerle.

-- ---------------------------------------------------------------------
-- İşletme profili: tanıtım ve çalışma saatleri (rehberde görünür)
-- ---------------------------------------------------------------------
alter table public.businesses
  add column description text check (char_length(description) <= 500),
  add column working_hours text check (char_length(working_hours) <= 120);
grant update (description, working_hours) on public.businesses to authenticated;

-- ---------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------
create type public.quote_kind as enum ('service', 'part');
create type public.quote_status as enum ('open', 'accepted', 'closed');
create type public.part_condition as enum ('original', 'equivalent', 'used');

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.quote_kind not null,
  category public.business_category not null,
  city text not null check (char_length(btrim(city)) between 2 and 40),
  vehicle_label text not null check (char_length(btrim(vehicle_label)) between 2 and 120),
  title text not null check (char_length(btrim(title)) between 5 and 120),
  description text check (char_length(description) <= 1500),
  part_name text check (char_length(part_name) <= 120),
  status public.quote_status not null default 'open',
  accepted_offer_id uuid,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);
create index on public.quote_requests (user_id, created_at desc);

create table public.quote_request_targets (
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (request_id, business_id)
);
create index on public.quote_request_targets (business_id, created_at desc);

create table public.quote_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  parts_kurus bigint not null default 0 check (parts_kurus >= 0),
  labor_kurus bigint not null default 0 check (labor_kurus >= 0),
  part_condition public.part_condition,
  eta text check (char_length(eta) <= 60),
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, business_id),
  check (parts_kurus + labor_kurus > 0)
);

alter table public.quote_requests
  add constraint quote_requests_accepted_fk foreign key (accepted_offer_id) references public.quote_offers (id) on delete set null;

create table public.business_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  record_id uuid not null unique references public.service_records (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.business_reviews (business_id, created_at desc);

create trigger quote_offers_audit after insert or update or delete on public.quote_offers
  for each row execute function private.audit();

alter table public.quote_requests enable row level security;
alter table public.quote_request_targets enable row level security;
alter table public.quote_offers enable row level security;
alter table public.business_reviews enable row level security;
revoke all on public.quote_requests, public.quote_request_targets, public.quote_offers, public.business_reviews from anon, authenticated;
grant all on public.quote_requests, public.quote_request_targets, public.quote_offers, public.business_reviews to service_role;

-- ---------------------------------------------------------------------
-- Rehber
-- ---------------------------------------------------------------------
create function private.public_business_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'category', b.category, 'city', b.city, 'district', b.district, 'address', b.address,
    'phone', b.phone, 'description', b.description, 'working_hours', b.working_hours,
    'rating_avg', (select round(avg(rating)::numeric, 2) from public.business_reviews r where r.business_id = b.id),
    'rating_count', (select count(*) from public.business_reviews r where r.business_id = b.id))
  from public.businesses b where b.id = p_id
$$;

-- Doğrulanmış işletmeler; şehir, kategori ve ada göre süzülür (en fazla 100)
create function public.public_businesses(p_city text default null, p_category public.business_category default null, p_query text default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.public_business_json(x.id) order by x.name), '[]'::jsonb)
  from (
    select b.id, b.name from public.businesses b
    where b.status = 'active' and b.deleted_at is null
      and (p_city is null or btrim(p_city) = '' or lower(b.city) = lower(btrim(p_city)))
      and (p_category is null or b.category = p_category)
      and (p_query is null or btrim(p_query) = '' or b.name ilike '%' || btrim(p_query) || '%' or b.district ilike '%' || btrim(p_query) || '%')
    order by b.name
    limit 100
  ) x
$$;

-- İşletme sayfası: bilgiler + son 30 yorum (yorum yazanın adı gösterilmez)
create function public.public_business(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.businesses where id = p_id and status = 'active' and deleted_at is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return private.public_business_json(p_id) || jsonb_build_object('reviews', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at) order by r.created_at desc)
    from (select * from public.business_reviews where business_id = p_id order by created_at desc limit 30) r
  ), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Teklif talepleri: araç sahibi tarafı
-- ---------------------------------------------------------------------
create function private.quote_offer_json(p_offer_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'request_id', o.request_id, 'business_id', o.business_id, 'business_name', b.name, 'business_city', b.city,
    'business_phone', b.phone, 'parts_kurus', o.parts_kurus, 'labor_kurus', o.labor_kurus, 'total_kurus', o.parts_kurus + o.labor_kurus,
    'part_condition', o.part_condition, 'eta', o.eta, 'note', o.note, 'created_at', o.created_at, 'updated_at', o.updated_at)
  from public.quote_offers o join public.businesses b on b.id = o.business_id
  where o.id = p_offer_id
$$;

-- p: {kind, category, city, vehicle_label, title, description, part_name, business_ids: [uuid], client_request_id}
create function public.create_quote_request(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_kind public.quote_kind := (p->>'kind')::public.quote_kind;
  v_cat public.business_category;
  v_req uuid := (p->>'client_request_id')::uuid;
  v_id uuid; v_ids uuid[]; v_targets int;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_req is null then raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023'; end if;
  select id into v_id from public.quote_requests where user_id = auth.uid() and client_request_id = v_req;
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.quote_requests where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  v_cat := case when v_kind = 'part' then 'spare_parts'::public.business_category else coalesce((p->>'category')::public.business_category, 'mechanic') end;

  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p->'business_ids', '[]'::jsonb)) x;
  if coalesce(array_length(v_ids, 1), 0) > 5 then raise exception 'TOO_MANY_TARGETS' using errcode = '22023'; end if;

  insert into public.quote_requests (user_id, kind, category, city, vehicle_label, title, description, part_name, client_request_id)
  values (auth.uid(), v_kind, v_cat, btrim(p->>'city'), btrim(p->>'vehicle_label'), btrim(p->>'title'),
          nullif(btrim(coalesce(p->>'description', '')), ''), nullif(btrim(coalesce(p->>'part_name', '')), ''), v_req)
  returning id into v_id;

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    -- Rehberden seçilen işletmeler (yalnızca doğrulanmış olanlar)
    insert into public.quote_request_targets (request_id, business_id)
    select v_id, b.id from public.businesses b where b.id = any (v_ids) and b.status = 'active' and b.deleted_at is null;
  else
    -- Şehrindeki ilgili kategorideki doğrulanmış işletmeler (en fazla 20)
    insert into public.quote_request_targets (request_id, business_id)
    select v_id, b.id from public.businesses b
    where b.status = 'active' and b.deleted_at is null and b.category = v_cat and lower(b.city) = lower(btrim(p->>'city'))
    order by b.created_at limit 20;
  end if;
  get diagnostics v_targets = row_count;
  if v_targets = 0 then raise exception 'NO_BUSINESS' using errcode = 'P0001'; end if;
  return v_id;
end $$;

create function public.my_quote_requests() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'kind', q.kind, 'category', q.category, 'city', q.city, 'vehicle_label', q.vehicle_label, 'title', q.title,
    'description', q.description, 'part_name', q.part_name, 'status', q.status, 'accepted_offer_id', q.accepted_offer_id,
    'created_at', q.created_at,
    'target_count', (select count(*) from public.quote_request_targets t where t.request_id = q.id),
    'offers', coalesce((select jsonb_agg(private.quote_offer_json(o.id) order by o.parts_kurus + o.labor_kurus) from public.quote_offers o where o.request_id = q.id), '[]'::jsonb)
  ) order by q.created_at desc), '[]'::jsonb)
  from public.quote_requests q where q.user_id = auth.uid()
$$;

create function public.accept_quote_offer(p_offer_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_q public.quote_requests;
begin
  select q.* into v_q from public.quote_requests q join public.quote_offers o on o.request_id = q.id where o.id = p_offer_id for update of q;
  if v_q.id is null or v_q.user_id <> auth.uid() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_q.status <> 'open' then raise exception 'STATUS_INVALID' using errcode = 'P0001'; end if;
  update public.quote_requests set status = 'accepted', accepted_offer_id = p_offer_id, updated_at = now() where id = v_q.id;
end $$;

create function public.close_quote_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.quote_requests set status = 'closed', updated_at = now()
   where id = p_request_id and user_id = auth.uid() and status = 'open';
  if not found and not exists (select 1 from public.quote_requests where id = p_request_id and user_id = auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Teklif talepleri: işletme tarafı (yetki: record.create — sahip, müdür, usta, tezgâhtar)
-- ---------------------------------------------------------------------
create function public.business_quote_requests(p_business_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_business_perm(p_business_id, 'record.create') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id, 'kind', q.kind, 'category', q.category, 'city', q.city, 'vehicle_label', q.vehicle_label, 'title', q.title,
      'description', q.description, 'part_name', q.part_name, 'status', q.status, 'accepted_offer_id', q.accepted_offer_id,
      'created_at', q.created_at, 'seen', t.seen_at is not null,
      'my_offer', (select private.quote_offer_json(o.id) from public.quote_offers o where o.request_id = q.id and o.business_id = p_business_id),
      'accepted_mine', exists (select 1 from public.quote_offers o where o.id = q.accepted_offer_id and o.business_id = p_business_id),
      'customer_phone', case when exists (select 1 from public.quote_offers o where o.id = q.accepted_offer_id and o.business_id = p_business_id)
                             then (select pr.phone from public.profiles pr where pr.id = q.user_id) end
    ) order by q.created_at desc)
    from public.quote_request_targets t join public.quote_requests q on q.id = t.request_id
    where t.business_id = p_business_id and q.created_at > now() - interval '90 days'
  ), '[]'::jsonb);
end $$;

create function public.mark_quote_seen(p_business_id uuid, p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_business_perm(p_business_id, 'record.create') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.quote_request_targets set seen_at = coalesce(seen_at, now()) where business_id = p_business_id and request_id = p_request_id;
end $$;

-- p: {business_id, request_id, parts_kurus, labor_kurus, part_condition, eta, note}. Talep açıkken güncellenebilir.
create function public.submit_quote_offer(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_biz uuid := (p->>'business_id')::uuid; v_q public.quote_requests; v_id uuid;
begin
  if v_biz is null or not private.has_business_perm(v_biz, 'record.create') or not private.business_writable(v_biz) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_q from public.quote_requests where id = (p->>'request_id')::uuid;
  if v_q.id is null or not exists (select 1 from public.quote_request_targets where request_id = v_q.id and business_id = v_biz) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_q.status <> 'open' then raise exception 'STATUS_INVALID' using errcode = 'P0001'; end if;
  if v_q.kind = 'part' and nullif(p->>'part_condition', '') is null then raise exception 'PART_CONDITION_REQUIRED' using errcode = '22023'; end if;
  insert into public.quote_offers (request_id, business_id, parts_kurus, labor_kurus, part_condition, eta, note, created_by)
  values (v_q.id, v_biz, coalesce((p->>'parts_kurus')::bigint, 0), coalesce((p->>'labor_kurus')::bigint, 0),
          nullif(p->>'part_condition', '')::public.part_condition, nullif(btrim(coalesce(p->>'eta', '')), ''),
          nullif(btrim(coalesce(p->>'note', '')), ''), auth.uid())
  on conflict (request_id, business_id) do update set
    parts_kurus = excluded.parts_kurus, labor_kurus = excluded.labor_kurus, part_condition = excluded.part_condition,
    eta = excluded.eta, note = excluded.note, updated_at = now()
  returning id into v_id;
  update public.quote_request_targets set seen_at = coalesce(seen_at, now()) where business_id = v_biz and request_id = v_q.id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Onaylı yorum
-- ---------------------------------------------------------------------
create function public.add_business_review(p_record_id uuid, p_rating int, p_comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records;
begin
  select * into v_rec from public.service_records where id = p_record_id;
  if v_rec.id is null or v_rec.deleted_at is not null or not private.is_record_customer(p_record_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_rec.status <> 'completed' then raise exception 'NOT_COMPLETED' using errcode = 'P0001'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'RATING_INVALID' using errcode = '22023'; end if;
  insert into public.business_reviews (business_id, user_id, record_id, rating, comment)
  values (v_rec.business_id, auth.uid(), p_record_id, p_rating, nullif(btrim(coalesce(p_comment, '')), ''))
  on conflict (record_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  where public.business_reviews.user_id = auth.uid();
end $$;

create function public.my_review_for_record(p_record_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('rating', r.rating, 'comment', r.comment)
  from public.business_reviews r where r.record_id = p_record_id and r.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Yönetici
-- ---------------------------------------------------------------------
create function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;

create function public.admin_businesses(p_status public.business_status default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'category', b.category, 'city', b.city, 'district', b.district, 'address', b.address,
      'phone', b.phone, 'email', b.email, 'contact_name', b.contact_name, 'tax_office', b.tax_office, 'tax_number', b.tax_number,
      'status', b.status, 'created_at', b.created_at,
      'record_count', (select count(*) from public.service_records r where r.business_id = b.id and r.deleted_at is null)
    ) order by b.created_at desc)
    from public.businesses b
    where b.deleted_at is null and (p_status is null or b.status = p_status)
  ), '[]'::jsonb);
end $$;

create function public.admin_set_business_status(p_business_id uuid, p_status public.business_status) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_status not in ('active', 'suspended', 'pending_verification') then raise exception 'STATUS_INVALID' using errcode = '22023'; end if;
  update public.businesses set status = p_status, updated_at = now() where id = p_business_id and deleted_at is null;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.audit_logs (business_id, table_name, row_id, action, old_values, new_values, actor_user_id)
  values (p_business_id, 'businesses', p_business_id, 'UPDATE', null, jsonb_build_object('status', p_status, 'by', 'admin'), auth.uid());
end $$;

-- Şikâyet edilen forum içeriği (en çok şikâyet alan önce)
create function public.admin_forum_reports() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(x order by (x->>'report_count')::int desc, x->>'last_report_at' desc)
    from (
      select jsonb_build_object(
        'post_id', r.post_id, 'comment_id', r.comment_id,
        'business_name', b.name,
        'text', coalesce(p.title || coalesce(' — ' || nullif(p.body, ''), ''), c.body),
        'deleted', coalesce(p.deleted_at, c.deleted_at) is not null,
        'report_count', count(*), 'last_report_at', max(r.created_at),
        'reasons', jsonb_agg(r.reason) filter (where r.reason is not null)
      ) x
      from public.forum_reports r
      left join public.forum_posts p on p.id = r.post_id
      left join public.forum_comments c on c.id = r.comment_id
      join public.businesses b on b.id = coalesce(p.business_id, c.business_id)
      group by r.post_id, r.comment_id, b.name, p.title, p.body, c.body, p.deleted_at, c.deleted_at
    ) s
  ), '[]'::jsonb);
end $$;

create function public.admin_remove_forum_content(p_post_id uuid, p_comment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_post uuid;
begin
  perform private.require_admin();
  if p_post_id is not null then
    update public.forum_posts set deleted_at = coalesce(deleted_at, now()) where id = p_post_id;
  elsif p_comment_id is not null then
    update public.forum_comments set deleted_at = coalesce(deleted_at, now()) where id = p_comment_id returning post_id into v_post;
    update public.forum_posts p set comment_count = (select count(*) from public.forum_comments c where c.post_id = p.id and c.deleted_at is null)
     where p.id = v_post;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------
revoke execute on function private.public_business_json(uuid), private.quote_offer_json(uuid), private.require_admin() from public;

revoke execute on function public.public_businesses(text, public.business_category, text), public.public_business(uuid),
  public.create_quote_request(jsonb), public.my_quote_requests(), public.accept_quote_offer(uuid), public.close_quote_request(uuid),
  public.business_quote_requests(uuid), public.mark_quote_seen(uuid, uuid), public.submit_quote_offer(jsonb),
  public.add_business_review(uuid, int, text), public.my_review_for_record(uuid),
  public.admin_businesses(public.business_status), public.admin_set_business_status(uuid, public.business_status),
  public.admin_forum_reports(), public.admin_remove_forum_content(uuid, uuid) from public, anon;
grant execute on function public.public_businesses(text, public.business_category, text), public.public_business(uuid),
  public.create_quote_request(jsonb), public.my_quote_requests(), public.accept_quote_offer(uuid), public.close_quote_request(uuid),
  public.business_quote_requests(uuid), public.mark_quote_seen(uuid, uuid), public.submit_quote_offer(jsonb),
  public.add_business_review(uuid, int, text), public.my_review_for_record(uuid),
  public.admin_businesses(public.business_status), public.admin_set_business_status(uuid, public.business_status),
  public.admin_forum_reports(), public.admin_remove_forum_content(uuid, uuid) to authenticated;
