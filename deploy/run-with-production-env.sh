#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/home/mignon/apps/VendorDuel
LOCAL_ENV_FILE="$APP_DIR/.env.production.local"
CREDENTIAL_FILE="${CREDENTIALS_DIRECTORY:-}/beatmyvendor.env"

if [[ -n "${CREDENTIALS_DIRECTORY:-}" && -r "$CREDENTIAL_FILE" ]]; then
  set -a
  # systemd decrypts this credential into a private, read-only runtime directory.
  # shellcheck disable=SC1090
  source "$CREDENTIAL_FILE"
  set +a
elif [[ -f "$LOCAL_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$LOCAL_ENV_FILE"
  set +a
else
  echo "Missing systemd credential beatmyvendor.env (or local development fallback $LOCAL_ENV_FILE)." >&2
  exit 1
fi

export NODE_ENV=production
export NEXT_PUBLIC_SITE_URL=https://beatmyvendor.com
export RESEND_FROM_EMAIL="${RESEND_FROM_EMAIL:-BeatMyVendor <notifications@beatmyvendor.com>}"
export RESEND_REPLY_TO_EMAIL="${RESEND_REPLY_TO_EMAIL:-support@beatmyvendor.com}"
export EMAIL_DELIVERY_BATCH_SIZE="${EMAIL_DELIVERY_BATCH_SIZE:-25}"

: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL is required}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${STRIPE_SECRET_KEY:?STRIPE_SECRET_KEY is required}"
: "${STRIPE_WEBHOOK_SECRET:?STRIPE_WEBHOOK_SECRET is required}"
: "${STRIPE_VENDOR_INTRODUCTION_PRICE_ID:?STRIPE_VENDOR_INTRODUCTION_PRICE_ID is required}"
: "${RESEND_API_KEY:?RESEND_API_KEY is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"

exec "$@"
