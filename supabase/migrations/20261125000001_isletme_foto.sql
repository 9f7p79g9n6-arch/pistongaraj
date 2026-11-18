-- İşletme fotoğrafı (logo ya da dükkân fotoğrafı): rehberde, işletme sayfasında ve esnaf menüsünde görünür.
--   * Herkese açık klasör "business-photos" (rehberdeki herkes görür); yol: <business_id>/<dosya>.
--   * Yalnızca işletmeyi yönetme yetkisi olan (sahip) yükler/siler; yol businesses.logo_path'e yazılır (sütun izni vardı).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-photos', 'business-photos', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "işletme fotoğrafı: yönetici yükler" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-photos' and private.has_business_perm(private.try_uuid((storage.foldername(name))[1]), 'business.manage'));
create policy "işletme fotoğrafı: yönetici siler" on storage.objects for delete to authenticated
  using (bucket_id = 'business-photos' and private.has_business_perm(private.try_uuid((storage.foldername(name))[1]), 'business.manage'));
create policy "işletme fotoğrafı: herkes görür" on storage.objects for select to authenticated
  using (bucket_id = 'business-photos');

-- Rehber verisine fotoğraf yolu eklenir
create or replace function private.public_business_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'category', b.category, 'city', b.city, 'district', b.district, 'address', b.address,
    'phone', b.phone, 'description', b.description, 'working_hours', b.working_hours, 'logo_path', b.logo_path,
    'rating_avg', (select round(avg(rating)::numeric, 2) from public.business_reviews r where r.business_id = b.id),
    'rating_count', (select count(*) from public.business_reviews r where r.business_id = b.id))
  from public.businesses b where b.id = p_id
$$;

-- logo_path yalnızca kendi klasöründen olabilir
alter table public.businesses add constraint businesses_logo_path_own
  check (logo_path is null or logo_path like id::text || '/%');
