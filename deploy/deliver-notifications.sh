#!/usr/bin/env bash
set -euo pipefail

: "${CRON_SECRET:?CRON_SECRET is required}"

printf 'header = "Authorization: Bearer %s"\n' "$CRON_SECRET" |
  curl --config - \
    --fail-with-body \
    --silent \
    --show-error \
    --request POST http://127.0.0.1:3000/api/maintenance/notifications
