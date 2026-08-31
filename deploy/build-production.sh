#!/usr/bin/env bash
set -euo pipefail

# Rebuilds the production bundle with the full credential env exported so that
# NEXT_PUBLIC_* keys are inlined into the client bundle. Next.js inlines
# NEXT_PUBLIC_* at build time (`next build`); if they are absent the code falls
# back to its defaults and Turnstile + analytics stay dormant in the browser,
# and the analytics host falls back to eu.i.posthog.com (see the launch-readiness
# audit, Phase 1). A plain `npm run build` therefore MUST NOT be used to produce
# the deployed bundle — use this wrapper.
#
# Env source, in priority order:
#   1. A plaintext env file passed as $1.
#   2. The systemd-encrypted credential, decrypted with systemd-creds (requires
#      root to read /etc/credstore.encrypted). This is the durable path once the
#      plaintext env files have been removed from the host.
#   3. .env.production.local in the app directory.
#
# Usage:
#   deploy/build-production.sh path/to/plaintext.env   # explicit plaintext env
#   sudo deploy/build-production.sh                     # decrypt the credential
#   deploy/build-production.sh                          # .env.production.local
#
# When run as root, the build itself runs as $BUILD_USER (default: the owner of
# the app directory) so the .next artifacts stay owned by the service account,
# and it uses that user's Node toolchain (nvm) — root's system Node is often too
# old for Next.js.

APP_DIR=/home/mignon/apps/VendorDuel
CREDENTIAL_PATH=/etc/credstore.encrypted/beatmyvendor.env
LOCAL_ENV_FILE="$APP_DIR/.env.production.local"
BUILD_USER="${BUILD_USER:-$(stat -c '%U' "$APP_DIR")}"

cd "$APP_DIR"

# Prepend the build user's newest nvm Node to PATH so `next build` runs on a
# supported Node version regardless of who invoked the script (root's system
# Node is frequently < the version Next.js requires).
BUILD_USER_HOME="$(getent passwd "$BUILD_USER" | cut -d: -f6)"
NODE_BIN_DIR="$(ls -d "$BUILD_USER_HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -n1 || true)"
BUILD_PATH="$PATH"
if [[ -n "$NODE_BIN_DIR" ]]; then BUILD_PATH="$NODE_BIN_DIR:$PATH"; fi

ENV_FILE=""
CLEANUP_ENV=false

if [[ -n "${1:-}" ]]; then
  [[ -r "$1" ]] || { echo "Cannot read env file: $1" >&2; exit 1; }
  ENV_FILE="$1"
elif [[ $EUID -eq 0 && -r "$CREDENTIAL_PATH" ]]; then
  ENV_FILE="$(mktemp)"
  CLEANUP_ENV=true
  chmod 0600 "$ENV_FILE"
  systemd-creds decrypt --name=beatmyvendor.env "$CREDENTIAL_PATH" "$ENV_FILE"
  chown "$BUILD_USER" "$ENV_FILE"
elif [[ -r "$LOCAL_ENV_FILE" ]]; then
  ENV_FILE="$LOCAL_ENV_FILE"
else
  echo "No env source found. Pass a plaintext env file, run as root with the" >&2
  echo "encrypted credential at $CREDENTIAL_PATH, or create $LOCAL_ENV_FILE." >&2
  exit 1
fi

cleanup() { if [[ "$CLEANUP_ENV" == true && -f "$ENV_FILE" ]]; then shred -u "$ENV_FILE"; fi; }
trap cleanup EXIT

# Source the env inside the build shell so every NEXT_PUBLIC_* value is present
# for `next build`. The public origin is deliberately enforced *after* sourcing:
# a stale localhost value in the credential must never generate production
# canonicals, sitemap entries, or authentication redirects.
BUILD_INNER='set -a; source "$0"; set +a; export NODE_ENV=production; export NEXT_PUBLIC_SITE_URL=https://beatmyvendor.com; export NEXT_PUBLIC_OPTIONAL_COOKIES_ENABLED=true; exec npm run build'

if [[ $EUID -eq 0 && "$BUILD_USER" != "root" ]]; then
  runuser -u "$BUILD_USER" -- env \
    PATH="$BUILD_PATH" \
    bash -c "$BUILD_INNER" "$ENV_FILE"
else
  env \
    PATH="$BUILD_PATH" \
    bash -c "$BUILD_INNER" "$ENV_FILE"
fi

echo "Production build complete. Verify embedded public keys, then restart:"
echo "  sudo deploy/install-root.sh"
