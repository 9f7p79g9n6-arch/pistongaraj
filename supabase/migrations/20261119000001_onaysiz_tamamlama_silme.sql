-- PISTON SERVİS: müşteri onayı zorunlu değil + kayıt silme
--   * İşletme "Ücret alındı" deyince açık kayıt her durumdan tamamlanır (ciroya girer).
--     Müşteri isterse yine onaylar ya da itiraz eder; bu artık tamamlamanın şartı değil.
--   * Kayıt silme: satır fiziksel olarak silinmez (denetim için saklanır); deleted_at ile listelerden,
--     müşteri görünümünden ve rapordan çıkar. Alınmış (iptal edilmemiş) ödemesi olan kayıt silinemez.
--   * Yetki: record.delete (sahip, yönetici).

insert into private.role_permissions (role, permission) values
  ('owner', 'record.delete'), ('manager', 'record.delete');

alter table public.service_records
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null,
  add column delete_reason text check (char_length(delete_reason) <= 500);

-- Silinen kayıt artık değiştirilemez (düzenleme, tamamlama, müşteri yanıtı)
create function private.forbid_deleted_record_change() returns trigger
language plpgsql as $$
begin
  if old.deleted_at is not null then raise exception 'RECORD_DELETED' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger service_records_deleted_locked before update on public.service_records
  for each row execute function private.forbid_deleted_record_change();

-- Silinen kayda ödeme ya da dosya eklenemez
create function private.forbid_child_of_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.service_records where id = new.record_id and deleted_at is not null) then
    raise exception 'RECORD_DELETED' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger service_payments_record_alive before insert on public.service_payments
  for each row execute function private.forbid_child_of_deleted();
create trigger service_files_record_alive before insert on public.service_files
  for each row execute function private.forbid_child_of_deleted();

create or replace function public.complete_service_record(p_record_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records;
begin
  select * into v_rec from public.service_records where id = p_record_id for update;
  if v_rec.id is null or not private.has_business_perm(v_rec.business_id, 'record.complete') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_rec.deleted_at is not null then raise exception 'RECORD_DELETED' using errcode = 'P0001'; end if;
  if v_rec.status = 'completed' then raise exception 'STATUS_INVALID' using errcode = 'P0001'; end if;
  update public.service_records set status = 'completed', completed_at = now(), updated_by = auth.uid(), updated_at = now() where id = p_record_id;
  insert into public.service_status_history (record_id, status, actor, actor_user_id) values (p_record_id, 'completed', 'business', auth.uid());
end $$;

create function public.delete_service_record(p_record_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records;
begin
  select * into v_rec from public.service_records where id = p_record_id for update;
  if v_rec.id is null or not private.has_business_perm(v_rec.business_id, 'record.delete') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_rec.deleted_at is not null then return; end if;
  if exists (select 1 from public.service_payments where record_id = p_record_id and voided_at is null) then
    raise exception 'HAS_PAYMENTS' using errcode = 'P0001';
  end if;
  update public.service_records
     set deleted_at = now(), deleted_by = auth.uid(), delete_reason = nullif(btrim(p_reason), ''), updated_by = auth.uid(), updated_at = now()
   where id = p_record_id;
end $$;

-- Müşteri silinen kayıtları görmez
create or replace function public.my_service_records() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.customer_view(r.id) order by r.created_at desc), '[]'::jsonb)
  from public.service_records r
  join public.business_customers c on c.id = r.customer_id
  where c.email is not null and c.email = private.my_email() and r.deleted_at is null
$$;

revoke execute on function public.delete_service_record(uuid, text) from public, anon;
grant execute on function public.delete_service_record(uuid, text) to authenticated;
revoke execute on function private.forbid_child_of_deleted() from public;
