#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/home/mignon/apps/VendorDuel
SERVICE_SOURCE="$APP_DIR/deploy/beatmyvendor.service"
EMAIL_SERVICE_SOURCE="$APP_DIR/deploy/beatmyvendor-email.service"
EMAIL_TIMER_SOURCE="$APP_DIR/deploy/beatmyvendor-email.timer"
MAINTENANCE_SERVICE_SOURCE="$APP_DIR/deploy/beatmyvendor-maintenance.service"
MAINTENANCE_TIMER_SOURCE="$APP_DIR/deploy/beatmyvendor-maintenance.timer"
HTTP_SOURCE="$APP_DIR/deploy/nginx-beatmyvendor-http.conf"
HTTPS_SOURCE="$APP_DIR/deploy/nginx-beatmyvendor-https.conf"
SERVICE_TARGET=/etc/systemd/system/beatmyvendor.service
EMAIL_SERVICE_TARGET=/etc/systemd/system/beatmyvendor-email.service
EMAIL_TIMER_TARGET=/etc/systemd/system/beatmyvendor-email.timer
MAINTENANCE_SERVICE_TARGET=/etc/systemd/system/beatmyvendor-maintenance.service
MAINTENANCE_TIMER_TARGET=/etc/systemd/system/beatmyvendor-maintenance.timer
NGINX_TARGET=/etc/nginx/sites-available/beatmyvendor
NGINX_ENABLED=/etc/nginx/sites-enabled/beatmyvendor
CERT_DIR=/etc/letsencrypt/live/beatmyvendor.com
ACME_ROOT=/var/www/beatmyvendor-certbot
BACKUP_ROOT=/var/backups/beatmyvendor
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
CREDENTIAL_PATH=/etc/credstore.encrypted/beatmyvendor.env

[[ $EUID -eq 0 ]] || { echo "Run this installer with sudo." >&2; exit 1; }
[[ -r "$CREDENTIAL_PATH" ]] || { echo "Missing encrypted production credential: $CREDENTIAL_PATH" >&2; exit 1; }

for required_file in "$SERVICE_SOURCE" "$EMAIL_SERVICE_SOURCE" "$EMAIL_TIMER_SOURCE" "$MAINTENANCE_SERVICE_SOURCE" "$MAINTENANCE_TIMER_SOURCE" "$HTTP_SOURCE" "$HTTPS_SOURCE"; do
  [[ -f "$required_file" ]] || { echo "Missing deployment file: $required_file" >&2; exit 1; }
done

mkdir -p "$BACKUP_DIR" "$ACME_ROOT"
if [[ -e "$SERVICE_TARGET" ]]; then cp -a "$SERVICE_TARGET" "$BACKUP_DIR/beatmyvendor.service"; fi
if [[ -e "$EMAIL_SERVICE_TARGET" ]]; then cp -a "$EMAIL_SERVICE_TARGET" "$BACKUP_DIR/beatmyvendor-email.service"; fi
if [[ -e "$EMAIL_TIMER_TARGET" ]]; then cp -a "$EMAIL_TIMER_TARGET" "$BACKUP_DIR/beatmyvendor-email.timer"; fi
if [[ -e "$MAINTENANCE_SERVICE_TARGET" ]]; then cp -a "$MAINTENANCE_SERVICE_TARGET" "$BACKUP_DIR/beatmyvendor-maintenance.service"; fi
if [[ -e "$MAINTENANCE_TIMER_TARGET" ]]; then cp -a "$MAINTENANCE_TIMER_TARGET" "$BACKUP_DIR/beatmyvendor-maintenance.timer"; fi
if [[ -e "$NGINX_TARGET" ]]; then cp -a "$NGINX_TARGET" "$BACKUP_DIR/nginx-beatmyvendor"; fi
if [[ -L "$NGINX_ENABLED" ]]; then cp -a "$NGINX_ENABLED" "$BACKUP_DIR/beatmyvendor-enabled-link"; fi

