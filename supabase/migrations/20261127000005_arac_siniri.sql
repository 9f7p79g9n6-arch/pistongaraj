-- İlk sürümde ücretli plan yok: ücretsiz planda araç sınırı 2'den 5'e çıkar (aile araçları sığsın).
-- packages/core/src/plans.ts ile aynı değer.
create or replace function private.vehicles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.plan_tier;
  v_limit int;
  v_count int;
  v_max_recorded int;
begin
  if new.model_year > extract(year from now())::int + 1 then
    raise exception 'MODEL_YEAR_INVALID' using errcode = '22023';
  end if;

  -- Araç sınırı: yeni araç ya da arşivden geri alma
  if tg_op = 'INSERT' or (old.archived_at is not null and new.archived_at is null) then
    select plan into v_plan from public.profiles where id = new.owner_id;
    v_limit := case coalesce(v_plan, 'free') when 'plus' then 50 else 5 end;
    select count(*) into v_count from public.vehicles
      where owner_id = new.owner_id and archived_at is null and id <> new.id;
    if v_count >= v_limit then
      raise exception 'VEHICLE_LIMIT' using errcode = 'P0001', hint = v_limit::text;
    end if;
  end if;

  -- Kilometre, geçmişte kayıtlı en yüksek değerin altına inemez (yanlış girişi düzeltmeye izin verir)
  if tg_op = 'UPDATE' and new.odometer_km < old.odometer_km then
    select greatest(
      (select max(odometer_km) from public.fuel_records where vehicle_id = new.id),
      (select max(odometer_km) from public.maintenance_events where vehicle_id = new.id)
    ) into v_max_recorded;
    if v_max_recorded is not null and new.odometer_km < v_max_recorded then
      raise exception 'ODOMETER_BELOW_HISTORY' using errcode = 'P0001', hint = v_max_recorded::text;
    end if;
  end if;
  return new;
end $$;
