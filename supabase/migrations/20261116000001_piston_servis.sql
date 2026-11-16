-- =====================================================================
-- PISTON SERVİS · Aşama 1: işletme, müşteri, araç, servis kaydı, müşteri onayı
-- Kurallar:
--   * Her ticari tabloda business_id var; erişim private.has_business_perm ile (RLS).
--   * Servis kaydı ve kalemleri yalnızca fonksiyonlarla yazılır (tek işlem, sunucuda doğrulama ve tutar hesabı).
--   * Müşteri tablolara hiç erişmez; kendi kayıtlarını yalnızca my_service_records / respond_to_service_record ile görür ve yanıtlar.
--   * Servis kaydı, onay ve itiraz satırları silinmez. Her değişiklik audit_logs'a yazılır.
--   * Tutarlar kuruş (bigint). Hesap packages/core/src/service.ts → computeServiceTotals ile aynıdır.
-- =====================================================================

create type public.business_category as enum ('private_service', 'mechanic', 'auto_electric', 'body_paint', 'tire', 'auto_ac', 'spare_parts', 'appraisal', 'other');
create type public.business_status as enum ('incomplete', 'pending_verification', 'active', 'suspended');
create type public.business_role as enum ('owner', 'manager', 'technician', 'front_desk');
create type public.service_status as enum ('awaiting_approval', 'approved', 'objected', 'revised', 'completed');
create type public.fuel_level as enum ('empty', 'quarter', 'half', 'three_quarters', 'full');
create type public.service_file_kind as enum ('intake', 'replaced_part', 'work', 'document');

-- ---------------------------------------------------------------------
-- İşletme ve üyeler
-- ---------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  contact_name text not null check (char_length(btrim(contact_name)) between 3 and 60),
  phone text not null check (phone ~ '^\+90[2-5][0-9]{9}$'),
  email text check (email is null or (char_length(email) <= 120 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and email = lower(email))),
  city text not null check (char_length(btrim(city)) between 2 and 40),
  district text not null check (char_length(btrim(district)) between 2 and 40),
  address text not null check (char_length(btrim(address)) between 5 and 240),
  category public.business_category not null,
  tax_office text check (char_length(tax_office) <= 60),
  tax_number text check (tax_number ~ '^[0-9]{10,11}$'),
  logo_path text,
  status public.business_status not null default 'pending_verification',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger businesses_updated_at before update on public.businesses
  for each row execute function private.set_updated_at();

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.business_role not null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on public.business_members (user_id);

-- Rol → izin. packages/core ROLE_PERMISSIONS ile aynı olmalı (servis testi karşılaştırır).
create table private.role_permissions (
  role public.business_role not null,
  permission text not null,
  primary key (role, permission)
);
insert into private.role_permissions (role, permission) values
  ('owner', 'business.manage'), ('owner', 'member.manage'), ('owner', 'customer.manage'), ('owner', 'record.view'),
  ('owner', 'record.create'), ('owner', 'record.edit'), ('owner', 'record.complete'),
  ('manager', 'customer.manage'), ('manager', 'record.view'), ('manager', 'record.create'), ('manager', 'record.edit'), ('manager', 'record.complete'),
  ('technician', 'record.view'), ('technician', 'record.create'), ('technician', 'record.edit'),
  ('front_desk', 'customer.manage'), ('front_desk', 'record.view'), ('front_desk', 'record.create');

create function private.has_business_perm(p_business_id uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    join private.role_permissions rp on rp.role = m.role and rp.permission = p_permission
    where m.business_id = p_business_id and m.user_id = auth.uid()
  )
$$;

create function private.business_writable(p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses where id = p_business_id and status in ('pending_verification', 'active'))
$$;

