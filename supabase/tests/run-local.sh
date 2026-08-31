#!/usr/bin/env bash
# Apply the party migrations to a THROWAWAY local Postgres and run a test file.
#
# Why: these migrations are SECURITY DEFINER RPCs with authorization and timeline
# semantics that are painful to eyeball and expensive to get wrong in production.
# This spins up a scratch cluster, shims the three Supabase-isms the party schema
# depends on (auth.uid(), the anon/authenticated/service_role roles, the
# supabase_realtime publication), applies 0001..0008 and runs the assertions.
#
# It does NOT touch the hosted project. Nothing here needs a secret.
#
#   ./supabase/tests/run-local.sh                                  # run every *_test.sql
#   ./supabase/tests/run-local.sh 0008_party_queue_test.sql        # run one
#
# Requires a local postgres (brew install postgresql@16). 0007 is skipped: it
# gates realtime.messages, which has no local equivalent.
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@16/bin}"
[ -d "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "no local postgres — brew install postgresql@16"; exit 1; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-5599}"
trap 'pg_ctl -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

initdb -D "$WORK/data" -U postgres --auth=trust -E UTF8 >/dev/null
# -k /tmp: the socket path has a 103-byte limit that a mktemp dir blows past.
pg_ctl -D "$WORK/data" -o "-k /tmp -h 127.0.0.1 -p $PORT" -l "$WORK/pg.log" start >/dev/null
until pg_isready -h 127.0.0.1 -p "$PORT" -q; do sleep 0.2; done

q() { psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -v ON_ERROR_STOP=1 "${@:2}"; }

q postgres -q -c "create database bearoom;"
q bearoom -q -c "create role anon nologin; create role authenticated nologin; create role service_role nologin;"
q bearoom -q <<'SQL'
create schema if not exists auth;
-- The RPCs read auth.uid(); locally a test drives it with `set request.jwt.claim.sub`.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
do $$ begin create publication supabase_realtime; exception when others then null; end $$;
SQL

for m in 0001_party_core 0002_party_admin 0003_party_crypto_schema_fix \
         0004_party_join_bump_seq 0005_party_create_membership_guard \
         0006_party_create_creator_reclaim 0008_party_queue; do
  q bearoom -q -f "$ROOT/supabase/migrations/$m.sql" >/dev/null
  echo "  applied $m"
done

rc=0
for t in "${@:-$(ls "$ROOT"/supabase/tests/*_test.sql | xargs -n1 basename)}"; do
  echo "=== $t"
  out="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d bearoom -f "$ROOT/supabase/tests/$t" 2>&1)"
  echo "$out" | grep -E "NOTICE:|^===" || true
  n="$(echo "$out" | grep -c '!! FAIL' || true)"
  e="$(echo "$out" | grep -c '^psql:.*ERROR:' || true)"
  echo "--- $t: $n assertion failures, $e errors"
  [ "$n" = "0" ] && [ "$e" = "0" ] || rc=1
done
exit $rc
