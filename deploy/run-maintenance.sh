#!/usr/bin/env bash
set -euo pipefail

: "${CRON_SECRET:?CRON_SECRET is required}"

# Idempotent marketplace maintenance: advance/expire duels and offers past their
# deadlines, then apply verification-document retention. Both endpoints are safe
# to run repeatedly.
for endpoint in expiry retention; do
  printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" |
    curl --config - \
      --fail-with-body \
      --silent \
      --show-error \
      --request POST "http://127.0.0.1:3000/api/maintenance/$endpoint"
  printf '\n'
done