-- İşletme açma: işletme ve sahip üyeliği tek işlemde. Durum sunucuda atanır.
create function public.create_business(
  p_name text, p_contact_name text, p_phone text, p_email text, p_city text, p_district text, p_address text,
  p_category public.business_category, p_tax_office text, p_tax_number text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_owned int;
begin
  if auth.uid() is null then raise exception 'AUTH' using errcode = '42501'; end if;
  select count(*) into v_owned from public.business_members where user_id = auth.uid() and role = 'owner';
  if v_owned >= 3 then raise exception 'BUSINESS_LIMIT' using errcode = 'P0001'; end if;
  insert into public.businesses (created_by, name, contact_name, phone, email, city, district, address, category, tax_office, tax_number)
  values (auth.uid(), btrim(p_name), btrim(p_contact_name), p_phone, nullif(lower(btrim(p_email)), ''), btrim(p_city), btrim(p_district),
          btrim(p_address), p_category, nullif(btrim(p_tax_office), ''), nullif(btrim(p_tax_number), ''))
  returning id into v_id;
  insert into public.business_members (business_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- İşletmenin müşterileri ve araçları (yalnızca o işletmeye ait)
-- ---------------------------------------------------------------------
create table public.business_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 3 and 80),
  phone text not null check (phone ~ '^\+90[2-5][0-9]{9}$'),
  email text check (email is null or (char_length(email) <= 120 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and email = lower(email))),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone),
  unique (business_id, id)
);
create index on public.business_customers (email) where email is not null;
create trigger business_customers_updated_at before update on public.business_customers
  for each row execute function private.set_updated_at();

create table public.business_vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid,
  plate text not null check (plate ~ '^[0-9]{2} [A-Z]{1,3} [0-9]{2,4}$'),
  make text not null check (char_length(btrim(make)) between 1 and 40),
  model text not null check (char_length(btrim(model)) between 1 and 60),
  model_year smallint check (model_year between 1950 and 2100),
  engine_label text check (char_length(engine_label) <= 60),
  last_odometer_km integer check (last_odometer_km between 0 and 2000000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, plate),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.business_customers (business_id, id)
);
create trigger business_vehicles_updated_at before update on public.business_vehicles
  for each row execute function private.set_updated_at();

-- Askıya alınmış işletme yeni müşteri/araç ekleyemez
create function private.business_write_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.business_writable(new.business_id) then
    raise exception 'BUSINESS_SUSPENDED' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger business_customers_guard before insert or update on public.business_customers
  for each row execute function private.business_write_guard();
create trigger business_vehicles_guard before insert or update on public.business_vehicles
  for each row execute function private.business_write_guard();

-- ---------------------------------------------------------------------
-- Servis kaydı
-- ---------------------------------------------------------------------
create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  customer_id uuid not null,
  vehicle_id uuid not null,
  status public.service_status not null default 'awaiting_approval',
  approval_version integer not null default 1 check (approval_version >= 1),
  intake_at timestamptz not null,
  odometer_km integer not null check (odometer_km between 0 and 2000000),
  complaint text not null check (char_length(btrim(complaint)) between 2 and 1000),
  initial_note text check (char_length(initial_note) <= 1000),
  fuel_level public.fuel_level,
  existing_damage text check (char_length(existing_damage) <= 1000),
  vat_rate smallint check (vat_rate between 0 and 100),
  parts_kurus bigint not null default 0 check (parts_kurus >= 0),
  labor_kurus bigint not null default 0 check (labor_kurus >= 0),
  discount_kurus bigint not null default 0 check (discount_kurus >= 0),
  vat_kurus bigint not null default 0 check (vat_kurus >= 0),
  grand_kurus bigint not null default 0 check (grand_kurus >= 0),
  client_request_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz,
  unique (business_id, client_request_id),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.business_customers (business_id, id),
  foreign key (business_id, vehicle_id) references public.business_vehicles (business_id, id)
);
create index on public.service_records (business_id, created_at desc);
create index on public.service_records (customer_id);

create table public.service_record_items (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null,
  business_id uuid not null,
  position smallint not null check (position between 0 and 49),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text check (char_length(description) <= 500),
  part_name text check (char_length(part_name) <= 120),
  part_qty integer not null default 0 check (part_qty between 0 and 999),
  part_unit_kurus bigint not null default 0 check (part_unit_kurus between 0 and 100000000),
  labor_kurus bigint not null default 0 check (labor_kurus between 0 and 100000000),
  discount_kurus bigint not null default 0 check (discount_kurus between 0 and 100000000),
  check (discount_kurus <= part_qty * part_unit_kurus + labor_kurus),
  check (part_qty = 0 or char_length(btrim(coalesce(part_name, ''))) > 0),
  foreign key (business_id, record_id) references public.service_records (business_id, id) on delete cascade
);
create index on public.service_record_items (record_id);

