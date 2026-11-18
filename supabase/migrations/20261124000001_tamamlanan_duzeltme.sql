-- Tamamlanan servis kaydı da düzeltilebilir (esnaf "Kaydı düzelt").
--   * Kayıt "tamamlandı" olarak kalır; tamamlanma tarihi değişmez, ciro ve borç yeni tutarla hesaplanır.
--   * Eski hâli denetim kaydında (audit_logs) saklanır; sürüm numarası artar.
--   * Silinen kayıt yine değiştirilemez (service_records_deleted_locked tetikleyicisi).

create or replace function public.save_service_record(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_biz uuid := (p->>'business_id')::uuid;
  v_cust uuid := (p->>'customer_id')::uuid;
  v_veh uuid := (p->>'vehicle_id')::uuid;
  v_req uuid := (p->>'client_request_id')::uuid;
  v_items jsonb := coalesce(p->'items', '[]'::jsonb);
  v_rec public.service_records;
  v_next public.service_status;
  v_count int;
  v_i int := 0;
  v_item jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH' using errcode = '42501'; end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 50 then raise exception 'ITEMS_TOO_MANY' using errcode = '22023'; end if;

  if v_id is null then
    -- Yeni kayıt
    if not private.has_business_perm(v_biz, 'record.create') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    if not private.business_writable(v_biz) then raise exception 'BUSINESS_SUSPENDED' using errcode = 'P0001'; end if;
    if v_req is null then raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023'; end if;
    select id into v_id from public.service_records where business_id = v_biz and client_request_id = v_req;
    if v_id is not null then return v_id; end if;
    select count(*) into v_count from public.service_records where business_id = v_biz and created_at > now() - interval '1 day';
    if v_count >= 300 then raise exception 'RATE_LIMIT' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.business_vehicles where id = v_veh and business_id = v_biz and customer_id = v_cust) then
      raise exception 'VEHICLE_CUSTOMER_MISMATCH' using errcode = '22023';
    end if;
    insert into public.service_records (business_id, customer_id, vehicle_id, intake_at, odometer_km, complaint, initial_note,
      fuel_level, existing_damage, vat_rate, client_request_id, created_by, updated_by)
    values (v_biz, v_cust, v_veh, coalesce((p->>'intake_at')::timestamptz, now()), (p->>'odometer_km')::int, btrim(p->>'complaint'),
      nullif(btrim(p->>'initial_note'), ''), nullif(p->>'fuel_level', '')::public.fuel_level, nullif(btrim(p->>'existing_damage'), ''),
      nullif(p->>'vat_rate', '')::smallint, v_req, auth.uid(), auth.uid())
    returning * into v_rec;
    insert into public.service_status_history (record_id, status, actor, actor_user_id) values (v_rec.id, 'awaiting_approval', 'business', auth.uid());
  else
    -- Düzenleme: onaylı/itirazlı kayıt yeniden onaya gider; tamamlanan kayıt tamamlanmış kalır (ciro ve borç yeni tutarla hesaplanır)
    select * into v_rec from public.service_records where id = v_id for update;
    if v_rec.id is null or not private.has_business_perm(v_rec.business_id, 'record.edit') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if not private.business_writable(v_rec.business_id) then raise exception 'BUSINESS_SUSPENDED' using errcode = 'P0001'; end if;
    v_next := case v_rec.status
      when 'awaiting_approval' then 'awaiting_approval'::public.service_status
      when 'revised' then 'revised'::public.service_status
      when 'approved' then 'revised'::public.service_status
      when 'objected' then 'revised'::public.service_status
      when 'completed' then 'completed'::public.service_status
      else null end;
    if v_next is null then raise exception 'RECORD_LOCKED' using errcode = 'P0001'; end if;
    update public.service_records set
      intake_at = coalesce((p->>'intake_at')::timestamptz, intake_at),
      odometer_km = (p->>'odometer_km')::int,
      complaint = btrim(p->>'complaint'),
      initial_note = nullif(btrim(p->>'initial_note'), ''),
      fuel_level = nullif(p->>'fuel_level', '')::public.fuel_level,
      existing_damage = nullif(btrim(p->>'existing_damage'), ''),
      vat_rate = nullif(p->>'vat_rate', '')::smallint,
      status = v_next,
      approval_version = approval_version + 1,
      approved_at = case when v_next = 'completed' then approved_at else null end,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_id
    returning * into v_rec;
    if v_next <> (select status from public.service_status_history where record_id = v_id order by id desc limit 1) then
      insert into public.service_status_history (record_id, status, actor, actor_user_id) values (v_id, v_next, 'business', auth.uid());
    end if;
    delete from public.service_record_items where record_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    insert into public.service_record_items (record_id, business_id, position, title, description, part_name, part_qty,
      part_unit_kurus, labor_kurus, discount_kurus)
    values (v_rec.id, v_rec.business_id, v_i, btrim(v_item->>'title'), nullif(btrim(v_item->>'description'), ''),
      nullif(btrim(v_item->>'part_name'), ''), coalesce((v_item->>'part_qty')::int, 0), coalesce((v_item->>'part_unit_kurus')::bigint, 0),
      coalesce((v_item->>'labor_kurus')::bigint, 0), coalesce((v_item->>'discount_kurus')::bigint, 0));
    v_i := v_i + 1;
  end loop;
  perform private.recompute_totals(v_rec.id);

  update public.business_vehicles set last_odometer_km = greatest(coalesce(last_odometer_km, 0), v_rec.odometer_km)
   where id = v_rec.vehicle_id;
  return v_rec.id;
end $$;
