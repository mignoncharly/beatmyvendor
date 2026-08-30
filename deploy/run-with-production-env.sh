#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/home/mignon/apps/VendorDuel
SECRETS_FILE="$APP_DIR/supabase_keys.md"
ENV_FILE="$APP_DIR/.env.production.local"

read_setting() {
  local setting_name=$1
  awk -F= -v wanted="$setting_name" '
    $1 ~ "^[[:space:]]*" wanted "[[:space:]]*$" {
      value=substr($0,index($0,"=")+1)
      sub(/^[[:space:]"]+/,"",value)
      sub(/[[:space:]"]+$/,"",value)
      print value
      exit
    }
  ' "$SECRETS_FILE"
}

read_stripe_sandbox_setting() {
  local setting_name=$1
  awk -v wanted="$setting_name" '
    BEGIN { IGNORECASE=1; sandbox=0 }
    /stripe sandbox keys/ { sandbox=1; next }
    /stripe live keys/ { sandbox=0 }
    sandbox && index(tolower($0),tolower(wanted)) {
      value=substr($0,index($0,"=")+1)
      sub(/^[[:space:]"]+/,"",value)
      sub(/[[:space:]"]+$/,"",value)
      print value
      exit
    }
  ' "$SECRETS_FILE"
}

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  [[ -r "$SECRETS_FILE" ]] || { echo "Missing readable production secrets file: $SECRETS_FILE" >&2; exit 1; }
  export NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_URL=$(read_setting project_url)
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(read_setting publishable_key)
  export SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_SERVICE_ROLE_KEY=$(read_setting service_role_secret)
  export STRIPE_SECRET_KEY
  STRIPE_SECRET_KEY=$(read_stripe_sandbox_setting "stripe secret key")
  export STRIPE_VENDOR_INTRODUCTION_PRICE_ID
  STRIPE_VENDOR_INTRODUCTION_PRICE_ID=$(read_stripe_sandbox_setting STRIPE_VENDOR_INTRODUCTION_PRICE_ID)
  export RESEND_API_KEY
  RESEND_API_KEY=$(read_setting resend_api_key)
  export CRON_SECRET
  CRON_SECRET=$(read_setting cron_secret)
fi

export NODE_ENV=production
export NEXT_PUBLIC_SITE_URL=https://beatmyvendor.com
export RESEND_FROM_EMAIL="${RESEND_FROM_EMAIL:-VendorDuel <notifications@beatmyvendor.com>}"
export RESEND_REPLY_TO_EMAIL="${RESEND_REPLY_TO_EMAIL:-support@beatmyvendor.com}"
export EMAIL_DELIVERY_BATCH_SIZE="${EMAIL_DELIVERY_BATCH_SIZE:-25}"

: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL is required}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${STRIPE_SECRET_KEY:?STRIPE_SECRET_KEY is required}"
: "${STRIPE_VENDOR_INTRODUCTION_PRICE_ID:?STRIPE_VENDOR_INTRODUCTION_PRICE_ID is required}"
: "${RESEND_API_KEY:?RESEND_API_KEY is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"

exec "$@"