create table public.service_files (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null,
  business_id uuid not null,
  kind public.service_file_kind not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (storage_path like business_id::text || '/' || record_id::text || '/%'),
  foreign key (business_id, record_id) references public.service_records (business_id, id)
);

create table public.service_approvals (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.service_records (id) on delete restrict,
  version integer not null,
  action text not null check (action in ('approved', 'objected')),
  reason text check (char_length(reason) <= 1000),
  via text not null default 'app' check (via in ('app', 'link')),
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (action = 'approved' or char_length(btrim(coalesce(reason, ''))) >= 5)
);
create index on public.service_approvals (record_id);

create table public.service_status_history (
  id bigint generated always as identity primary key,
  record_id uuid not null references public.service_records (id) on delete restrict,
  status public.service_status not null,
  actor text not null check (actor in ('business', 'customer')),
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.service_status_history (record_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (business_id, created_at desc);
create index on public.audit_logs (row_id);

-- Denetim: istemci bu tabloya yazamaz; yalnızca tetikleyici yazar
create function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_row uuid; v_biz uuid;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
  v_biz := coalesce((v_new->>'business_id')::uuid, (v_old->>'business_id')::uuid);
  if tg_op = 'UPDATE' and v_old = v_new then return new; end if;
  insert into public.audit_logs (business_id, table_name, row_id, action, old_values, new_values, actor_user_id)
  values (v_biz, tg_table_name, v_row, tg_op, v_old, v_new, auth.uid());
  return coalesce(new, old);
end $$;
create trigger service_records_audit after insert or update or delete on public.service_records
  for each row execute function private.audit();
create trigger service_record_items_audit after insert or update or delete on public.service_record_items
  for each row execute function private.audit();
create trigger business_customers_audit after insert or update or delete on public.business_customers
  for each row execute function private.audit();
create trigger business_vehicles_audit after insert or update or delete on public.business_vehicles
  for each row execute function private.audit();

-- Servis kaydı ve onaylar silinmez (işletme silinse bile kayıt korunur: on delete restrict)
create function private.forbid_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'DELETE_FORBIDDEN' using errcode = 'P0001';
end $$;
create trigger service_records_no_delete before delete on public.service_records
  for each row execute function private.forbid_delete();
create trigger service_approvals_no_delete before delete or update on public.service_approvals
  for each row execute function private.forbid_delete();
create trigger service_status_history_no_change before delete or update on public.service_status_history
  for each row execute function private.forbid_delete();

-- Tutar hesabı (packages/core computeServiceTotals ile aynı)
create function private.recompute_totals(p_record_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_parts bigint; v_labor bigint; v_disc bigint; v_rate smallint; v_net bigint; v_vat bigint;
begin
  select coalesce(sum(part_qty * part_unit_kurus), 0), coalesce(sum(labor_kurus), 0),
         coalesce(sum(least(discount_kurus, part_qty * part_unit_kurus + labor_kurus)), 0)
    into v_parts, v_labor, v_disc
    from public.service_record_items where record_id = p_record_id;
  select vat_rate into v_rate from public.service_records where id = p_record_id;
  v_net := v_parts + v_labor - v_disc;
  v_vat := case when v_rate is null then 0 else round(v_net * v_rate / 100.0)::bigint end;
  update public.service_records
     set parts_kurus = v_parts, labor_kurus = v_labor, discount_kurus = v_disc, vat_kurus = v_vat, grand_kurus = v_net + v_vat
   where id = p_record_id;
end $$;

-- Servis kaydı oluşturma ve düzenleme: kayıt + kalemler tek işlemde.
-- Aynı client_request_id ile ikinci istek yeni kayıt açmaz (internet kesilip tekrar gönderilirse).
create function public.save_service_record(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_biz uuid := (p->>'business_id')::uuid;
  v_cust uuid := (p->>'customer_id')::uuid;
  v_veh uuid := (p->>'vehicle_id')::uuid;
  v_req uuid := (p->>'client_request_id')::uuid;
  v_items jsonb := coalesce(p->'items', '[]'::jsonb);
  v_rec public.service_records;
  v_next public.service_status;
  v_count int;
  v_i int := 0;
  v_item jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH' using errcode = '42501'; end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 50 then raise exception 'ITEMS_TOO_MANY' using errcode = '22023'; end if;

  if v_id is null then
    -- Yeni kayıt
    if not private.has_business_perm(v_biz, 'record.create') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    if not private.business_writable(v_biz) then raise exception 'BUSINESS_SUSPENDED' using errcode = 'P0001'; end if;
    if v_req is null then raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023'; end if;
    select id into v_id from public.service_records where business_id = v_biz and client_request_id = v_req;
    if v_id is not null then return v_id; end if;
    select count(*) into v_count from public.service_records where business_id = v_biz and created_at > now() - interval '1 day';
    if v_count >= 300 then raise exception 'RATE_LIMIT' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.business_vehicles where id = v_veh and business_id = v_biz and customer_id = v_cust) then
      raise exception 'VEHICLE_CUSTOMER_MISMATCH' using errcode = '22023';
    end if;
    insert into public.service_records (business_id, customer_id, vehicle_id, intake_at, odometer_km, complaint, initial_note,
      fuel_level, existing_damage, vat_rate, client_request_id, created_by, updated_by)
    values (v_biz, v_cust, v_veh, coalesce((p->>'intake_at')::timestamptz, now()), (p->>'odometer_km')::int, btrim(p->>'complaint'),
      nullif(btrim(p->>'initial_note'), ''), nullif(p->>'fuel_level', '')::public.fuel_level, nullif(btrim(p->>'existing_damage'), ''),
      nullif(p->>'vat_rate', '')::smallint, v_req, auth.uid(), auth.uid())
    returning * into v_rec;
    insert into public.service_status_history (record_id, status, actor, actor_user_id) values (v_rec.id, 'awaiting_approval', 'business', auth.uid());
  else
    -- Düzenleme: onaylı/itirazlı kayıt yeniden onaya gider; tamamlanan kayıt değişmez
    select * into v_rec from public.service_records where id = v_id for update;
    if v_rec.id is null or not private.has_business_perm(v_rec.business_id, 'record.edit') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if not private.business_writable(v_rec.business_id) then raise exception 'BUSINESS_SUSPENDED' using errcode = 'P0001'; end if;
    v_next := case v_rec.status
      when 'awaiting_approval' then 'awaiting_approval'::public.service_status
      when 'revised' then 'revised'::public.service_status
      when 'approved' then 'revised'::public.service_status
      when 'objected' then 'revised'::public.service_status
      else null end;
    if v_next is null then raise exception 'RECORD_LOCKED' using errcode = 'P0001'; end if;
    update public.service_records set
      intake_at = coalesce((p->>'intake_at')::timestamptz, intake_at),
      odometer_km = (p->>'odometer_km')::int,
      complaint = btrim(p->>'complaint'),
      initial_note = nullif(btrim(p->>'initial_note'), ''),
      fuel_level = nullif(p->>'fuel_level', '')::public.fuel_level,
      existing_damage = nullif(btrim(p->>'existing_damage'), ''),
      vat_rate = nullif(p->>'vat_rate', '')::smallint,
      status = v_next,
      approval_version = approval_version + 1,
      approved_at = null,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_id
    returning * into v_rec;
    if v_next <> (select status from public.service_status_history where record_id = v_id order by id desc limit 1) then
      insert into public.service_status_history (record_id, status, actor, actor_user_id) values (v_id, v_next, 'business', auth.uid());
    end if;
    delete from public.service_record_items where record_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    insert into public.service_record_items (record_id, business_id, position, title, description, part_name, part_qty,
      part_unit_kurus, labor_kurus, discount_kurus)
    values (v_rec.id, v_rec.business_id, v_i, btrim(v_item->>'title'), nullif(btrim(v_item->>'description'), ''),
      nullif(btrim(v_item->>'part_name'), ''), coalesce((v_item->>'part_qty')::int, 0), coalesce((v_item->>'part_unit_kurus')::bigint, 0),
      coalesce((v_item->>'labor_kurus')::bigint, 0), coalesce((v_item->>'discount_kurus')::bigint, 0));
    v_i := v_i + 1;
  end loop;
  perform private.recompute_totals(v_rec.id);

  update public.business_vehicles set last_odometer_km = greatest(coalesce(last_odometer_km, 0), v_rec.odometer_km)
   where id = v_rec.vehicle_id;
  return v_rec.id;
end $$;

create function public.complete_service_record(p_record_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records;
begin
  select * into v_rec from public.service_records where id = p_record_id for update;
  if v_rec.id is null or not private.has_business_perm(v_rec.business_id, 'record.complete') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_rec.status <> 'approved' then raise exception 'STATUS_INVALID' using errcode = 'P0001'; end if;
  update public.service_records set status = 'completed', completed_at = now(), updated_by = auth.uid(), updated_at = now() where id = p_record_id;
  insert into public.service_status_history (record_id, status, actor, actor_user_id) values (p_record_id, 'completed', 'business', auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- Müşteri tarafı. Eşleşme: işletmenin müşteri kaydındaki e-posta = oturum açan kullanıcının e-postası
-- (giriş e-posta koduyla yapıldığı için adresin sahibi doğrulanmıştır). Telefonla eşleşme Aşama 2'de.
-- ---------------------------------------------------------------------
create function private.my_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid()
$$;

create function private.is_record_customer(p_record_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_records r
    join public.business_customers c on c.id = r.customer_id
    where r.id = p_record_id and c.email is not null and c.email = private.my_email()
  )
$$;

-- Müşteriye gösterilecek alanlar (işletmenin iç notları, başka müşteriler, denetim kaydı gösterilmez)
create function private.customer_view(p_record_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'status', r.status, 'approval_version', r.approval_version,
    'business_id', b.id, 'business_name', b.name, 'business_verified', b.status = 'active',
    'customer_id', c.id, 'customer_name', c.full_name, 'customer_phone', c.phone,
    'vehicle_id', v.id, 'plate', v.plate, 'vehicle_label', btrim(v.make || ' ' || v.model || coalesce(' ' || v.model_year, '')),
    'intake_at', r.intake_at, 'odometer_km', r.odometer_km, 'complaint', r.complaint, 'initial_note', r.initial_note,
    'fuel_level', r.fuel_level, 'existing_damage', r.existing_damage, 'vat_rate', r.vat_rate,
    'parts_kurus', r.parts_kurus, 'labor_kurus', r.labor_kurus, 'discount_kurus', r.discount_kurus,
    'vat_kurus', r.vat_kurus, 'grand_kurus', r.grand_kurus,
    'created_at', r.created_at, 'updated_at', r.updated_at, 'approved_at', r.approved_at,
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'business_id' - 'record_id' order by i.position) from public.service_record_items i where i.record_id = r.id), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'storage_path', f.storage_path, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes) order by f.created_at) from public.service_files f where f.record_id = r.id), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'version', a.version, 'action', a.action, 'reason', a.reason, 'via', a.via, 'created_at', a.created_at) order by a.created_at) from public.service_approvals a where a.record_id = r.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', h.status, 'actor', h.actor, 'created_at', h.created_at) order by h.id) from public.service_status_history h where h.record_id = r.id), '[]'::jsonb)
  )
  from public.service_records r
  join public.businesses b on b.id = r.business_id
  join public.business_customers c on c.id = r.customer_id
  join public.business_vehicles v on v.id = r.vehicle_id
  where r.id = p_record_id
