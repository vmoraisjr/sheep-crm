#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL only. No service credentials or published ports.
cd "$(dirname "$0")/.."
test_container="sheep-integration-${RANDOM}-$$"
cleanup() { docker rm -f "$test_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run --rm -d --name "$test_container" -e POSTGRES_PASSWORD=local-test-only postgres:17-alpine >/dev/null
ready=false
for attempt in {1..30}; do
 if docker exec "$test_container" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
 sleep 1
done
if [ "$ready" != true ]; then echo 'PostgreSQL did not become ready' >&2; exit 1; fi
docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 < tests/postgres-bootstrap.sql
for migration in supabase/migrations/*.sql; do
 echo "Applying $migration"
 docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 < "$migration"
done
for fixture in tests/*.sql; do
 case "$fixture" in *postgres-bootstrap.sql) continue;; esac
 echo "Testing $fixture"
 docker exec -i "$test_container" psql -U postgres -v ON_ERROR_STOP=1 < "$fixture"
done
