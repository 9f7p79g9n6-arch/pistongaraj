-- =====================================================================
-- Servis kaydının araç sahibine bağlanması: KAYIT KODU
--
-- Önceki yöntem (plaka + profildeki telefon) kaldırıldı: telefon SMS ile doğrulanmadığı için
-- başkasının telefonunu ve plakasını yazan biri o kişinin servis kayıtlarını görebiliyordu.
--
-- Yeni yöntem:
--   * Her servis kaydı için 8 karakterlik bir kod üretilir (işletme ister).
--   * İşletme kodu müşteriye WhatsApp mesajı ya da PDF ile iletir (müşterinin kendi numarası).
--   * Müşteri kodu uygulamaya girer; kayıt hesabına bağlanır. Kod başkası tarafından bir daha kullanılamaz.
--   * Yanlış deneme: kullanıcı başına saatte 10. Fazlası reddedilir (tahminle kod bulmayı engeller).
--   * İşletme kodu sıfırlayabilir: eski kod geçersiz olur, kayda bağlı hesap çıkarılır (yanlış kişiye gittiyse).
--   * E-posta eşleşmesi (girişte kodla doğrulanan e-posta) aynen kalır.
--
-- profiles.phone kalır: teklif kabul edilince işletmenin müşteriye ulaşması için kullanılıyor; eşleşmede kullanılmaz.
-- =====================================================================

create table private.service_record_codes (
  record_id uuid primary key references public.service_records (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.service_record_owners (
  record_id uuid primary key references public.service_records (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);
create index on public.service_record_owners (user_id);
alter table public.service_record_owners enable row level security;
-- Doğrudan erişim yok; yalnızca aşağıdaki fonksiyonlar
revoke all on public.service_record_owners from anon, authenticated;
grant all on public.service_record_owners to service_role;

create table private.service_claim_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index on private.service_claim_failures (user_id, at desc);

-- Okunabilir 8 karakter: 0/O ve 1/I yok
create function private.new_claim_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  c text;
  i int;
begin
  loop
    b := extensions.gen_random_bytes(8);
    c := '';
    for i in 0..7 loop
      c := c || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from private.service_record_codes where code = c);
  end loop;
  return c;
end $$;

-- "k7mp-3xqa", "K7MP 3XQA" → "K7MP3XQA"
create function private.normalize_claim_code(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- İşletme: kaydın kodunu verir (yoksa üretir). Kayıt silinmişse ya da işletme üyesi değilse reddedilir.
create function public.service_record_claim_code(p_record_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records; v_code text;
begin
  select * into v_rec from public.service_records where id = p_record_id;
  if v_rec.id is null or v_rec.deleted_at is not null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.has_business_perm(v_rec.business_id, 'record.view') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select code into v_code from private.service_record_codes where record_id = p_record_id;
  if v_code is null then
    v_code := private.new_claim_code();
    insert into private.service_record_codes (record_id, code) values (p_record_id, v_code);
  end if;
  return v_code;
end $$;

-- İşletme: kodu yeniler ve kayda bağlı hesabı çıkarır (kod yanlış kişiye gittiyse)
create function public.reset_service_record_claim(p_record_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records; v_code text;
begin
  select * into v_rec from public.service_records where id = p_record_id;
  if v_rec.id is null or v_rec.deleted_at is not null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.has_business_perm(v_rec.business_id, 'record.edit') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  delete from public.service_record_owners where record_id = p_record_id;
  delete from private.service_record_codes where record_id = p_record_id;
  v_code := private.new_claim_code();
  insert into private.service_record_codes (record_id, code) values (p_record_id, v_code);
  return v_code;
end $$;

-- İşletme: kayda bir hesap bağlı mı (kodun kullanılıp kullanılmadığını göstermek için; kimin olduğunu vermez)
create function public.service_record_claimed(p_record_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_rec public.service_records;
begin
  select * into v_rec from public.service_records where id = p_record_id;
  if v_rec.id is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.has_business_perm(v_rec.business_id, 'record.view') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return exists (select 1 from public.service_record_owners where record_id = p_record_id);
end $$;

-- Müşteri: kodu girer. Hata fırlatmak yerine durum döner; böylece yanlış deneme kaydı geri alınmaz.
--   {status: 'claimed' | 'already_mine' | 'invalid' | 'already_claimed' | 'rate_limited', record_id?}
create function public.claim_service_record(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := private.normalize_claim_code(p_code);
  v_record uuid;
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if (select count(*) from private.service_claim_failures where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select c.record_id into v_record
  from private.service_record_codes c
  join public.service_records r on r.id = c.record_id and r.deleted_at is null
  join public.businesses b on b.id = r.business_id and b.deleted_at is null
  where c.code = v_code;
  if v_record is null then
    insert into private.service_claim_failures (user_id) values (auth.uid());
    return jsonb_build_object('status', 'invalid');
  end if;
  select user_id into v_owner from public.service_record_owners where record_id = v_record;
  if v_owner = auth.uid() then return jsonb_build_object('status', 'already_mine', 'record_id', v_record); end if;
  if v_owner is not null then
    insert into private.service_claim_failures (user_id) values (auth.uid());
    return jsonb_build_object('status', 'already_claimed');
  end if;
  insert into public.service_record_owners (record_id, user_id) values (v_record, auth.uid());
  return jsonb_build_object('status', 'claimed', 'record_id', v_record);
end $$;

-- Kayıt sahipliği: doğrulanmış e-posta eşleşmesi YA DA kayıt koduyla bağlanmış hesap
create or replace function private.is_record_customer(p_record_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_records r
    join public.business_customers c on c.id = r.customer_id
    where r.id = p_record_id
      and (
        (c.email is not null and c.email = private.my_email())
        or exists (select 1 from public.service_record_owners o where o.record_id = r.id and o.user_id = auth.uid())
      )
  )
$$;

create or replace function public.my_service_records() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.customer_view(r.id) order by r.created_at desc), '[]'::jsonb)
  from public.service_records r
  join public.business_customers c on c.id = r.customer_id
  join public.businesses b on b.id = r.business_id and b.deleted_at is null
  where r.deleted_at is null
    and (
      (c.email is not null and c.email = private.my_email())
      or exists (select 1 from public.service_record_owners o where o.record_id = r.id and o.user_id = auth.uid())
    )
$$;

drop function private.phone_plate_match(text, uuid);

revoke execute on function private.new_claim_code(), private.normalize_claim_code(text) from public;
revoke execute on function public.service_record_claim_code(uuid), public.reset_service_record_claim(uuid),
  public.service_record_claimed(uuid), public.claim_service_record(text) from public, anon;
grant execute on function public.service_record_claim_code(uuid), public.reset_service_record_claim(uuid),
  public.service_record_claimed(uuid), public.claim_service_record(text) to authenticated;
