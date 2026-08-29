#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/home/mignon/apps/VendorDuel
SERVICE_SOURCE="$APP_DIR/deploy/beatmyvendor.service"
HTTP_SOURCE="$APP_DIR/deploy/nginx-beatmyvendor-http.conf"
HTTPS_SOURCE="$APP_DIR/deploy/nginx-beatmyvendor-https.conf"
SERVICE_TARGET=/etc/systemd/system/beatmyvendor.service
NGINX_TARGET=/etc/nginx/sites-available/beatmyvendor
NGINX_ENABLED=/etc/nginx/sites-enabled/beatmyvendor
CERT_DIR=/etc/letsencrypt/live/beatmyvendor.com
ACME_ROOT=/var/www/beatmyvendor-certbot
BACKUP_ROOT=/var/backups/beatmyvendor
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

[[ $EUID -eq 0 ]] || { echo "Run this installer with sudo." >&2; exit 1; }

for required_file in "$SERVICE_SOURCE" "$HTTP_SOURCE" "$HTTPS_SOURCE"; do
  [[ -f "$required_file" ]] || { echo "Missing deployment file: $required_file" >&2; exit 1; }
done

mkdir -p "$BACKUP_DIR" "$ACME_ROOT"
if [[ -e "$SERVICE_TARGET" ]]; then cp -a "$SERVICE_TARGET" "$BACKUP_DIR/beatmyvendor.service"; fi
if [[ -e "$NGINX_TARGET" ]]; then cp -a "$NGINX_TARGET" "$BACKUP_DIR/nginx-beatmyvendor"; fi
if [[ -L "$NGINX_ENABLED" ]]; then cp -a "$NGINX_ENABLED" "$BACKUP_DIR/beatmyvendor-enabled-link"; fi

install -o root -g root -m 0644 "$SERVICE_SOURCE" "$SERVICE_TARGET"
systemctl daemon-reload
systemctl enable --now beatmyvendor.service

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
nginx -t
echo "BeatMyVendor HTTPS installation completed. Backup: $BACKUP_DIR"