$$;

create function public.my_service_records() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.customer_view(r.id) order by r.created_at desc), '[]'::jsonb)
  from public.service_records r
  join public.business_customers c on c.id = r.customer_id
  where c.email is not null and c.email = private.my_email()
$$;

-- İşletme tarafı aynı görünümü kullanır (yetki: record.view)
create function public.business_service_record(p_record_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_biz uuid;
begin
  select business_id into v_biz from public.service_records where id = p_record_id;
  if v_biz is null or not private.has_business_perm(v_biz, 'record.view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return private.customer_view(p_record_id);
end $$;

create function public.respond_to_service_record(p_record_id uuid, p_version int, p_action text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records; v_next public.service_status;
begin
  if auth.uid() is null or not private.is_record_customer(p_record_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_rec from public.service_records where id = p_record_id for update;
  if v_rec.status not in ('awaiting_approval', 'revised') then raise exception 'STATUS_INVALID' using errcode = 'P0001'; end if;
  if v_rec.approval_version <> p_version then raise exception 'VERSION_CHANGED' using errcode = 'P0001'; end if;
  if p_action = 'approved' then v_next := 'approved';
  elsif p_action = 'objected' then
    if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
    v_next := 'objected';
  else raise exception 'ACTION_INVALID' using errcode = '22023';
  end if;
  insert into public.service_approvals (record_id, version, action, reason, via, actor_user_id)
  values (p_record_id, p_version, p_action, nullif(btrim(p_reason), ''), 'app', auth.uid());
  update public.service_records set status = v_next, approved_at = case when v_next = 'approved' then now() else null end
   where id = p_record_id;
  insert into public.service_status_history (record_id, status, actor, actor_user_id) values (p_record_id, v_next, 'customer', auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table private.role_permissions enable row level security; -- politika yok: yalnızca security definer fonksiyonlar okur
alter table public.business_customers enable row level security;
alter table public.business_vehicles enable row level security;
alter table public.service_records enable row level security;
alter table public.service_record_items enable row level security;
alter table public.service_files enable row level security;
alter table public.service_approvals enable row level security;
alter table public.service_status_history enable row level security;
alter table public.audit_logs enable row level security;

create policy "işletme: üyeleri görür" on public.businesses for select to authenticated
  using (exists (select 1 from public.business_members m where m.business_id = id and m.user_id = auth.uid()));
create policy "işletme: yönetici günceller" on public.businesses for update to authenticated
  using (private.has_business_perm(id, 'business.manage')) with check (private.has_business_perm(id, 'business.manage'));

create policy "üyelik: kendi" on public.business_members for select to authenticated
  using (user_id = auth.uid() or private.has_business_perm(business_id, 'member.manage'));

create policy "müşteri: görüntüle" on public.business_customers for select to authenticated
  using (private.has_business_perm(business_id, 'record.view') or private.has_business_perm(business_id, 'customer.manage'));
create policy "müşteri: ekle" on public.business_customers for insert to authenticated
  with check (private.has_business_perm(business_id, 'customer.manage') or private.has_business_perm(business_id, 'record.create'));
create policy "müşteri: güncelle" on public.business_customers for update to authenticated
  using (private.has_business_perm(business_id, 'customer.manage')) with check (private.has_business_perm(business_id, 'customer.manage'));

create policy "araç: görüntüle" on public.business_vehicles for select to authenticated
  using (private.has_business_perm(business_id, 'record.view'));
create policy "araç: ekle" on public.business_vehicles for insert to authenticated
  with check (private.has_business_perm(business_id, 'customer.manage') or private.has_business_perm(business_id, 'record.create'));
create policy "araç: güncelle" on public.business_vehicles for update to authenticated
  using (private.has_business_perm(business_id, 'record.edit') or private.has_business_perm(business_id, 'customer.manage'))
  with check (private.has_business_perm(business_id, 'record.edit') or private.has_business_perm(business_id, 'customer.manage'));

create policy "servis kaydı: görüntüle" on public.service_records for select to authenticated
  using (private.has_business_perm(business_id, 'record.view'));
create policy "kalem: görüntüle" on public.service_record_items for select to authenticated
  using (private.has_business_perm(business_id, 'record.view'));
create policy "dosya kaydı: görüntüle" on public.service_files for select to authenticated
  using (private.has_business_perm(business_id, 'record.view'));
create policy "dosya kaydı: ekle" on public.service_files for insert to authenticated
  with check (private.has_business_perm(business_id, 'record.edit') or private.has_business_perm(business_id, 'record.create'));
create policy "onay: işletme görür" on public.service_approvals for select to authenticated
  using (exists (select 1 from public.service_records r where r.id = record_id and private.has_business_perm(r.business_id, 'record.view')));
create policy "durum geçmişi: işletme görür" on public.service_status_history for select to authenticated
  using (exists (select 1 from public.service_records r where r.id = record_id and private.has_business_perm(r.business_id, 'record.view')));
create policy "denetim: yönetici görür" on public.audit_logs for select to authenticated
  using (business_id is not null and private.has_business_perm(business_id, 'business.manage'));

-- ---------------------------------------------------------------------
-- İzinler (Supabase'in varsayılan geniş izinleri daraltılır)
-- ---------------------------------------------------------------------
revoke all on public.businesses, public.business_members, public.business_customers, public.business_vehicles,
  public.service_records, public.service_record_items, public.service_files, public.service_approvals,
  public.service_status_history, public.audit_logs from anon, authenticated;
revoke all on private.role_permissions from anon, authenticated;

grant select on public.businesses to authenticated;
grant update (name, contact_name, phone, email, city, district, address, category, tax_office, tax_number, logo_path) on public.businesses to authenticated;
grant select on public.business_members to authenticated;
grant select on public.business_customers to authenticated;
grant insert (id, business_id, full_name, phone, email) on public.business_customers to authenticated;
grant update (full_name, phone, email) on public.business_customers to authenticated;
grant select on public.business_vehicles to authenticated;
grant insert (id, business_id, customer_id, plate, make, model, model_year, engine_label, last_odometer_km) on public.business_vehicles to authenticated;
grant update (customer_id, make, model, model_year, engine_label) on public.business_vehicles to authenticated;
grant select on public.service_records, public.service_record_items, public.service_approvals, public.service_status_history, public.audit_logs to authenticated;
grant select on public.service_files to authenticated;
grant insert (id, record_id, business_id, kind, storage_path, mime_type, size_bytes) on public.service_files to authenticated;

grant all on public.businesses, public.business_members, public.business_customers, public.business_vehicles,
  public.service_records, public.service_record_items, public.service_files, public.service_approvals,
  public.service_status_history, public.audit_logs to service_role;
grant all on private.role_permissions to service_role;

revoke execute on function private.has_business_perm(uuid, text), private.business_writable(uuid), private.business_write_guard(),
  private.audit(), private.forbid_delete(), private.recompute_totals(uuid), private.my_email(), private.is_record_customer(uuid),
  private.customer_view(uuid) from public;
grant execute on function private.has_business_perm(uuid, text), private.business_writable(uuid), private.is_record_customer(uuid) to authenticated;

revoke execute on function public.create_business(text, text, text, text, text, text, text, public.business_category, text, text),
  public.save_service_record(jsonb), public.complete_service_record(uuid), public.my_service_records(),
  public.business_service_record(uuid), public.respond_to_service_record(uuid, int, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text, text, text, text, public.business_category, text, text),
  public.save_service_record(jsonb), public.complete_service_record(uuid), public.my_service_records(),
  public.business_service_record(uuid), public.respond_to_service_record(uuid, int, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: servis fotoğrafları ve belgeleri. Yol: <business_id>/<record_id>/<dosya>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-files', 'service-files', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create function private.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;
grant execute on function private.try_uuid(text) to authenticated;

create policy "servis dosyası: işletme okur" on storage.objects for select to authenticated
  using (bucket_id = 'service-files' and (
    private.has_business_perm(private.try_uuid((storage.foldername(name))[1]), 'record.view')
    or private.is_record_customer(private.try_uuid((storage.foldername(name))[2]))));
create policy "servis dosyası: işletme yükler" on storage.objects for insert to authenticated
  with check (bucket_id = 'service-files' and (
    private.has_business_perm(private.try_uuid((storage.foldername(name))[1]), 'record.create')
    or private.has_business_perm(private.try_uuid((storage.foldername(name))[1]), 'record.edit')));
