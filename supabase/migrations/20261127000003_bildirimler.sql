-- =====================================================================
-- Olay bildirimleri
--
-- Olaylar tetikleyicilerle notifications tablosuna satır olarak yazılır. Telefona gönderimi
-- push-dispatch sunucu fonksiyonu yapar (zamanlayıcıyla her dakika): pushed_at boş satırları
-- kullanıcının bildirim tercihine ve cihaz anahtarlarına göre Expo'ya gönderir.
-- Uygulamadaki Bildirimler ekranı aynı tablodan okur; push izni olmasa da bildirimler görünür.
--
-- Kural: kişi kendi yaptığı işlem için bildirim almaz; engellediği ya da onu engelleyen kişiden almaz.
-- =====================================================================

alter table public.notifications add column pushed_at timestamptz;
create index notifications_unpushed on public.notifications (created_at) where pushed_at is null;

-- Bildirim tercihleri (Ayarlar). Bakım/ceza hatırlatmaları, servis kayıtları, teklifler, topluluk.
alter table public.profiles
  add column notify_reminders boolean not null default true,
  add column notify_service boolean not null default true,
  add column notify_quotes boolean not null default true,
  add column notify_social boolean not null default true;
grant update (notify_reminders, notify_service, notify_quotes, notify_social) on public.profiles to authenticated;

