-- =====================================================================
-- Trafik cezası takibi. Süreler tebliğ tarihinden işler (2918 s. KTK md. 115):
-- 15 gün içinde %25 indirimli, bir ay içinde normal ödeme.
-- =====================================================================
create table public.traffic_fines (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  fine_date date not null,
  notified_on date not null,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 1000000),
  description text check (char_length(description) <= 200),
  paid_on date,
  paid_amount numeric(12, 2) check (paid_amount >= 0),
  -- Ödemede oluşturulan masraf kaydı (yıllık giderlere girsin diye); ceza silinirse masraf kalır
  expense_id uuid references public.expense_records (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  check (notified_on >= fine_date),
  check ((paid_on is null) = (paid_amount is null))
);
create index on public.traffic_fines (vehicle_id, notified_on desc);

alter table public.traffic_fines enable row level security;
create policy "ceza: araç sahibi" on public.traffic_fines for all to authenticated
  using (private.owns_vehicle(vehicle_id)) with check (private.owns_vehicle(vehicle_id));
revoke all on public.traffic_fines from anon, authenticated;
grant select, insert, update, delete on public.traffic_fines to authenticated;
grant all on public.traffic_fines to service_role;

-- Bildirim için: ödenmemiş cezaların indirim ve ödeme son günleri (core/fineInfo ile aynı kural)
create view public.fine_due with (security_invoker = true) as
select f.id as fine_id, f.vehicle_id, v.owner_id, v.make, v.model, f.amount, f.notified_on,
       (f.notified_on + 15) as discount_until,
       (f.notified_on + interval '1 month')::date as due_on,
       (f.notified_on + 15) - private.istanbul_today() as days_left_for_discount
from public.traffic_fines f
join public.vehicles v on v.id = f.vehicle_id and v.archived_at is null
where f.paid_on is null;
grant select on public.fine_due to authenticated, service_role;
