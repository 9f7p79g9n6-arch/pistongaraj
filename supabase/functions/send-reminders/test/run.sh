#!/usr/bin/env bash
# send-reminders fonksiyonunu sahte Supabase ve sahte Expo push sunucusuna karşı çalıştırır (gerçek bildirim gönderilmez).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if curl -s -o /dev/null http://localhost:8000; then echo "Port 8000 dolu: önceki bir test sunucusu çalışıyor. Kapatıp tekrar dene (pkill -f supabase/functions)."; exit 1; fi; M=54410
node "$HERE/mock.mjs" $M > /tmp/pg-rem-mock.log 2>&1 & MP=$!
SUPABASE_URL=http://localhost:$M SUPABASE_SERVICE_ROLE_KEY=service REMINDERS_CRON_SECRET=s3cret EXPO_PUSH_URL=http://localhost:$M/push \
  npx -y deno@2 run --quiet --allow-net --allow-env --allow-read --config "$HERE/../../deno.json" "$HERE/../index.ts" > /tmp/pg-rem-fn.log 2>&1 & FP=$!
trap 'kill $MP $FP 2>/dev/null || true; pkill -f "$HERE/../index.ts" 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:8000 && break; sleep 1; done
node -e '
const ok=(c,m,x="")=>{console.log((c?"✓ ":"✗ ")+m+(c?"":" "+x)); if(!c) process.exitCode=1;};
(async()=>{
  let r=await fetch("http://localhost:8000",{method:"POST"}); ok(r.status===401,"gizli başlık olmadan reddediliyor");
  r=await fetch("http://localhost:8000",{method:"POST",headers:{"x-cron-secret":"s3cret"}}); const out=await r.json();
  const st=await (await fetch("http://localhost:'$M'/__state")).json();
  ok(r.status===200,"cron çağrısı başarılı",JSON.stringify(out));
  const kinds=st.notifInserts.map(n=>n.kind+":"+(n.data.rule_id||n.data.fine_id)).sort();
  ok(JSON.stringify(kinds)===JSON.stringify(["fine_discount:f1","maintenance_due:r1"]),"7 gün içinde bildirilen bakım tekrar gönderilmiyor; ceza hatırlatması ekleniyor",JSON.stringify(kinds));
  const fine=st.notifInserts.find(n=>n.kind==="fine_discount");
  ok(fine && fine.title==="Ceza indirimine 2 gün kaldı" && fine.body.includes("1.500") && fine.body.includes("2.000"),"ceza mesajı indirimli tutarı gösteriyor",fine&&fine.body);
  ok(st.notifInserts.every(n=>!("url" in n)) && st.notifInserts.every(n=>typeof n.data.url==="string"),"bildirim satırında açılacak ekran data.url içinde");
  ok(st.notifInserts.find(n=>n.kind==="fine_discount").data.url==="/vehicle/v1/fines","ceza bildirimi ceza ekranını açar");
  ok(st.pushes.length===0,"telefona gönderimi push-dispatch yapar; bu fonksiyon doğrudan göndermez");
})();'
