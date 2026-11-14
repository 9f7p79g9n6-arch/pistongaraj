-- =====================================================================
-- PISTON GARAGE · Aşama 1: üyelik, garaj, bakım, yakıt ve masraf
-- Kurallar:
--   * Her kullanıcı tablosunda RLS açık; erişim yalnızca sahibine.
--   * Kullanıcının değiştirmemesi gereken sütunlar (plan, vin_masked, owner_id) sütun izinleriyle kapalı.
--   * Şasi numarası düz metin olarak tutulmaz; private şemada şifreli saklanır.
--   * Bakım durumu hesabı public.compute_due ile yapılır ve packages/core/computeDue ile aynı sonucu verir.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Türler
-- ---------------------------------------------------------------------
create type public.vehicle_type as enum ('car', 'commercial', 'motorcycle');
create type public.fuel_type as enum ('gasoline', 'diesel', 'lpg', 'gasoline_lpg', 'hybrid', 'plugin_hybrid', 'electric');
create type public.transmission_type as enum ('manual', 'automatic', 'dct', 'cvt');
create type public.rule_kind as enum ('interval', 'due_date');
create type public.interval_source as enum ('user', 'service', 'manufacturer_verified', 'legal', 'seasonal');
create type public.expense_category as enum ('maintenance', 'repair', 'insurance', 'inspection', 'tax', 'parking', 'toll', 'wash', 'fine', 'other');
create type public.energy_unit as enum ('L', 'kWh');
create type public.app_role as enum ('admin', 'moderator', 'support');
create type public.plan_tier as enum ('free', 'plus');
create type public.document_kind as enum ('registration', 'insurance', 'invoice', 'receipt', 'photo', 'other');
create type public.consent_type as enum ('kvkk_notice', 'marketing', 'analytics', 'vin_processing');

-- ---------------------------------------------------------------------
-- Ortak yardımcılar
-- ---------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function private.istanbul_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Istanbul')::date
$$;

-- ---------------------------------------------------------------------
-- Profiller ve roller
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  city text check (char_length(city) <= 40),
  district text check (char_length(district) <= 40),
  plan public.plan_tier not null default 'free',
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r)
$$;

create function private.is_service() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.role() = 'service_role', false)
$$;

-- ---------------------------------------------------------------------
-- Araç kataloğu (uyumluluğun temeli; yalnızca yönetici yazar)
-- ---------------------------------------------------------------------
create table public.vehicle_makes (
  id int generated always as identity primary key,
  name text not null unique,
  vehicle_types public.vehicle_type[] not null default '{car}'
);
create table public.vehicle_models (
  id int generated always as identity primary key,
  make_id int not null references public.vehicle_makes (id) on delete cascade,
  name text not null,
  unique (make_id, name)
);
create table public.vehicle_generations (
  id int generated always as identity primary key,
  model_id int not null references public.vehicle_models (id) on delete cascade,
  name text not null,
  year_from smallint not null,
  year_to smallint,
  check (year_to is null or year_to >= year_from)
);
create table public.vehicle_variants (
  id int generated always as identity primary key,
  generation_id int not null references public.vehicle_generations (id) on delete cascade,
  engine_label text not null,
  engine_code text,
  fuel public.fuel_type not null,
  power_ps smallint,
  transmission public.transmission_type
);
create index on public.vehicle_models (make_id);
create index on public.vehicle_generations (model_id);
create index on public.vehicle_variants (generation_id);

-- ---------------------------------------------------------------------
-- Araçlar
-- ---------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_type public.vehicle_type not null default 'car',
  make text not null check (char_length(make) between 1 and 40),
  model text not null check (char_length(model) between 1 and 60),
  variant_id int references public.vehicle_variants (id) on delete set null,
  model_year smallint not null check (model_year >= 1950),
  engine_label text check (char_length(engine_label) <= 60),
  fuel_type public.fuel_type not null,
  transmission public.transmission_type not null,
  odometer_km integer not null check (odometer_km between 0 and 2000000),
  plate text check (plate ~ '^[0-9]{2} [A-Z]{1,3} [0-9]{2,4}$'),
  vin_masked text,
  photo_path text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vehicles_owner_active on public.vehicles (owner_id) where archived_at is null;
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function private.set_updated_at();

