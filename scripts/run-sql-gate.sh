#!/usr/bin/env bash
set -euo pipefail

# Runs the SQL security gate against the staging project over the IPv4 session
# pooler (the direct DB host is IPv6-only). Reads .env.test.local and hands psql a
# keyword conninfo + PGPASSWORD so the password's special characters need no
# URL-encoding. See docs/testing-phase3.md.

cd "$(dirname "$0")/.."
[[ -f .env.test.local ]] || { echo "Missing .env.test.local (see docs/testing-phase3.md)." >&2; exit 1; }

set -a
# shellcheck disable=SC1091
source .env.test.local
set +a

: "${STAGING_SUPABASE_URL:?STAGING_SUPABASE_URL required}"
: "${QUALIFY_DATABASE_URL:?QUALIFY_DATABASE_URL required (any URI holding the DB password)}"
: "${QUALIFY_POOLER_HOST:?QUALIFY_POOLER_HOST required (IPv4 session pooler host)}"

ref="$(printf '%s' "$STAGING_SUPABASE_URL" | sed -E 's#https?://([^.]+)\..*#\1#')"
userinfo="${QUALIFY_DATABASE_URL#postgresql://}"; userinfo="${userinfo%@*}"
export PGPASSWORD="${userinfo#*:}"
export QUALIFY_DATABASE_URL="host=${QUALIFY_POOLER_HOST} port=5432 user=postgres.${ref} dbname=postgres sslmode=require"

exec npm run test:sql
