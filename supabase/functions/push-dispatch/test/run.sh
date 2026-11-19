#!/usr/bin/env bash
# push-dispatch fonksiyonunu sahte Supabase ve sahte Expo push sunucusuna karşı çalıştırır (gerçek bildirim gönderilmez).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if curl -s -o /dev/null http://localhost:8000; then echo "Port 8000 dolu: önceki bir test sunucusu çalışıyor. Kapatıp tekrar dene (pkill -f supabase/functions)."; exit 1; fi
M=54420
node "$HERE/mock.mjs" $M > /tmp/pg-dispatch-mock.log 2>&1 & MP=$!
SUPABASE_URL=http://localhost:$M SUPABASE_SERVICE_ROLE_KEY=service CRON_SECRET=s3cret EXPO_PUSH_URL=http://localhost:$M/push \
  npx -y deno@2 run --quiet --allow-net --allow-env --allow-read --config "$HERE/../../deno.json" "$HERE/../index.ts" > /tmp/pg-dispatch-fn.log 2>&1 & FP=$!
trap 'kill $MP $FP 2>/dev/null || true; pkill -f "$HERE/../index.ts" 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:8000 && break; sleep 1; done
node -e '
const ok=(c,m,x="")=>{console.log((c?"✓ ":"✗ ")+m+(c?"":" "+x)); if(!c) process.exitCode=1;};
(async()=>{
  let r=await fetch("http://localhost:8000",{method:"POST"}); ok(r.status===401,"gizli başlık olmadan reddediliyor");
  r=await fetch("http://localhost:8000",{method:"POST",headers:{"x-cron-secret":"s3cret"}}); const out=await r.json();
  const st=await (await fetch("http://localhost:'$M'/__state")).json();
  ok(r.status===200 && out.processed===4,"4 bildirim işlendi",JSON.stringify(out));
  const to=st.pushes.map(p=>p.to+":"+p.data.notification_id).sort();
  ok(JSON.stringify(to)===JSON.stringify(["ExponentPushToken[dead]:n3","ExponentPushToken[ok1]:n1","ExponentPushToken[ok2]:n3"]),"kapalı tercih (topluluk) ve cihazı olmayan kullanıcı telefona gönderilmiyor",JSON.stringify(to));
  ok(st.pushes.every(p=>typeof p.data.url==="string" && p.sound==="default"),"bildirim dokununca açılacak ekranı taşıyor");
  ok(out.sent===2 && st.deleted.join().includes("ExponentPushToken[dead]") && !st.deleted.join().includes("ok1") && !st.deleted.join().includes("ok2"),"geçersiz cihaz anahtarı siliniyor",JSON.stringify(st.deleted));
  ok(st.marked[0]==="in.(n1,n2,n3,n4)" && typeof st.marked[1].pushed_at==="string","işlenen bildirimler tekrar gönderilmesin diye işaretleniyor",JSON.stringify(st.marked));
})();'
