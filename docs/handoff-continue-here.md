# BeatMyVendor — Launch handoff (continue here)

_Last updated 2026-08-31 by Codex. This is the authoritative "where we are / what's
next" note for the next agent (codex) or a future session. Read this first, then
`docs/beatmyvendor-launch-readiness-audit.md` (the update block at its top is current)._

## TL;DR
- Launch path: **Phase 0 → 1 → 2 → 3 → 4 → 8**. FR/DE (Phase 5) **re-scoped to a
  post-launch fast-follow** (user decision). Phases 6, 7 are post-launch.
- **DONE & verified: Phases 0, 1, 3.** **Phase 2 config is live**; only its one
  manual live-card smoke remains (deferred to Phase 8).
- **Phase 4 COMPLETE.** Automated gate passed all 7 checks; DMARC, PostHog,
  Turnstile, Sentry, inbox delivery, CSP/storage, backup/restore, and installer
  rollback are verified (manual items operator-confirmed 2026-08-31).
- **Phase 8 CLOSED WITH OPERATOR WAIVER.** The selection enum-cast fix is live;
  selection and pre-payment identity locking passed in production. The operator
  declined to incur a real EUR 99 charge, so live reveal/refund remains untested
  and is explicitly waived, not marked passed. The unpaid Checkout was expired,
  reconciled to `cancelled`, and identity remained locked.
- The live Stripe webhook now also subscribes to `checkout.session.expired` and
  `checkout.session.async_payment_failed`, matching the events handled by code.
- **NEXT:** fast-forward the release branch to `main`; then Phase 5 FR/DE is the
  first post-launch fast-follow.
- Working branch: **`phase0-remediation-durability`** (NOT merged to `main`).
  All Phase 0–3 work and the current Phase 4 code are committed. Nothing is on `main`.

## Environment map
- App host dir: `/home/mignon/apps/VendorDuel`. Node **v22.23.2** via nvm at
  `/home/mignon/.nvm/versions/node/v22.23.2/bin` (root's system Node is 18 — too old;
  `deploy/build-production.sh` forces the nvm Node).
- Production runs under systemd: `beatmyvendor.service` (+ `-email.timer`,
  `-maintenance.timer`), all active/enabled. App on `127.0.0.1:3000` behind nginx
  (HTTPS `beatmyvendor.com`).
- Production secrets: **encrypted** systemd credential at
  `/etc/credstore.encrypted/beatmyvendor.env` (root-only). Plaintext files were
  shredded. To inspect/edit: `sudo systemd-creds decrypt --name=beatmyvendor.env
  /etc/credstore.encrypted/beatmyvendor.env /tmp/x.env` → edit →
  `sudo deploy/encrypt-credential.sh /tmp/x.env` (re-encrypts + shreds) →
  `sudo deploy/build-production.sh && sudo deploy/install-root.sh`.
- Prod Supabase ref: `ncwkszbsyoqyhgoutxen`. Prod Stripe is **live** (`sk_live`,
  live webhook `https://beatmyvendor.com/api/stripe/webhook`, live 9900 EUR price).
- **Staging** (for tests only) Supabase ref: `iwnorhkumeesbpnvqrbo`. Config lives in
  `.env.test.local` (gitignored). See `docs/testing-phase3.md` + memory
  `phase3-e2e-staging`.

## What is DONE (verified)
### Phase 0 — durability & config ✅
- All remediation committed. `docs/production-secrets.md` gitignored, no secrets.
- Plaintext `beatmyvendor.env` + `supabase_keys.md` shredded from host.
- Credential re-encrypted with corrected keys. Fixed a real bug: `NEXT_PUBLIC_LEGAL_NAME`
  was unquoted → broke `source` in `run-with-production-env.sh`.

### Phase 1 — rebuild + activate keys ✅
- `deploy/build-production.sh` (`npm run build:production`) exports the credential
  before `next build` so `NEXT_PUBLIC_*` are inlined; `deploy/install-root.sh` now
  **refuses to deploy a keyless build** (greps `.next/static` for the real keys).
- Verified live: build + runtime CSP serve `us.i.posthog.com` with the real PostHog
  + Turnstile (`0x4AAA…`) keys. Bot protection + analytics active. Service restarted
  07:30:59 UTC on the keyed build.

### Phase 2 — live Stripe (config) ✅ / (live smoke) ⏳
- Credential holds `sk_live`, live `whsec`, live `price_…` (9900 EUR =
  `introduction_fee_cents()`). Live webhook subscribes checkout + async +
  `charge.refunded`. Credential predates svc start ⇒ live key loaded.
- **REMAINING (do at Phase 8):** one controlled **live** €99 card checkout + refund,
  confirming identity reveal then revoke. Needs a human with a real card. Small.

### Phase 3 — authenticated E2E (BMV-034) ✅
- Staging Supabase project; all 25 migrations applied; SQL security suite green.
- Auth fixture (`tests/fixtures/auth.ts`) + journey (`tests/journey/`) green:
  buyer sees duel → vendor identity locked pre-payment → real billing action →
  real Stripe test session → signed `checkout.session.completed` reveals → signed
  `charge.refunded` revokes.
- Run: **`npm run qualify:staging`** (SQL gate + journey). Needs `.env.test.local`.

