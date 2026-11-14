#!/usr/bin/env bash
# Migration'ları geçici bir PostgreSQL'e uygular ve testleri çalıştırır.
# Gerekenler: PostgreSQL 15+ ikili dosyaları (initdb, pg_ctl, psql) ve Node.js.
# Kullanım: npm run db:test   (depo kökünden)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT_TEST:-54329}"
TMP="$(mktemp -d)"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$TMP"
  RUN_AS=(runuser -u postgres --)
fi
DATA="$TMP/data"

cleanup() { "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start -w >/dev/null

PSQL=("${RUN_AS[@]}" "$PGBIN/psql" -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

echo "→ Supabase taklidi"
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done

echo "→ Bakım hesabı: SQL ile TypeScript aynı sonucu veriyor mu"
node "$ROOT/supabase/tests/due-parity.mjs" > "$TMP/parity.sql"
"${PSQL[@]}" -o /dev/null -f "$TMP/parity.sql"

echo "→ Erişim (RLS) testleri"
"${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/rls.test.sql"