create function private.vehicles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.plan_tier;
  v_limit int;
  v_count int;
  v_max_recorded int;
begin
  if new.model_year > extract(year from now())::int + 1 then
    raise exception 'MODEL_YEAR_INVALID' using errcode = '22023';
  end if;

  -- Araç sınırı: yeni araç ya da arşivden geri alma
  if tg_op = 'INSERT' or (old.archived_at is not null and new.archived_at is null) then
    select plan into v_plan from public.profiles where id = new.owner_id;
    v_limit := case coalesce(v_plan, 'free') when 'plus' then 50 else 2 end;
    select count(*) into v_count from public.vehicles
      where owner_id = new.owner_id and archived_at is null and id <> new.id;
    if v_count >= v_limit then
      raise exception 'VEHICLE_LIMIT' using errcode = 'P0001', hint = v_limit::text;
    end if;
  end if;

  -- Kilometre, geçmişte kayıtlı en yüksek değerin altına inemez (yanlış girişi düzeltmeye izin verir)
  if tg_op = 'UPDATE' and new.odometer_km < old.odometer_km then
    select greatest(
      (select max(odometer_km) from public.fuel_records where vehicle_id = new.id),
      (select max(odometer_km) from public.maintenance_events where vehicle_id = new.id)
    ) into v_max_recorded;
    if v_max_recorded is not null and new.odometer_km < v_max_recorded then
      raise exception 'ODOMETER_BELOW_HISTORY' using errcode = 'P0001', hint = v_max_recorded::text;
    end if;
  end if;
  return new;
end $$;
create trigger vehicles_guard before insert or update on public.vehicles
  for each row execute function private.vehicles_guard();

create function private.owns_vehicle(p_vehicle_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vehicles where id = p_vehicle_id and owner_id = auth.uid())
$$;

-- Araç kilometresini kayıtlarla ileri taşır (geri götürmez)
create function private.bump_odometer(p_vehicle_id uuid, p_km int) returns void
language sql security definer set search_path = '' as $$
  update public.vehicles set odometer_km = p_km
  where id = p_vehicle_id and p_km is not null and odometer_km < p_km
$$;

-- ---------------------------------------------------------------------
-- Şasi numarası (şifreli)
-- Anahtar Supabase Vault'ta "vin_encryption_key" adıyla tutulur.
-- ---------------------------------------------------------------------
create table private.vehicle_vins (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  vin_cipher bytea not null,
  vin_hmac text not null,
  updated_at timestamptz not null default now()
);
create index on private.vehicle_vins (vin_hmac);

create function private.vin_key() returns text
language plpgsql stable security definer set search_path = '' as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'vin_encryption_key' limit 1;
  if k is null or length(k) < 32 then
    raise exception 'VIN_KEY_MISSING' using errcode = 'P0001';
  end if;
  return k;
end $$;
revoke all on function private.vin_key() from public, authenticated;