## NEXT: Phase 4 — production qualification
Goal: prove the LIVE environment behaves per the release gate. Record results in
`docs/production-qualification.md`. Split into what an agent can automate vs. manual.

### 4a. Automatable (an agent can script/verify these)
Do these against **production** `https://beatmyvendor.com` (read-only probes) unless noted.
1. **SEO**: fetch `/sitemap.xml` and `/robots.txt`; assert canonical/public pages
   appear once, private routes (`/buyer`, `/vendor`, `/admin`, `/account`) emit
   `noindex` (check their response headers/meta). `curl -s https://beatmyvendor.com/sitemap.xml`.
2. **CSP header smoke**: `curl -sI https://beatmyvendor.com/` → confirm CSP
   `connect-src` includes Supabase + `https://us.i.posthog.com` +
   `https://challenges.cloudflare.com`; `frame-src`/`script-src` include
   `js.stripe.com` + `challenges.cloudflare.com`. (Browser-level "no violations"
   smoke still needs a real browser — see 4b.)
3. **Turnstile present**: `curl -s https://beatmyvendor.com/login` → assert the
   Turnstile script/site-key `0x4AAA…` is present in the HTML (widget renders).
4. **Endpoint contract** (already true, re-assert): `POST /api/stripe/webhook`
   unsigned → 400; `POST /api/maintenance/expiry` and `/api/maintenance/notifications`
   unauth → 401; all three systemd timers active.
5. **Sentry forced error**: trigger a server error path and confirm an event with a
   correlation id arrives, secrets/PII redacted. `src/lib/observability.ts` is the
   integration; there is `/api/observability/client-error`. Consider a temporary
   guarded test route or use an existing error path; confirm in the Sentry project.
6. **Analytics dormant-before-consent**: unit test already asserts no-network-when-
   dormant; in a browser confirm no PostHog network call before consent, capture
   after. (Browser — 4b.)

### 4b. Manual (human required — cannot be automated here)
1. **Email/DNS**: add SPF, DKIM, DMARC for the sending domain; send a real
   transactional email and confirm **inbox** delivery (not just Resend 200). NOTE:
   the Resend key was rotated this session — confirm the current credential holds
   the rotated key and it delivers.
2. **CSP browser smoke**: load the site in a real browser; complete a Stripe redirect,
   load Supabase images, Turnstile + PostHog — confirm **zero** CSP violations in the
   console.
3. **Storage RLS**: confirm verification documents are never publicly reachable
   (try an unauthenticated URL), and retention deletes on schedule.
4. **Backup/restore rehearsal** and **`deploy/install-root.sh` rollback rehearsal**.
5. **Live Stripe smoke** (the deferred Phase 2 item): one real €99 checkout + refund.

## Phase 8 — final gate (after 4)
- Run `npm run qualify:staging` (green) + the manual checklist in the audit §11.
- Do the Phase 2 live-card smoke.
- Confirm acceptance criteria in `docs/beatmyvendor-launch-readiness-audit.md` §11.
- Merge `phase0-remediation-durability` → `main`; submit sitemap; add first vendors;
  announce 1.0.

## Non-obvious gotchas (WILL bite you if unknown)
- **Never `npm run build` on the prod host** — plain `next build` drops `NEXT_PUBLIC_*`
  and would deploy a keyless build. Use `deploy/build-production.sh`.
- **Staging DB is IPv6-only on the direct host**; this box is IPv4-only. `psql` must
  use the **session pooler** (`QUALIFY_POOLER_HOST`, port 5432, user `postgres.<ref>`).
  App/fixtures use the HTTPS API (fine over IPv4).
- **Staging DB password has `@`/`!`** → use psql **keyword conninfo + PGPASSWORD**, not
  a URI (libpq splits URIs at the first `@`).
- Journey seed teardown uses `set session_replication_role = replica` to bypass
  protective triggers, then restores `default` so insert-side triggers fire. It sets
  `request.jwt.claim.sub` per-actor for SECURITY DEFINER trigger writes.
- Vendor pays the fee; identity reveal is gated on introduction status paid/introduced.
- `AGENTS.md` block is re-added by `next dev`; commit it with your work if it appears
  dirty (it hasn't so far).

## How to run things
- Prod deploy (root): `sudo deploy/build-production.sh && sudo deploy/install-root.sh`.
- Unit/type/lint/build gate: `npm run check` (⚠ runs `next build` — do NOT on the prod
  host; run in a checkout that isn't serving prod, or just lint/typecheck/test).
- Staging E2E: `npm run qualify:staging` (SQL + journey); `npm run test:journey`;
  `npm run test:sql:staging`.
- Inspect prod credential prefixes safely: decrypt to stdout and `sed` the values.

## Key files added this session
- `deploy/build-production.sh`, `deploy/install-root.sh` (keyless-build gate).
- `tests/fixtures/auth.ts`, `tests/journey/*`, `supabase/tests/journey_seed.sql`,
  `scripts/run-journey.sh`, `scripts/run-sql-gate.sh`, `playwright.journey.config.ts`.
- Docs: `docs/testing-phase3.md`, this file.
- npm scripts: `build:production`, `test:journey`, `test:sql:staging`, `qualify:staging`.
