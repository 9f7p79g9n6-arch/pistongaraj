-- =====================================================================
-- Yapay zekâ özellikleri: kullanım kotası ve açık rıza türü
-- Fotoğraflar saklanmaz; yalnızca kullanım sayısı tutulur.
-- =====================================================================

-- Fotoğrafın yurt dışındaki yapay zekâ hizmetine gönderilmesi için ayrı izin (KVKK md. 9)
alter type public.consent_type add value if not exists 'ai_processing';

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('warning_light')),
  created_at timestamptz not null default now()
);
create index ai_usage_user_feature_time on public.ai_usage (user_id, feature, created_at desc);

alter table public.ai_usage enable row level security;
create policy "ai kullanımı: kendi" on public.ai_usage for select to authenticated using (user_id = auth.uid());
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;

-- Son 30 gündeki kullanım ve plana göre sınır. Uygulama "kalan hak" göstermek için, sunucu fonksiyonu sınırı uygulamak için kullanır.
create function public.ai_quota(p_feature text, p_user uuid default null)
returns table (used int, monthly_limit int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_plan public.plan_tier;
begin
  -- Başka kullanıcının kotası yalnızca servis rolüyle sorgulanabilir
  if p_user is not null and p_user is distinct from auth.uid() and not private.is_service() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select plan into v_plan from public.profiles where id = v_user;
  return query
    select (select count(*)::int from public.ai_usage
              where user_id = v_user and feature = p_feature and created_at > now() - interval '30 days'),
           case coalesce(v_plan, 'free') when 'plus' then 100 else 10 end;
end $$;
revoke execute on function public.ai_quota(text, uuid) from public, anon;
grant execute on function public.ai_quota(text, uuid) to authenticated, service_role;
