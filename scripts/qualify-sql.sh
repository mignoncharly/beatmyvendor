#!/usr/bin/env bash
set -euo pipefail

# Runs the marketplace RLS / payment / lifecycle security suite as a release gate.
# The suite is a single transaction that ROLLS BACK, so it is non-destructive and
# safe to run against a disposable, staging, or (carefully) production database.
#
# Provide the connection as QUALIFY_DATABASE_URL (or DATABASE_URL). When neither
# is set the gate is skipped so `npm run check` still works without a database.

DB_URL="${QUALIFY_DATABASE_URL:-${DATABASE_URL:-}}"
SQL_FILE="supabase/tests/marketplace_security.sql"

if [[ -z "$DB_URL" ]]; then
  echo "QUALIFY_DATABASE_URL not set — skipping the SQL security gate."
  echo "Set it to a disposable/staging database connection string to enable it."
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run the SQL security gate." >&2
  exit 1
fi

log="$(mktemp)"
echo "Running RLS/payment/lifecycle security suite (transactional, rolls back)…"
if psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE" >"$log" 2>&1; then
  echo "SQL security gate PASSED (all assertions held; changes rolled back)."
  rm -f "$log"
else
  echo "SQL security gate FAILED:" >&2
  tail -40 "$log" >&2
  rm -f "$log"
  exit 1
fi
