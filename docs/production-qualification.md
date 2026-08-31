# BeatMyVendor — Production Qualification & Release Gate

This is the release gate for BeatMyVendor (BMV-034). It turns the remediated
business, security, payment, and privacy rules into repeatable checks and lists
the production configuration that must be qualified before launch.

## 1. Automated gate (run in CI and before every release)

```bash
# Code gate: lint, typecheck, unit tests, production build
npm run check

# Read-only live-environment gate (run on the production host)
npm run qualify:production

# + RLS / payment / lifecycle SQL security suite (transactional, rolls back)
QUALIFY_DATABASE_URL="postgresql://…disposable-or-staging…" npm run qualify

# Full gate (adds Playwright end-to-end)
QUALIFY_DATABASE_URL="postgresql://…" npm run qualify:full
```

- `npm run test:sql` runs `supabase/tests/marketplace_security.sql` against
  `QUALIFY_DATABASE_URL` (or `DATABASE_URL`). The suite is a single transaction
  that **rolls back**, so it is non-destructive. Without a URL it skips.
- Prefer a disposable/staging database. It is safe against production because it
  rolls back, but a staging clone avoids consuming production identity sequences.

### What the SQL suite proves
Direct-write revocation (users / buyer_profiles / offers / requirements /
deal_outcomes); the contact/company disclosure detector; offer-lock immutability;
Stripe webhook idempotency (failed / expired / success / duplicate); identity is
hidden before payment and revealed after; refund reconciliation revokes identity;
recurring fees fold into annual spend; a material spend edit invalidates
verification; expired offers cannot be selected; the rate limiter, matching, and
admin-evidence functions have correct privileges; opportunity matching is gated
to approved members.

## 2. Manual production configuration qualification

These cannot be asserted from code and must be checked in the live environment.

| Area | Check |
|---|---|
| Secrets (BMV-001) | Every credential rotated and stored only in the encrypted systemd credential; no `supabase_keys.md` on the host. |
| Stripe (BMV-006/007) | Live keys configured; live webhook endpoint `https://beatmyvendor.com/api/stripe/webhook` created with checkout + refund events; the Price is exactly €99 (9900 EUR) and matches `introduction_fee_cents()`; a live/controlled test checkout + refund completes and identity reveal/revoke behave correctly. |
| Webhook health | `POST /api/stripe/webhook` (unsigned) returns 400, not 503. |
| Maintenance jobs | `beatmyvendor-email` and `beatmyvendor-maintenance` timers active; expiry + retention endpoints return 200 with the cron secret. |
| CSP (BMV-035) | Browser smoke test: Stripe checkout redirect, Supabase-backed images (vendor logos), and (if enabled) Turnstile/analytics load without CSP violations. |
| Auth/RLS | Vendor cannot read buyer identity before a paid introduction via UI, API, RLS, storage, metadata, logs, or free text. |
| Storage | Private verification documents are never publicly accessible; retention job deletes on schedule. |
| Consent/analytics (BMV-026/030) | No analytics network request before Analytics consent; rejecting consent stops it. |
| SEO (BMV-028) | Public canonical pages appear once in the sitemap; `/buyer`, `/vendor`, `/admin`, `/account`, `/onboarding` emit `noindex`. |
| Observability (BMV-027) | With `SENTRY_DSN` set, a forced error appears in Sentry with a correlation id; secrets/PII are redacted in logs. |
| Ops | Backup/restore rehearsed; `deploy/install-root.sh` rollback path verified; health checks and DNS/email (SPF/DKIM) confirmed. |

## 3. Deferred items

FR/DE localization, catalog-source consolidation, and dedicated fraud tooling
are post-launch. The controlled live EUR 99 checkout/refund is deferred to the
Phase 8 final gate; the live Stripe configuration itself is already active.

## 4. Phase 4 execution log — 2026-08-31

The initial read-only live probe passed the CSP allowlist and Turnstile-presence
checks, then found a release-blocking canonical-origin defect:

- `robots.txt` advertised `http://localhost:3000/sitemap.xml`.
- Every sitemap URL used `http://localhost:3000`.
- Unauthenticated `/buyer`, `/vendor`, `/admin`, and `/account` requests
  redirected to `http://localhost:3000/login`.

Root cause: `deploy/build-production.sh` set `NEXT_PUBLIC_SITE_URL` before
sourcing the encrypted credential, so a stale credential value could overwrite
the production origin. The wrapper now enforces the public origin after sourcing,
and `deploy/install-root.sh` refuses builds whose generated robots or sitemap
metadata contain localhost. Private redirects also emit `X-Robots-Tag: noindex`
so the SEO contract remains visible even when authentication redirects before
layout metadata renders.

- [ ] `npm run qualify:production` passes after corrected deploy (record UTC,
      commit, and operator).
- [ ] Turnstile challenge completion/siteverify confirmed manually.
- [ ] PostHog dormant-before-consent and capture-after-consent confirmed manually.
- [ ] Sentry forced error/correlation/redaction confirmed manually.
- [ ] Email SPF/DKIM/DMARC and inbox delivery confirmed manually.
- [ ] CSP browser smoke, private storage/retention, backup/restore, and installer
      rollback rehearsals confirmed manually.
- [ ] Live EUR 99 checkout/refund identity reveal/revoke deferred to Phase 8.
