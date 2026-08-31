#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PRODUCTION_BASE_URL:-https://beatmyvendor.com}"
EXPECTED_ORIGIN="${PRODUCTION_EXPECTED_ORIGIN:-https://beatmyvendor.com}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

passes=0

pass() {
  passes=$((passes + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  printf 'FAIL  %s\n' "$1" >&2
  exit 1
}

fetch() {
  local name="$1"
  local path="$2"
  curl --silent --show-error --location --max-time 30 \
    --dump-header "$TMP_DIR/$name.headers" \
    --output "$TMP_DIR/$name.body" \
    "$BASE_URL$path"
}

status_for_post() {
  curl --silent --show-error --max-time 30 \
    --output /dev/null --write-out '%{http_code}' \
    --request POST "$BASE_URL$1"
}

fetch home /
fetch login /login
fetch robots /robots.txt
fetch sitemap /sitemap.xml

csp="$(awk 'BEGIN{IGNORECASE=1} /^content-security-policy:/ {sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}' "$TMP_DIR/home.headers")"
[[ -n "$csp" ]] || fail "homepage has a Content-Security-Policy header"
for required in \
  "connect-src" \
  "https://ncwkszbsyoqyhgoutxen.supabase.co" \
  "https://us.i.posthog.com" \
  "https://challenges.cloudflare.com" \
  "script-src" \
  "frame-src" \
  "https://js.stripe.com"; do
  [[ "$csp" == *"$required"* ]] || fail "CSP contains $required"
done
pass "CSP allowlists Supabase, PostHog US, Turnstile, and Stripe"

grep -qF 'https://challenges.cloudflare.com/turnstile/v0/api.js' "$TMP_DIR/login.body" || fail "login includes the Turnstile script"
grep -q 'data-sitekey="[^"]\+"' "$TMP_DIR/login.body" || fail "login includes a Turnstile site key"
pass "Turnstile script and site key are present on login"

grep -qF "Sitemap: $EXPECTED_ORIGIN/sitemap.xml" "$TMP_DIR/robots.body" || fail "robots.txt advertises the canonical sitemap"
grep -qF "Host: $EXPECTED_ORIGIN/" "$TMP_DIR/robots.body" || fail "robots.txt advertises the canonical host"
for private in admin api auth buyer vendor account login onboarding report start offline unauthorized; do
  grep -qF "Disallow: /$private" "$TMP_DIR/robots.body" || fail "robots.txt disallows /$private"
done
pass "robots.txt advertises the public origin and excludes private surfaces"

mapfile -t sitemap_urls < <(sed -n 's:.*<loc>\([^<]*\)</loc>.*:\1:p' "$TMP_DIR/sitemap.body")
(( ${#sitemap_urls[@]} > 0 )) || fail "sitemap contains URLs"
for required_path in / /how-it-works /vendors /pricing /trust /privacy /terms /imprint /cookies /duels /wins; do
  count=0
  for url in "${sitemap_urls[@]}"; do
    [[ "$url" == "$EXPECTED_ORIGIN$required_path" ]] && count=$((count + 1))
  done
  [[ $count -eq 1 ]] || fail "sitemap contains $EXPECTED_ORIGIN$required_path exactly once (found $count)"
done
for url in "${sitemap_urls[@]}"; do
  [[ "$url" == "$EXPECTED_ORIGIN"/* ]] || fail "sitemap URL has unexpected origin: $url"
  case "$url" in
    "$EXPECTED_ORIGIN"/buyer|"$EXPECTED_ORIGIN"/buyer/*|\
    "$EXPECTED_ORIGIN"/vendor|"$EXPECTED_ORIGIN"/vendor/*|\
    "$EXPECTED_ORIGIN"/admin|"$EXPECTED_ORIGIN"/admin/*|\
    "$EXPECTED_ORIGIN"/account|"$EXPECTED_ORIGIN"/account/*)
      fail "sitemap contains private URL: $url"
      ;;
  esac
done
duplicates="$(printf '%s\n' "${sitemap_urls[@]}" | sort | uniq -d)"
[[ -z "$duplicates" ]] || fail "sitemap contains duplicate URLs: $duplicates"
pass "sitemap uses the public origin, contains canonical pages once, and excludes private routes"

for private in buyer vendor admin account; do
  headers="$TMP_DIR/$private.headers"
  curl --silent --show-error --max-time 30 \
    --dump-header "$headers" --output /dev/null "$BASE_URL/$private"
  status="$(awk 'toupper($1) ~ /^HTTP\// {code=$2} END {print code}' "$headers")"
  location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}' "$headers")"
  robots_tag="$(awk 'BEGIN{IGNORECASE=1} /^x-robots-tag:/ {sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}' "$headers")"
  [[ "$status" == 307 || "$status" == 308 ]] || fail "/$private redirects unauthenticated traffic (HTTP $status)"
  [[ "$location" == "$EXPECTED_ORIGIN/login?next="* ]] || fail "/$private redirects to the canonical login URL (got $location)"
  [[ "$robots_tag" == *noindex* ]] || fail "/$private emits X-Robots-Tag noindex"
done
pass "private routes redirect canonically and emit noindex"

[[ "$(status_for_post /api/stripe/webhook)" == 400 ]] || fail "unsigned Stripe webhook returns HTTP 400"
[[ "$(status_for_post /api/maintenance/expiry)" == 401 ]] || fail "unauthenticated expiry endpoint returns HTTP 401"
[[ "$(status_for_post /api/maintenance/notifications)" == 401 ]] || fail "unauthenticated notifications endpoint returns HTTP 401"
pass "public endpoint contracts reject unsigned or unauthenticated POSTs"

if command -v systemctl >/dev/null 2>&1 && [[ "${QUALIFY_SKIP_SYSTEMD:-0}" != 1 ]]; then
  for unit in beatmyvendor.service beatmyvendor-email.timer beatmyvendor-maintenance.timer; do
    systemctl is-active --quiet "$unit" || fail "$unit is active"
    systemctl is-enabled --quiet "$unit" || fail "$unit is enabled"
  done
  pass "application service and both timers are active and enabled"
else
  printf 'SKIP  local systemd checks (set QUALIFY_SKIP_SYSTEMD=0 on the production host)\n'
fi

printf '\nProduction read-only qualification passed (%d checks).\n' "$passes"
