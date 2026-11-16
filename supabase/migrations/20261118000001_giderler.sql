-- =====================================================================
-- PISTON SERVİS · Sade gider kaydı (tutar, açıklama, tarih)
-- Kurallar:
--   * Giderleri yalnızca expense.manage izni olan (sahip, müdür) görür, ekler, düzenler, siler.
--   * Tutar 0'dan büyük; tarih ileri olamaz; açıklama en fazla 200 karakter.
--   * Silinen ve düzenlenen giderin eski hâli audit_logs'ta kalır.
--   * Aynı istek iki kez gelirse (client_request_id) ikinci gider açılmaz.
-- =====================================================================

-- finance.view: PISTON CİRO ekranını görme (sahip ve müdür). Teknisyen ve danışma göremez.
insert into private.role_permissions (role, permission) values
  ('owner', 'expense.manage'), ('manager', 'expense.manage'),
  ('owner', 'finance.view'), ('manager', 'finance.view');

create table public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  amount_kurus bigint not null check (amount_kurus between 1 and 100000000),
  description text check (char_length(description) <= 200),
  spent_on date not null default private.istanbul_today(),
  client_request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (spent_on >= date '2000-01-01'),
  unique (business_id, client_request_id)
);
create index on public.business_expenses (business_id, spent_on desc);

create function private.expense_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- İleri tarih girilemez (İstanbul saatine göre bugün)
  if new.spent_on > private.istanbul_today() then
    raise exception 'EXPENSE_DATE_FUTURE' using errcode = '22023';
  end if;
  if not private.business_writable(new.business_id) then
    raise exception 'BUSINESS_SUSPENDED' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  new.description := nullif(btrim(new.description), '');
  return new;
end $$;
create trigger business_expenses_guard before insert or update on public.business_expenses
  for each row execute function private.expense_guard();
create trigger business_expenses_audit after insert or update or delete on public.business_expenses
  for each row execute function private.audit();

alter table public.business_expenses enable row level security;
create policy "gider: yetkili görür" on public.business_expenses for select to authenticated
  using (private.has_business_perm(business_id, 'expense.manage'));
create policy "gider: yetkili ekler" on public.business_expenses for insert to authenticated
  with check (private.has_business_perm(business_id, 'expense.manage'));
create policy "gider: yetkili düzenler" on public.business_expenses for update to authenticated
  using (private.has_business_perm(business_id, 'expense.manage')) with check (private.has_business_perm(business_id, 'expense.manage'));
create policy "gider: yetkili siler" on public.business_expenses for delete to authenticated
  using (private.has_business_perm(business_id, 'expense.manage'));

revoke all on public.business_expenses from anon, authenticated;
grant select, delete on public.business_expenses to authenticated;
grant insert (id, business_id, amount_kurus, description, spent_on, client_request_id) on public.business_expenses to authenticated;
grant update (amount_kurus, description, spent_on) on public.business_expenses to authenticated;
grant all on public.business_expenses to service_role;
revoke execute on function private.expense_guard() from public;
