// Günlük bakım bildirimi. pg_cron ile her gün 09:00 (İstanbul) çağrılır; README > Bildirimler.
// Aynı kural için 7 gün içinde ikinci bildirim gönderilmez.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';

type DueRow = {
  rule_id: string; vehicle_id: string; owner_id: string; title: string; make: string; model: string;
  km_left: number | null; days_left: number | null; status: 'overdue' | 'due_soon';
};

type Outgoing = { user_id: string; kind: string; title: string; body: string; data: Record<string, string>; url: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = ReturnType<typeof createClient<any>>;

/**
 * İndirimli ödeme süresinin bitmesine 3 gün ya da daha az kalan ödenmemiş cezalar.
 * Aynı ceza için 5 gün içinde ikinci hatırlatma gönderilmez (pratikte süre başına bir kez).
 */
async function collectFineReminders(admin: Admin): Promise<Outgoing[]> {
  const { data: fines } = await admin
    .from('fine_due')
    .select('fine_id, vehicle_id, owner_id, make, model, amount, discount_until, days_left_for_discount')
    .gte('days_left_for_discount', 0)
    .lte('days_left_for_discount', 3)
    .limit(5000);
  if (!fines?.length) return [];
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { data: recent } = await admin
    .from('notifications').select('data').eq('kind', 'fine_discount').gte('created_at', since)
    .in('user_id', [...new Set(fines.map((f) => f.owner_id as string))]);
  const sentFor = new Set((recent ?? []).map((n) => (n.data as { fine_id?: string }).fine_id));
  return fines
    .filter((f) => !sentFor.has(f.fine_id as string))
    .map((f) => {
      const left = f.days_left_for_discount as number;
      const discounted = Math.round(Number(f.amount) * 75) / 100;
      return {
        user_id: f.owner_id as string,
        kind: 'fine_discount',
        title: left === 0 ? 'Ceza indiriminin son günü' : `Ceza indirimine ${left} gün kaldı`,
        body: `${f.make} ${f.model} · ${discounted.toLocaleString('tr-TR')} ₺ ile ödeyebilirsin (normali ${Number(f.amount).toLocaleString('tr-TR')} ₺)`,
        data: { fine_id: f.fine_id as string, vehicle_id: f.vehicle_id as string },
        url: `/vehicle/${f.vehicle_id}/fines`,
      };
    });
}

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

  const fineNotifs = await collectFineReminders(admin);

  const { data: due, error } = await admin
    .from('maintenance_due')
    .select('rule_id, vehicle_id, owner_id, title, make, model, km_left, days_left, status')
    .in('status', ['overdue', 'due_soon'])
    .eq('enabled', true)
    .limit(5000);
  if (error) return json({ error: error.message }, 500);

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recent } = await admin
    .from('notifications')
    .select('data')
    .eq('kind', 'maintenance_due')
    .gte('created_at', since)
    .in('user_id', [...new Set(due.map((d) => d.owner_id))]);
  const already = new Set((recent ?? []).map((n) => (n.data as { rule_id?: string }).rule_id));
  const pending = ((due ?? []) as DueRow[]).filter((d) => !already.has(d.rule_id));

  const maintNotifs: Outgoing[] = pending.map((d) => ({
    user_id: d.owner_id, kind: 'maintenance_due', ...message(d),
    data: { rule_id: d.rule_id, vehicle_id: d.vehicle_id }, url: `/vehicle/${d.vehicle_id}/maintenance`,
  }));
  const outgoing = [...maintNotifs, ...fineNotifs];
  if (!outgoing.length) return json({ sent: 0 });

  const { data: tokens } = await admin
    .from('device_tokens')
    .select('token, user_id')
    .in('user_id', [...new Set(outgoing.map((o) => o.user_id))]);

  const notifRows = outgoing.map(({ url: _url, ...row }) => row);
  await admin.from('notifications').insert(notifRows);

  const pushes = outgoing.flatMap((o) =>
    (tokens ?? []).filter((t) => t.user_id === o.user_id).map((t) => ({
      to: t.token, sound: 'default', title: o.title, body: o.body, data: { url: o.url },
    })),
  );

  let sent = 0;
  for (let i = 0; i < pushes.length; i += 100) {
    const batch = pushes.slice(i, i + 100);
    const res = await fetch(Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    if (res.ok) sent += batch.length;
  }
  return json({ sent, notifications: notifRows.length });
});
