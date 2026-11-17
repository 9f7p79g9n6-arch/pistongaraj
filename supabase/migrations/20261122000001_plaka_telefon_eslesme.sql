-- Servis kaydının araç sahibine düşmesi: e-postaya ek olarak PLAKA + TELEFON eşleşmesi.
--   Kayıt, oturum açan kullanıcıya şu iki yoldan biriyle görünür:
--   1) İşletmenin müşteri kartındaki e-posta = kullanıcının giriş e-postası (önceden vardı), ya da
--   2) İşletmenin müşteri kartındaki telefon = kullanıcının profilindeki telefon VE
--      kaydın aracının plakası = kullanıcının garajındaki (arşivlenmemiş) bir aracın plakası.
--   Yalnızca plaka yeterli DEĞİL: plaka herkesin görebildiği bir bilgidir; tek başına kayıt, tutar ve
--   müşteri telefonunu yabancıya açar (KVKK). Telefon şimdilik SMS ile doğrulanmıyor (bkz. eksikler listesi).

alter table public.profiles
  add column phone text check (phone is null or phone ~ '^\+90[2-5][0-9]{9}$');
grant update (phone) on public.profiles to authenticated;

-- Plaka karşılaştırması boşluktan bağımsız ("34 ABC 123" = "34ABC123")
create function private.plate_key(p text) returns text
language sql immutable as $$ select upper(replace(coalesce(p, ''), ' ', '')) $$;

-- Kullanıcı bu müşteri telefonu + bu işletme aracı için kayıt sahibi mi (yol 2)
create function private.phone_plate_match(p_customer_phone text, p_business_vehicle_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_customer_phone is not null
     and exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.phone = p_customer_phone)
     and exists (
       select 1 from public.vehicles v, public.business_vehicles bv
       where bv.id = p_business_vehicle_id and v.owner_id = auth.uid() and v.archived_at is null
         and v.plate is not null and private.plate_key(v.plate) = private.plate_key(bv.plate)
     )
$$;

create or replace function private.is_record_customer(p_record_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_records r
    join public.business_customers c on c.id = r.customer_id
    where r.id = p_record_id
      and ((c.email is not null and c.email = private.my_email()) or private.phone_plate_match(c.phone, r.vehicle_id))
  )
$$;

create or replace function public.my_service_records() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.customer_view(r.id) order by r.created_at desc), '[]'::jsonb)
  from public.service_records r
  join public.business_customers c on c.id = r.customer_id
  join public.businesses b on b.id = r.business_id and b.deleted_at is null
  where r.deleted_at is null
    and ((c.email is not null and c.email = private.my_email()) or private.phone_plate_match(c.phone, r.vehicle_id))
$$;

revoke execute on function private.phone_plate_match(text, uuid), private.plate_key(text) from public;
grant execute on function private.phone_plate_match(text, uuid), private.plate_key(text) to authenticated;
