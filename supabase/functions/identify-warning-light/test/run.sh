#!/usr/bin/env bash
# identify-warning-light fonksiyonunu sahte Supabase ve sahte Anthropic API'ye karşı çalıştırır.
# Gerçek API çağrısı yapmaz, ücret oluşturmaz. Gerekenler: Node.js, Deno (npx deno@2).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if curl -s -o /dev/null http://localhost:8000; then echo "Port 8000 dolu: önceki bir test sunucusu çalışıyor. Kapatıp tekrar dene (pkill -f supabase/functions)."; exit 1; fi
MOCK=54400
node "$HERE/mock-server.mjs" $MOCK > /tmp/pg-mock.log 2>&1 & MP=$!
SUPABASE_URL=http://localhost:$MOCK SUPABASE_ANON_KEY=anon SUPABASE_SERVICE_ROLE_KEY=service \
ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://localhost:$MOCK \
  npx -y deno@2 run --quiet --allow-net --allow-env --allow-read --config "$HERE/../../deno.json" \
  "$HERE/../index.ts" > /tmp/pg-fn.log 2>&1 & FP=$!
trap 'kill $MP $FP 2>/dev/null || true; pkill -f "$HERE/../index.ts" 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null "http://localhost:8000" 2>/dev/null && break; sleep 1; done
node "$HERE/scenarios.mjs" http://localhost:8000 http://localhost:$MOCK