-- Bildirim türü → tercih grubu (push-dispatch ve uygulama aynı eşlemeyi kullanır)
create function public.notification_category(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_kind in ('maintenance_due', 'fine_discount') then 'reminders'
    when p_kind like 'service_%' or p_kind = 'review_new' then 'service'
    when p_kind like 'quote_%' then 'quotes'
    else 'social' end
$$;

create function private.notify(p_user_id uuid, p_kind text, p_title text, p_body text, p_url text, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or p_user_id is not distinct from auth.uid() then return; end if;
  insert into public.notifications (user_id, kind, title, body, data)
  values (p_user_id, p_kind, left(p_title, 120), left(p_body, 240), coalesce(p_data, '{}') || jsonb_build_object('url', p_url));
end $$;

-- İşletmenin sahip ve yöneticilerine
create function private.notify_business(p_business_id uuid, p_kind text, p_title text, p_body text, p_url text, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  for m in select user_id from public.business_members where business_id = p_business_id and role in ('owner', 'manager') loop
    perform private.notify(m.user_id, p_kind, p_title, p_body, p_url, p_data);
  end loop;
end $$;

-- Servis kaydının müşteri hesapları: doğrulanmış e-postası eşleşen kullanıcı ve kayıt koduyla bağlanan kullanıcı
create function private.record_customer_users(p_record_id uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.service_records r
  join public.business_customers c on c.id = r.customer_id
  join auth.users u on c.email is not null and lower(u.email) = lower(c.email)
  where r.id = p_record_id
  union
  select o.user_id from public.service_record_owners o where o.record_id = p_record_id
$$;

create function private.social_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.social_blocks where (user_id = a and blocked_user_id = b) or (user_id = b and blocked_user_id = a))
$$;

-- ---------------------------------------------------------------------
-- Servis kayıtları
-- ---------------------------------------------------------------------
create function private.on_service_record_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_biz text; u uuid;
begin
  if new.deleted_at is not null then return new; end if;
  select name into v_biz from public.businesses where id = new.business_id;
  if tg_op = 'INSERT' then
    for u in select * from private.record_customer_users(new.id) loop
      perform private.notify(u, 'service_new', 'Yeni servis kaydı', coalesce(v_biz, 'Servis') || ' aracın için kayıt açtı. Dökümü görebilirsin.',
        '/servis-kaydi/' || new.id, jsonb_build_object('record_id', new.id));
    end loop;
  elsif new.status = 'revised' and old.status is distinct from 'revised' then
    for u in select * from private.record_customer_users(new.id) loop
      perform private.notify(u, 'service_revised', 'Servis kaydı düzeltildi', coalesce(v_biz, 'Servis') || ' kaydı güncelledi. Yeni hâline bak.',
        '/servis-kaydi/' || new.id, jsonb_build_object('record_id', new.id));
    end loop;
  end if;
  return new;
end $$;
create trigger service_records_notify after insert or update of status on public.service_records
  for each row execute function private.on_service_record_change();

-- Kayıt koduyla bağlanınca işletmeye haber ver
create function private.on_service_record_claimed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records; v_plate text;
begin
  select * into v_rec from public.service_records where id = new.record_id;
  select plate into v_plate from public.business_vehicles where id = v_rec.vehicle_id;
  perform private.notify_business(v_rec.business_id, 'service_claimed', 'Müşteri kaydı ekledi',
    coalesce(v_plate, 'Araç') || ' kaydını müşteri OTOM’da hesabına ekledi.', '/servis/kayit/' || v_rec.id, jsonb_build_object('record_id', v_rec.id));
  return new;
end $$;
create trigger service_record_owners_notify after insert on public.service_record_owners
  for each row execute function private.on_service_record_claimed();

create function private.on_service_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_rec public.service_records; v_plate text;
begin
  select * into v_rec from public.service_records where id = new.record_id;
  select plate into v_plate from public.business_vehicles where id = v_rec.vehicle_id;
  if new.action = 'approved' then
    perform private.notify_business(v_rec.business_id, 'service_approved', 'Müşteri onayladı',
      coalesce(v_plate, 'Araç') || ' servis kaydı onaylandı.', '/servis/kayit/' || v_rec.id, jsonb_build_object('record_id', v_rec.id));
  else
    perform private.notify_business(v_rec.business_id, 'service_objected', 'Müşteri itiraz etti',
      coalesce(v_plate, 'Araç') || ': ' || coalesce(new.reason, ''), '/servis/kayit/' || v_rec.id, jsonb_build_object('record_id', v_rec.id));
  end if;
  return new;
end $$;
create trigger service_approvals_notify after insert on public.service_approvals
  for each row execute function private.on_service_approval();

create function private.on_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify_business(new.business_id, 'review_new', 'Yeni yorum',
    repeat('★', new.rating) || coalesce(' · ' || left(new.comment, 80), ''), '/servis/profil', jsonb_build_object('review_id', new.id));
  return new;
end $$;
create trigger business_reviews_notify after insert on public.business_reviews
  for each row execute function private.on_review();

-- ---------------------------------------------------------------------
-- Teklif talepleri
-- ---------------------------------------------------------------------
create function private.on_quote_target() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_req public.quote_requests;
begin
  select * into v_req from public.quote_requests where id = new.request_id;
  perform private.notify_business(new.business_id, 'quote_request', 'Yeni teklif talebi',
    v_req.title || ' · ' || v_req.vehicle_label, '/servis/talep/' || v_req.id, jsonb_build_object('request_id', v_req.id));
  return new;
end $$;
create trigger quote_request_targets_notify after insert on public.quote_request_targets
  for each row execute function private.on_quote_target();

create function private.on_quote_offer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_req public.quote_requests; v_biz text;
begin
  select * into v_req from public.quote_requests where id = new.request_id;
  select name into v_biz from public.businesses where id = new.business_id;
  perform private.notify(v_req.user_id, 'quote_offer', 'Yeni teklif',
    coalesce(v_biz, 'Bir işletme') || ' “' || v_req.title || '” talebine teklif verdi.', '/teklif/' || v_req.id, jsonb_build_object('request_id', v_req.id));
  return new;
end $$;
create trigger quote_offers_notify after insert on public.quote_offers
  for each row execute function private.on_quote_offer();

create function private.on_quote_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_offer public.quote_offers;
begin
  if new.accepted_offer_id is null or new.accepted_offer_id is not distinct from old.accepted_offer_id then return new; end if;
  select * into v_offer from public.quote_offers where id = new.accepted_offer_id;
  perform private.notify_business(v_offer.business_id, 'quote_accepted', 'Teklifin kabul edildi',
    '“' || new.title || '” talebinde teklifin seçildi. Müşterinin telefonu talep sayfasında.', '/servis/talep/' || new.id, jsonb_build_object('request_id', new.id));
  return new;
end $$;
create trigger quote_requests_accept_notify after update of accepted_offer_id on public.quote_requests
  for each row execute function private.on_quote_accepted();

-- ---------------------------------------------------------------------
-- Topluluk (Ana Sayfa) ve usta forumu
-- ---------------------------------------------------------------------
create function private.on_social_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  select author_user_id into v_author from public.social_posts where id = new.post_id and deleted_at is null;
  if v_author is null or private.social_blocked(v_author, new.author_user_id) then return new; end if;
  perform private.notify(v_author, 'social_comment', 'Yeni yorum',
    private.social_name(new.author_user_id) || ': ' || left(new.body, 100), '/sosyal/' || new.post_id, jsonb_build_object('post_id', new.post_id));
  return new;
end $$;
create trigger social_comments_notify after insert on public.social_comments
  for each row execute function private.on_social_comment();

create function private.on_social_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.social_blocked(new.followee_id, new.follower_id) then return new; end if;
  perform private.notify(new.followee_id, 'social_follow', 'Yeni takipçi',
    private.social_name(new.follower_id) || ' seni takip etmeye başladı.', '/sosyal/kisi/' || new.follower_id, jsonb_build_object('user_id', new.follower_id));
  return new;
end $$;
create trigger social_follows_notify after insert on public.social_follows
  for each row execute function private.on_social_follow();

create function private.on_best_answer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  if new.best_comment_id is null or new.best_comment_id is not distinct from old.best_comment_id then return new; end if;
  select author_user_id into v_author from public.social_comments where id = new.best_comment_id;
  perform private.notify(v_author, 'social_best', 'Yanıtın en iyi yanıt seçildi',
    private.social_name(new.author_user_id) || ' sorusunda yanıtını en iyi yanıt seçti.', '/sosyal/' || new.id, jsonb_build_object('post_id', new.id));
  return new;
end $$;
create trigger social_posts_best_notify after update of best_comment_id on public.social_posts
  for each row execute function private.on_best_answer();

create function private.on_forum_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_post public.forum_posts; v_biz text;
begin
  select * into v_post from public.forum_posts where id = new.post_id and deleted_at is null;
  if v_post.id is null or v_post.author_user_id is null then return new; end if;
  if exists (select 1 from public.forum_blocks where user_id = v_post.author_user_id and blocked_business_id = new.business_id) then return new; end if;
  select name into v_biz from public.businesses where id = new.business_id;
  perform private.notify(v_post.author_user_id, 'forum_comment', 'Konuna yanıt geldi',
    coalesce(v_biz, 'Bir usta') || ': ' || left(coalesce(nullif(new.body, ''), '(fotoğraf/video)'), 100), '/servis/forum/' || new.post_id,
    jsonb_build_object('post_id', new.post_id));
  return new;
end $$;
create trigger forum_comments_notify after insert on public.forum_comments
  for each row execute function private.on_forum_comment();

-- ---------------------------------------------------------------------
-- Uygulama: okunmamış sayısı ve hepsini okundu işaretleme
-- ---------------------------------------------------------------------
create function public.mark_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

revoke execute on function private.notify(uuid, text, text, text, text, jsonb), private.notify_business(uuid, text, text, text, text, jsonb),
  private.record_customer_users(uuid), private.social_blocked(uuid, uuid) from public;
revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read(), public.notification_category(text) to authenticated, service_role;
