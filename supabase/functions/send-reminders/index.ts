// Günlük bakım bildirimi. pg_cron ile her gün 09:00 (İstanbul) çağrılır; README > Bildirimler.
// Aynı kural için 7 gün içinde ikinci bildirim gönderilmez.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';

type DueRow = {
  rule_id: string; vehicle_id: string; owner_id: string; title: string; make: string; model: string;
  km_left: number | null; days_left: number | null; status: 'overdue' | 'due_soon';
};

function message(r: DueRow): { title: string; body: string } {
  const car = `${r.make} ${r.model}`;
  const parts: string[] = [];
  if (r.km_left != null) parts.push(r.km_left < 0 ? `${Math.abs(r.km_left).toLocaleString('tr-TR')} km geçti` : `${r.km_left.toLocaleString('tr-TR')} km kaldı`);
  if (r.days_left != null) parts.push(r.days_left < 0 ? `${Math.abs(r.days_left)} gün gecikti` : r.days_left === 0 ? 'bugün' : `${r.days_left} gün kaldı`);
  return {
    title: r.status === 'overdue' ? `${r.title} gecikti` : `${r.title} yaklaşıyor`,
    body: `${car} · ${parts.join(' · ')}`,
  };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('REMINDERS_CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: due, error } = await admin
    .from('maintenance_due')
    .select('rule_id, vehicle_id, owner_id, title, make, model, km_left, days_left, status')
    .in('status', ['overdue', 'due_soon'])
    .eq('enabled', true)
    .limit(5000);
  if (error) return json({ error: error.message }, 500);
  if (!due?.length) return json({ sent: 0 });

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recent } = await admin
    .from('notifications')
    .select('data')
    .eq('kind', 'maintenance_due')
    .gte('created_at', since)
    .in('user_id', [...new Set(due.map((d) => d.owner_id))]);
  const already = new Set((recent ?? []).map((n) => (n.data as { rule_id?: string }).rule_id));
  const pending = (due as DueRow[]).filter((d) => !already.has(d.rule_id));
  if (!pending.length) return json({ sent: 0 });

  const { data: tokens } = await admin
    .from('device_tokens')
    .select('token, user_id')
    .in('user_id', [...new Set(pending.map((d) => d.owner_id))]);

  const notifRows = pending.map((d) => ({ user_id: d.owner_id, kind: 'maintenance_due', ...message(d), data: { rule_id: d.rule_id, vehicle_id: d.vehicle_id } }));
  await admin.from('notifications').insert(notifRows);

  const pushes = pending.flatMap((d) => {
    const m = message(d);
    return (tokens ?? []).filter((t) => t.user_id === d.owner_id).map((t) => ({
      to: t.token, sound: 'default', title: m.title, body: m.body,
      data: { url: `/vehicle/${d.vehicle_id}/maintenance` },
    }));
  });

  let sent = 0;
  for (let i = 0; i < pushes.length; i += 100) {
    const batch = pushes.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    if (res.ok) sent += batch.length;
  }
  return json({ sent, notifications: notifRows.length });
});