create function public.set_vehicle_vin(p_vehicle_id uuid, p_vin text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_vin text := upper(regexp_replace(coalesce(p_vin, ''), '[\s-]', '', 'g'));
  v_masked text;
  v_key text;
begin
  if not private.owns_vehicle(p_vehicle_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_vin = '' then
    delete from private.vehicle_vins where vehicle_id = p_vehicle_id;
    update public.vehicles set vin_masked = null where id = p_vehicle_id;
    return null;
  end if;
  if v_vin !~ '^[A-HJ-NPR-Z0-9]{17}$' then
    raise exception 'VIN_INVALID' using errcode = '22023';
  end if;
  v_key := private.vin_key();
  v_masked := left(v_vin, 3) || repeat('•', 10) || right(v_vin, 4);
  insert into private.vehicle_vins (vehicle_id, vin_cipher, vin_hmac)
  values (p_vehicle_id, extensions.pgp_sym_encrypt(v_vin, v_key),
          encode(extensions.hmac(v_vin, v_key, 'sha256'), 'hex'))
  on conflict (vehicle_id) do update
    set vin_cipher = excluded.vin_cipher, vin_hmac = excluded.vin_hmac, updated_at = now();
  update public.vehicles set vin_masked = v_masked where id = p_vehicle_id;
  return v_masked;
end $$;

create function public.get_vehicle_vin(p_vehicle_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_cipher bytea;
begin
  if not private.owns_vehicle(p_vehicle_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select vin_cipher into v_cipher from private.vehicle_vins where vehicle_id = p_vehicle_id;
  if v_cipher is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_cipher, private.vin_key());
end $$;

-- ---------------------------------------------------------------------
-- Belgeler (fatura, fiş, ruhsat). Dosyalar Storage'da "<user_id>/..." altında.
-- ---------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete cascade,
  kind public.document_kind not null,
  title text check (char_length(title) <= 120),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes int not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = owner_id::text)
);
create index on public.documents (owner_id);
create index on public.documents (vehicle_id);

-- ---------------------------------------------------------------------
-- Bakım kuralları (hatırlatmalar) ve yapılan işlemler
-- ---------------------------------------------------------------------
create table public.maintenance_rules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  item_key text not null check (char_length(item_key) <= 40),
  title text not null check (char_length(title) between 1 and 80),
  kind public.rule_kind not null default 'interval',
  every_km int check (every_km between 500 and 500000),
  every_months smallint check (every_months between 1 and 240),
  last_done_km int check (last_done_km >= 0),
  last_done_on date,
  due_on date,
  source public.interval_source not null default 'user',
  remind_before_km int not null default 1500 check (remind_before_km between 0 and 50000),
  remind_before_days smallint not null default 30 check (remind_before_days between 0 and 365),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'interval' or every_km is not null or every_months is not null),
  check (kind <> 'due_date' or due_on is not null)
);
create index on public.maintenance_rules (vehicle_id);
create trigger maintenance_rules_updated_at before update on public.maintenance_rules
  for each row execute function private.set_updated_at();

-- "Üretici (doğrulanmış)" etiketi yalnızca lisanslı katalogdan, sunucu tarafında atanabilir
create function private.rules_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.source = 'manufacturer_verified'
     and (tg_op = 'INSERT' or old.source is distinct from new.source)
     and not (private.is_service() or public.has_role('admin')) then
    raise exception 'SOURCE_NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Kullanıcı aralığı değiştirirse doğrulanmış etiket düşer
  if tg_op = 'UPDATE' and old.source = 'manufacturer_verified'
     and (new.every_km is distinct from old.every_km or new.every_months is distinct from old.every_months)
     and not (private.is_service() or public.has_role('admin')) then
    new.source := 'user';
  end if;
  return new;
end $$;
create trigger maintenance_rules_guard before insert or update on public.maintenance_rules
  for each row execute function private.rules_guard();

