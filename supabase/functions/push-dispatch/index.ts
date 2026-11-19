// Bekleyen bildirimleri telefona gönderir. Zamanlayıcı (pg_cron + pg_net) her dakika çağırır; bkz. docs/YAYIN.md.
//
// 1) notifications tablosunda pushed_at boş, son 24 saatteki satırları alır (en fazla 500)
// 2) Kullanıcının tercihine bakar (profiles.notify_*); kapalı gruptaki bildirim telefona gitmez ama uygulamada görünür
// 3) Kullanıcının cihaz anahtarlarına Expo Push ile gönderir (100'lük paketler)
// 4) "DeviceNotRegistered" dönen anahtarları siler; işlenen satırları pushed_at ile işaretler
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';

type Notif = { id: string; user_id: string; kind: string; title: string; body: string | null; data: Record<string, unknown> };
type Prefs = { id: string; notify_reminders: boolean; notify_service: boolean; notify_quotes: boolean; notify_social: boolean };

// Veritabanındaki public.notification_category ile aynı eşleme
export function category(kind: string): 'reminders' | 'service' | 'quotes' | 'social' {
  if (kind === 'maintenance_due' || kind === 'fine_discount') return 'reminders';
  if (kind.startsWith('service_') || kind === 'review_new') return 'service';
  if (kind.startsWith('quote_')) return 'quotes';
  return 'social';
}

function allowed(p: Prefs | undefined, kind: string): boolean {
  if (!p) return true;
  const c = category(kind);
  return c === 'reminders' ? p.notify_reminders : c === 'service' ? p.notify_service : c === 'quotes' ? p.notify_quotes : p.notify_social;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? Deno.env.get('REMINDERS_CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: rows, error } = await admin
    .from('notifications').select('id, user_id, kind, title, body, data')
    .is('pushed_at', null).gte('created_at', since).order('created_at').limit(500);
  if (error) return json({ error: error.message }, 500);
  const notifs = (rows ?? []) as Notif[];
  if (!notifs.length) return json({ sent: 0, processed: 0 });

  const users = [...new Set(notifs.map((n) => n.user_id))];
  const [{ data: prefs }, { data: tokens }] = await Promise.all([
    admin.from('profiles').select('id, notify_reminders, notify_service, notify_quotes, notify_social').in('id', users),
    admin.from('device_tokens').select('token, user_id').in('user_id', users),
  ]);
  const prefById = new Map(((prefs ?? []) as Prefs[]).map((p) => [p.id, p]));

  const messages: { to: string; title: string; body: string; sound: 'default'; data: Record<string, unknown> }[] = [];
  for (const n of notifs) {
    if (!allowed(prefById.get(n.user_id), n.kind)) continue;
    for (const t of (tokens ?? []).filter((x) => x.user_id === n.user_id)) {
      messages.push({ to: t.token as string, title: n.title, body: n.body ?? '', sound: 'default', data: { url: n.data?.url ?? null, notification_id: n.id } });
    }
  }

  let sent = 0;
  const dead = new Set<string>();
  const url = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(batch) });
      if (!res.ok) continue;
      const out = await res.json() as { data?: { status: string; details?: { error?: string } }[] };
      (out.data ?? []).forEach((ticket, j) => {
        if (ticket.status === 'ok') sent++;
        else if (ticket.details?.error === 'DeviceNotRegistered') dead.add(batch[j]!.to);
      });
    } catch {
      // Bir paket başarısız olursa diğerleri gönderilir; bu paketin bildirimleri yine işlenmiş sayılır (tekrar gönderim yağmuru olmasın)
    }
  }
  if (dead.size) await admin.from('device_tokens').delete().in('token', [...dead]);
  await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).in('id', notifs.map((n) => n.id));
  return json({ sent, processed: notifs.length, removed_tokens: dead.size });
});
