#!/usr/bin/env bash
set -euo pipefail

# Runs the authenticated Playwright journey against the NON-PRODUCTION staging
# Supabase + Stripe test mode declared in .env.test.local. Maps the STAGING_*/
# STRIPE_TEST_* values into the env names the app + fixtures read, then starts a
# local dev server (via the Playwright webServer) and runs the journey specs.
# See docs/testing-phase3.md.

cd "$(dirname "$0")/.."
[[ -f .env.test.local ]] || { echo "Missing .env.test.local (see docs/testing-phase3.md)." >&2; exit 1; }

set -a
# shellcheck disable=SC1091
source .env.test.local
set +a

: "${STAGING_SUPABASE_URL:?STAGING_SUPABASE_URL required}"
: "${STAGING_SUPABASE_SERVICE_ROLE_KEY:?STAGING_SUPABASE_SERVICE_ROLE_KEY required}"

export NEXT_PUBLIC_SUPABASE_URL="$STAGING_SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${STAGING_SUPABASE_PUBLISHABLE_KEY:-${STAGING_SUPABASE_ANON_KEY:-}}"
export SUPABASE_SERVICE_ROLE_KEY="$STAGING_SUPABASE_SERVICE_ROLE_KEY"
export STRIPE_SECRET_KEY="${STRIPE_TEST_SECRET_KEY:-}"
export STRIPE_WEBHOOK_SECRET="${STRIPE_TEST_WEBHOOK_SECRET:-}"
export STRIPE_VENDOR_INTRODUCTION_PRICE_ID="${STRIPE_TEST_PRICE_ID:-}"
export NEXT_PUBLIC_SITE_URL="http://127.0.0.1:3100"
export CRON_SECRET="${CRON_SECRET:-journey-cron-secret}"

exec npx playwright test -c playwright.journey.config.ts "$@"
