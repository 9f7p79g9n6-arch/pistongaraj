-- =====================================================================
-- PISTON SERVİS · Tahsilat ve alacak (borç) takibi
-- Kurallar:
--   * Ödeme yalnızca add_service_payment ile eklenir; kalan borçtan fazlası alınamaz.
--   * Ödeme silinmez ve değiştirilmez; yanlış ödeme void_service_payment ile sebebi yazılarak iptal edilir.
--   * Aynı istek iki kez gelirse (client_request_id) ikinci ödeme açılmaz.
--   * Her ödeme ve iptal audit_logs'a yazılır. Müşteri kendi kaydındaki ödemeleri görür.
-- =====================================================================

create type public.payment_method as enum ('cash', 'card', 'transfer', 'other');

insert into private.role_permissions (role, permission) values
  ('owner', 'payment.manage'), ('manager', 'payment.manage'), ('front_desk', 'payment.manage');

create table public.service_payments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null,
  business_id uuid not null,
  amount_kurus bigint not null check (amount_kurus between 1 and 100000000),
  method public.payment_method not null,
  paid_at timestamptz not null default now(),
  note text check (char_length(note) <= 200),
  client_request_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text check (char_length(void_reason) <= 200),
  check ((voided_at is null) = (void_reason is null)),
  unique (business_id, client_request_id),
  foreign key (business_id, record_id) references public.service_records (business_id, id)
);
create index on public.service_payments (record_id);
create index on public.service_payments (business_id, paid_at desc);

create trigger service_payments_audit after insert or update or delete on public.service_payments
  for each row execute function private.audit();
create trigger service_payments_no_delete before delete on public.service_payments
  for each row execute function private.forbid_delete();

create function public.add_service_payment(
  p_record_id uuid, p_amount_kurus bigint, p_method public.payment_method, p_paid_at timestamptz, p_note text, p_client_request_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records; v_paid bigint; v_id uuid;
begin
  select * into v_rec from public.service_records where id = p_record_id for update;
  if v_rec.id is null or not private.has_business_perm(v_rec.business_id, 'payment.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not private.business_writable(v_rec.business_id) then raise exception 'BUSINESS_SUSPENDED' using errcode = 'P0001'; end if;
  if p_client_request_id is null then raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023'; end if;
  select id into v_id from public.service_payments where business_id = v_rec.business_id and client_request_id = p_client_request_id;
  if v_id is not null then return v_id; end if;
  if p_paid_at is not null and p_paid_at > now() + interval '1 hour' then raise exception 'PAID_AT_FUTURE' using errcode = '22023'; end if;
  select coalesce(sum(amount_kurus), 0) into v_paid from public.service_payments where record_id = p_record_id and voided_at is null;
  if p_amount_kurus is null or p_amount_kurus <= 0 or v_paid + p_amount_kurus > v_rec.grand_kurus then
    raise exception 'OVERPAYMENT' using errcode = 'P0001';
  end if;
  insert into public.service_payments (record_id, business_id, amount_kurus, method, paid_at, note, client_request_id, created_by)
  values (p_record_id, v_rec.business_id, p_amount_kurus, p_method, coalesce(p_paid_at, now()), nullif(btrim(p_note), ''), p_client_request_id, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.void_service_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_pay public.service_payments;
begin
  select * into v_pay from public.service_payments where id = p_payment_id for update;
  if v_pay.id is null or not private.has_business_perm(v_pay.business_id, 'payment.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_pay.voided_at is not null then raise exception 'ALREADY_VOIDED' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
  update public.service_payments set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = p_payment_id;
end $$;

-- Müşteri ve işletme görünümüne ödemeler eklenir (önceki alanlar aynen korunur)
create or replace function private.customer_view(p_record_id uuid) returns jsonb
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
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', h.status, 'actor', h.actor, 'created_at', h.created_at) order by h.id) from public.service_status_history h where h.record_id = r.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'amount_kurus', p.amount_kurus, 'method', p.method, 'paid_at', p.paid_at, 'note', p.note, 'voided_at', p.voided_at, 'void_reason', p.void_reason) order by p.paid_at) from public.service_payments p where p.record_id = r.id), '[]'::jsonb)
  )
  from public.service_records r
  join public.businesses b on b.id = r.business_id
  join public.business_customers c on c.id = r.customer_id
  join public.business_vehicles v on v.id = r.vehicle_id
  where r.id = p_record_id
$$;
revoke execute on function private.customer_view(uuid) from public;

alter table public.service_payments enable row level security;
create policy "ödeme: işletme görür" on public.service_payments for select to authenticated
  using (private.has_business_perm(business_id, 'record.view'));

revoke all on public.service_payments from anon, authenticated;
grant select on public.service_payments to authenticated;
grant all on public.service_payments to service_role;

revoke execute on function public.add_service_payment(uuid, bigint, public.payment_method, timestamptz, text, uuid),
  public.void_service_payment(uuid, text) from public, anon;
grant execute on function public.add_service_payment(uuid, bigint, public.payment_method, timestamptz, text, uuid),
  public.void_service_payment(uuid, text) to authenticated;
