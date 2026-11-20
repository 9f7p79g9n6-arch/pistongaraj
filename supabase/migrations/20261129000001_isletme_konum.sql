-- İşletme konumu: sahip/yönetici dükkândayken telefonun konumunu kaydeder; araç sahipleri "Yol tarifi" ile
-- haritada tam o noktaya yönlendirilir. Konum yoksa yol tarifi açık adresle aranır.
--   * Enlem ve boylam birlikte dolu ya da birlikte boş olmalı; Türkiye ve çevresi dışındaki değerler reddedilir.
--   * Güncelleme izni mevcut "işletme: yönetici günceller" kuralına tabidir (yalnızca işletmeyi yöneten).

alter table public.businesses
  add column latitude double precision,
  add column longitude double precision;

alter table public.businesses add constraint businesses_location_pair
  check ((latitude is null) = (longitude is null));
alter table public.businesses add constraint businesses_location_range
  check (latitude is null or (latitude between 34 and 44 and longitude between 24 and 47));

grant update (latitude, longitude) on public.businesses to authenticated;

-- Rehber verisine konum eklenir
create or replace function private.public_business_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'category', b.category, 'city', b.city, 'district', b.district, 'address', b.address,
    'phone', b.phone, 'description', b.description, 'working_hours', b.working_hours, 'logo_path', b.logo_path,
    'latitude', b.latitude, 'longitude', b.longitude,
    'rating_avg', (select round(avg(rating)::numeric, 2) from public.business_reviews r where r.business_id = b.id),
    'rating_count', (select count(*) from public.business_reviews r where r.business_id = b.id))
  from public.businesses b where b.id = p_id
$$;
