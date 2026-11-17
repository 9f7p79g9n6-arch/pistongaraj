-- İşletme silme (yalnızca sahip, işletme adını yazarak onaylar).
--   * Satırlar fiziksel olarak silinmez: servis ve ödeme kayıtları mali kayıttır, yasal saklama süresi olabilir.
--     İşletme deleted_at ile işaretlenir; erişim kuralları (has_business_perm, işletme görme kuralı) silinmiş işletmeyi
--     tanımadığı için müşteri, araç, kayıt, ödeme ve gider verilerine kimse uygulamadan erişemez.
--   * İşletmenin forum konuları ve yanıtları da silinmiş olarak işaretlenir.
--   * Müşteri, silinen işletmenin kayıtlarını "Servis kayıtlarım"da görmez.
--   * Silinen işletme 3 işletme sınırına sayılmaz.

alter table public.businesses
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null;

create or replace function private.has_business_perm(p_business_id uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m
    join private.role_permissions rp on rp.role = m.role and rp.permission = p_permission
    join public.businesses b on b.id = m.business_id and b.deleted_at is null
    where m.business_id = p_business_id and m.user_id = auth.uid()
  )
$$;

create or replace function private.business_writable(p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses where id = p_business_id and deleted_at is null and status in ('pending_verification', 'active'))
$$;

create or replace function private.is_forum_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members m join public.businesses b on b.id = m.business_id
    where m.user_id = auth.uid() and b.deleted_at is null and b.status in ('pending_verification', 'active')
  )
$$;

drop policy "işletme: üyeleri görür" on public.businesses;
create policy "işletme: üyeleri görür" on public.businesses for select to authenticated
  using (deleted_at is null and exists (select 1 from public.business_members m where m.business_id = id and m.user_id = auth.uid()));

create or replace function public.my_service_records() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.customer_view(r.id) order by r.created_at desc), '[]'::jsonb)
  from public.service_records r
  join public.business_customers c on c.id = r.customer_id
  join public.businesses b on b.id = r.business_id and b.deleted_at is null
  where c.email is not null and c.email = private.my_email() and r.deleted_at is null
$$;

-- 3 işletme sınırı: silinen işletmeler sayılmaz
create or replace function public.create_business(
  p_name text, p_contact_name text, p_phone text, p_email text, p_city text, p_district text, p_address text,
  p_category public.business_category, p_tax_office text, p_tax_number text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_owned int;
begin
  if auth.uid() is null then raise exception 'AUTH' using errcode = '42501'; end if;
  select count(*) into v_owned from public.business_members m join public.businesses b on b.id = m.business_id
   where m.user_id = auth.uid() and m.role = 'owner' and b.deleted_at is null;
  if v_owned >= 3 then raise exception 'BUSINESS_LIMIT' using errcode = 'P0001'; end if;
  insert into public.businesses (created_by, name, contact_name, phone, email, city, district, address, category, tax_office, tax_number)
  values (auth.uid(), btrim(p_name), btrim(p_contact_name), p_phone, nullif(lower(btrim(p_email)), ''), btrim(p_city), btrim(p_district),
          btrim(p_address), p_category, nullif(btrim(p_tax_office), ''), nullif(btrim(p_tax_number), ''))
  returning id into v_id;
  insert into public.business_members (business_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

create function public.delete_business(p_business_id uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_biz public.businesses;
begin
  select * into v_biz from public.businesses where id = p_business_id for update;
  if v_biz.id is null or v_biz.deleted_at is not null
     or not exists (select 1 from public.business_members where business_id = p_business_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_biz.name)) then
    raise exception 'NAME_MISMATCH' using errcode = '22023';
  end if;
  update public.businesses set deleted_at = now(), deleted_by = auth.uid(), updated_at = now() where id = p_business_id;
  insert into public.audit_logs (business_id, table_name, row_id, action, old_values, new_values, actor_user_id)
  values (p_business_id, 'businesses', p_business_id, 'UPDATE', jsonb_build_object('deleted_at', null), jsonb_build_object('deleted_at', now()), auth.uid());

  -- Forum: işletmenin konu ve yanıtları kaldırılır; başka konulardaki yanıt sayıları düzeltilir
  update public.forum_posts set deleted_at = now() where business_id = p_business_id and deleted_at is null;
  update public.forum_comments set deleted_at = now() where business_id = p_business_id and deleted_at is null;
  update public.forum_posts p
     set comment_count = (select count(*) from public.forum_comments c where c.post_id = p.id and c.deleted_at is null)
   where p.id in (select post_id from public.forum_comments where business_id = p_business_id);
end $$;

revoke execute on function public.delete_business(uuid, text) from public, anon;
grant execute on function public.delete_business(uuid, text) to authenticated;