install -o root -g root -m 0644 "$SERVICE_SOURCE" "$SERVICE_TARGET"
install -o root -g root -m 0644 "$EMAIL_SERVICE_SOURCE" "$EMAIL_SERVICE_TARGET"
install -o root -g root -m 0644 "$EMAIL_TIMER_SOURCE" "$EMAIL_TIMER_TARGET"
install -o root -g root -m 0644 "$MAINTENANCE_SERVICE_SOURCE" "$MAINTENANCE_SERVICE_TARGET"
install -o root -g root -m 0644 "$MAINTENANCE_TIMER_SOURCE" "$MAINTENANCE_TIMER_TARGET"
systemctl daemon-reload
systemctl enable beatmyvendor.service
systemctl restart beatmyvendor.service

for attempt in {1..20}; do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3000/ >/dev/null; then break; fi
  if [[ $attempt -eq 20 ]]; then
    systemctl --no-pager --full status beatmyvendor.service
    journalctl -u beatmyvendor.service -n 80 --no-pager
    exit 1
  fi
  sleep 1
done
echo "Local application check passed on 127.0.0.1:3000."

webhook_probe_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --request POST \
  --header 'stripe-signature: t=0,v1=preflight' --header 'content-type: application/json' --data '{}' \
  http://127.0.0.1:3000/api/stripe/webhook)
if [[ "$webhook_probe_status" == 503 ]]; then
  echo "Stripe webhook is not configured (HTTP 503): STRIPE_WEBHOOK_SECRET is missing from the credential." >&2
  exit 1
fi
echo "Stripe webhook endpoint is configured (HTTP $webhook_probe_status)."

worker_probe_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --request POST http://127.0.0.1:3000/api/maintenance/notifications)
if [[ "$worker_probe_status" != 401 ]]; then
  echo "Email worker endpoint check failed with HTTP $worker_probe_status; the timer was not enabled." >&2
  exit 1
fi
echo "Email worker endpoint check passed."
systemctl enable --now beatmyvendor-email.timer

maintenance_probe_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --request POST http://127.0.0.1:3000/api/maintenance/expiry)
if [[ "$maintenance_probe_status" != 401 ]]; then
  echo "Maintenance endpoint check failed with HTTP $maintenance_probe_status; the timer was not enabled." >&2
  exit 1
fi
echo "Maintenance endpoint check passed."
systemctl enable --now beatmyvendor-maintenance.timer

install -o root -g root -m 0644 "$HTTP_SOURCE" "$NGINX_TARGET"
ln -sfn "$NGINX_TARGET" "$NGINX_ENABLED"
if ! nginx -t; then
  echo "Initial Nginx validation failed; Nginx was not reloaded." >&2
  exit 1
fi
systemctl reload nginx

certificate_valid=false
if [[ -s "$CERT_DIR/fullchain.pem" && -s "$CERT_DIR/privkey.pem" ]] &&
   openssl x509 -checkend 2592000 -noout -in "$CERT_DIR/fullchain.pem" &&
   openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -ext subjectAltName | grep -q "DNS:beatmyvendor.com" &&
   openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -ext subjectAltName | grep -q "DNS:www.beatmyvendor.com"; then
  certificate_valid=true
  echo "Reusing the existing valid certificate."
fi

if [[ "$certificate_valid" != true ]]; then
  : "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL to the certificate account email.}"
  certbot certonly --webroot -w "$ACME_ROOT" --non-interactive --agree-tos --email "$CERTBOT_EMAIL" --cert-name beatmyvendor.com -d beatmyvendor.com -d www.beatmyvendor.com
fi

cp -a "$NGINX_TARGET" "$BACKUP_DIR/nginx-beatmyvendor-http"
install -o root -g root -m 0644 "$HTTPS_SOURCE" "$NGINX_TARGET"
if ! nginx -t; then
  cp -a "$BACKUP_DIR/nginx-beatmyvendor-http" "$NGINX_TARGET"
  echo "HTTPS Nginx validation failed; the validated HTTP config was restored and Nginx was not reloaded." >&2
  exit 1
fi
systemctl reload nginx

systemctl --no-pager --full status beatmyvendor.service
systemctl --no-pager --full status beatmyvendor-email.timer
systemctl --no-pager --full status beatmyvendor-maintenance.timer
nginx -t
echo "BeatMyVendor HTTPS installation completed. Backup: $BACKUP_DIR"