create table public.maintenance_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  rule_id uuid references public.maintenance_rules (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  performed_on date not null,
  odometer_km int check (odometer_km between 0 and 2000000),
  cost numeric(12, 2) check (cost >= 0),
  performed_by text check (char_length(performed_by) <= 120),
  notes text check (char_length(notes) <= 2000),
  document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.maintenance_events (vehicle_id, performed_on desc);

create function private.after_maintenance_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.rule_id is not null then
    update public.maintenance_rules r
       set last_done_km = case when new.odometer_km is not null and (r.last_done_km is null or new.odometer_km >= r.last_done_km)
                               then new.odometer_km else r.last_done_km end,
           last_done_on = case when r.last_done_on is null or new.performed_on >= r.last_done_on
                               then new.performed_on else r.last_done_on end
     where r.id = new.rule_id and r.vehicle_id = new.vehicle_id;
  end if;
  perform private.bump_odometer(new.vehicle_id, new.odometer_km);
  return new;
end $$;
create trigger maintenance_events_after after insert on public.maintenance_events
  for each row execute function private.after_maintenance_event();

-- ---------------------------------------------------------------------
-- Yakıt ve masraf
-- ---------------------------------------------------------------------
create table public.fuel_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  filled_on date not null,
  odometer_km int not null check (odometer_km between 1 and 2000000),
  quantity numeric(8, 2) not null check (quantity > 0 and quantity <= 250),
  unit public.energy_unit not null default 'L',
  unit_price numeric(10, 3) not null check (unit_price > 0 and unit_price <= 1000),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  is_full_tank boolean not null default true,
  fuel_type public.fuel_type not null,
  station text check (char_length(station) <= 80),
  document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.fuel_records (vehicle_id, odometer_km);

create function private.after_fuel_record() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump_odometer(new.vehicle_id, new.odometer_km);
  return new;
end $$;
create trigger fuel_records_after after insert on public.fuel_records
  for each row execute function private.after_fuel_record();

create table public.expense_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  category public.expense_category not null,
  amount numeric(12, 2) not null check (amount > 0),
  spent_on date not null,
  note text check (char_length(note) <= 500),
  document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.expense_records (vehicle_id, spent_on desc);

-- ---------------------------------------------------------------------
-- Bildirimler, cihaz anahtarları, KVKK izinleri
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.device_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index on public.device_tokens (user_id);

-- Cihaz başka bir hesaba geçtiyse anahtarı yeni kullanıcıya taşır
create function public.register_device_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  insert into public.device_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;

-- Ekle-oku (append-only): izin geçmişi değiştirilemez, geri çekme yeni satırla yapılır
create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  consent public.consent_type not null,
  granted boolean not null,
  text_version text not null,
  created_at timestamptz not null default now()
);
create index on public.consents (user_id, consent, created_at desc);

-- ---------------------------------------------------------------------
-- Bakım durumu: packages/core computeDue ile birebir aynı mantık
-- ---------------------------------------------------------------------
create function public.compute_due(
  p_kind public.rule_kind, p_every_km int, p_every_months int, p_last_km int, p_last_on date,
  p_due_on date, p_remind_km int, p_remind_days int, p_odometer int, p_today date,
  out next_due_km int, out next_due_on date, out km_left int, out days_left int, out status text)
language plpgsql immutable set search_path = '' as $$
begin
  if p_kind = 'due_date' then
    next_due_on := p_due_on;
  else
    if p_every_km is not null and p_last_km is not null then
      next_due_km := p_last_km + p_every_km;
    end if;
    if p_every_months is not null and p_last_on is not null then
      next_due_on := (p_last_on + make_interval(months => p_every_months))::date;
    end if;
  end if;
  km_left := next_due_km - p_odometer;
  days_left := next_due_on - p_today;
  status := case
    when km_left is null and days_left is null then 'unknown'
    when km_left < 0 or days_left < 0 then 'overdue'
    when km_left <= p_remind_km or days_left <= p_remind_days then 'due_soon'
    else 'ok' end;
end $$;

create view public.maintenance_due with (security_invoker = true) as
select r.id as rule_id, r.vehicle_id, v.owner_id, r.title, r.item_key, r.source, r.enabled,
       v.make, v.model, v.odometer_km, d.next_due_km, d.next_due_on, d.km_left, d.days_left, d.status
from public.maintenance_rules r
join public.vehicles v on v.id = r.vehicle_id and v.archived_at is null
cross join lateral public.compute_due(r.kind, r.every_km, r.every_months, r.last_done_km, r.last_done_on,
                                      r.due_on, r.remind_before_km, r.remind_before_days, v.odometer_km,
                                      private.istanbul_today()) d;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.vehicle_makes enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.vehicle_generations enable row level security;
alter table public.vehicle_variants enable row level security;
alter table public.vehicles enable row level security;
alter table public.documents enable row level security;
alter table public.maintenance_rules enable row level security;
alter table public.maintenance_events enable row level security;
alter table public.fuel_records enable row level security;
alter table public.expense_records enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.consents enable row level security;
alter table private.vehicle_vins enable row level security; -- politika yok: yalnızca security definer fonksiyonlar

