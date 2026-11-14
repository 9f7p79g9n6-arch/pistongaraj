// Uygulama içinden hesap silme (App Store 5.1.1(v), KVKK md. 7).
// 1) İsteği yapan kullanıcıyı JWT ile doğrular  2) Storage'daki dosyalarını siler
// 3) auth.users kaydını siler; veritabanındaki tüm kayıtlar ON DELETE CASCADE ile gider.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const BUCKETS = ['documents', 'vehicle-photos'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Oturum anahtarı açıkça verilir: anahtarsız getUser() sunucuya sormadan "oturum yok" döner
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  for (const bucket of BUCKETS) {
    // Klasördeki dosyaları sayfa sayfa listeleyip sil. Alt klasör kayıtları (id = null) dosya değildir;
    // silinecek dosya kalmadıysa ya da hiçbir şey silinemiyorsa döngüden çık (sonsuz döngüye girmesin).
    for (let page = 0; page < 1000; page++) {
      const { data: items, error: listErr } = await admin.storage.from(bucket).list(user.id, { limit: 100 });
      if (listErr) return json({ error: 'storage_list_failed', bucket }, 500);
      const files = (items ?? []).filter((f) => f.id != null);
      if (!files.length) break;
      const { data: removed, error: rmErr } = await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
      if (rmErr) return json({ error: 'storage_remove_failed', bucket }, 500);
      if (!removed?.length) break;
    }
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return json({ error: 'delete_failed' }, 500);
  return json({ ok: true });
});
