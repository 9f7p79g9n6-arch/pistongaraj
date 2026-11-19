-- İşletmenin servis kayıtlarını tek çağrıda getirir (önceden her kayıt için ayrı istek atılıyordu).
-- Yetki: record.view. Sonuç business_service_record ile aynı biçimde, en yeniden eskiye; p_before ile sayfalanır.
create function public.business_service_records(p_business_id uuid, p_limit int default 200, p_before timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_business_perm(p_business_id, 'record.view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(private.customer_view(r.id) order by r.created_at desc), '[]'::jsonb)
    from (
      select id, created_at from public.service_records
      where business_id = p_business_id and deleted_at is null and (p_before is null or created_at < p_before)
      order by created_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) r
  );
end $$;

revoke execute on function public.business_service_records(uuid, int, timestamptz) from public, anon;
grant execute on function public.business_service_records(uuid, int, timestamptz) to authenticated;