create policy "profil: kendi" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profil: kendi güncelle" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "roller: kendi" on public.user_roles for select to authenticated using (user_id = auth.uid());

create policy "katalog: herkes okur" on public.vehicle_makes for select to anon, authenticated using (true);
create policy "katalog: herkes okur" on public.vehicle_models for select to anon, authenticated using (true);
create policy "katalog: herkes okur" on public.vehicle_generations for select to anon, authenticated using (true);
create policy "katalog: herkes okur" on public.vehicle_variants for select to anon, authenticated using (true);
create policy "katalog: yönetici yazar" on public.vehicle_makes for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "katalog: yönetici yazar" on public.vehicle_models for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "katalog: yönetici yazar" on public.vehicle_generations for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "katalog: yönetici yazar" on public.vehicle_variants for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "araç: sahibi" on public.vehicles for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "belge: sahibi" on public.documents for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (vehicle_id is null or private.owns_vehicle(vehicle_id)));

create policy "bakım kuralı: araç sahibi" on public.maintenance_rules for all to authenticated
  using (private.owns_vehicle(vehicle_id)) with check (private.owns_vehicle(vehicle_id));
create policy "bakım işlemi: araç sahibi" on public.maintenance_events for all to authenticated
  using (private.owns_vehicle(vehicle_id)) with check (private.owns_vehicle(vehicle_id));
create policy "yakıt: araç sahibi" on public.fuel_records for all to authenticated
  using (private.owns_vehicle(vehicle_id)) with check (private.owns_vehicle(vehicle_id));
create policy "masraf: araç sahibi" on public.expense_records for all to authenticated
  using (private.owns_vehicle(vehicle_id)) with check (private.owns_vehicle(vehicle_id));

create policy "bildirim: kendi" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "bildirim: okundu" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "cihaz: kendi" on public.device_tokens for select to authenticated using (user_id = auth.uid());
create policy "cihaz: kendi sil" on public.device_tokens for delete to authenticated using (user_id = auth.uid());

create policy "izin: kendi okur" on public.consents for select to authenticated using (user_id = auth.uid());
create policy "izin: kendi ekler" on public.consents for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Tablo ve sütun izinleri (varsayılan geniş izinlere güvenmeden açıkça)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

grant select on public.vehicle_makes, public.vehicle_models, public.vehicle_generations, public.vehicle_variants to anon, authenticated;
grant insert, update, delete on public.vehicle_makes, public.vehicle_models, public.vehicle_generations, public.vehicle_variants to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, city, district) on public.profiles to authenticated;

grant select on public.user_roles to authenticated;

grant select, delete on public.vehicles to authenticated;
grant insert (id, vehicle_type, make, model, variant_id, model_year, engine_label, fuel_type, transmission, odometer_km, plate, photo_path)
  on public.vehicles to authenticated;
grant update (vehicle_type, make, model, variant_id, model_year, engine_label, fuel_type, transmission, odometer_km, plate, photo_path, archived_at)
  on public.vehicles to authenticated;

grant select, insert, update, delete on public.documents, public.maintenance_rules, public.maintenance_events,
  public.fuel_records, public.expense_records to authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, delete on public.device_tokens to authenticated;
grant select, insert on public.consents to authenticated;
grant select on public.maintenance_due to authenticated;

grant all on all tables in schema public to service_role;
grant all on all tables in schema private to service_role;

-- Fonksiyonlar: yalnızca gerekenler dışarı açık
revoke execute on all functions in schema private from public;
grant execute on function private.owns_vehicle(uuid) to authenticated;
grant execute on function private.is_service() to authenticated, service_role;
grant execute on function private.istanbul_today() to authenticated, service_role;
revoke execute on function public.set_vehicle_vin(uuid, text) from public, anon;
revoke execute on function public.get_vehicle_vin(uuid) from public, anon;
revoke execute on function public.register_device_token(text, text) from public, anon;
grant execute on function public.set_vehicle_vin(uuid, text), public.get_vehicle_vin(uuid),
  public.register_device_token(text, text) to authenticated;
