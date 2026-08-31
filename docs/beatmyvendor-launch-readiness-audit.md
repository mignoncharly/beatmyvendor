# BeatMyVendor — Launch Readiness Audit

_Fresh, evidence-based audit performed 2026-08-30 against the current working tree,
migrations, deployment scripts, running services, and the build on disk. Secret
values were never printed; only presence/mode/wiring states were checked._

> **Update 2026-08-31 (session).**
> - **Phase 0** durability is committed (`1257335`); `production-secrets.md` is
>   gitignored and holds no secrets. Residual = manual root steps only (remove
>   plaintext `beatmyvendor.env`/`supabase_keys.md` after re-encrypt).
> - **Phase 1 correction:** the "keys in build" claim below was a **false
>   positive**. The build embeds `eu.i.posthog.com` (code default) with **no**
>   real PostHog/Turnstile keys — Turnstile + analytics are still dormant. Root
>   cause: `NEXT_PUBLIC_LEGAL_NAME` was **unquoted** in `beatmyvendor.env`, so
>   `source` aborted and `run-with-production-env.sh` fell back to defaults at
>   both build and runtime. Fixed (quoted).
> - New durable build path: `deploy/build-production.sh` (`npm run build:production`)
>   exports the credential before `next build`; `deploy/install-root.sh` now
>   **refuses to deploy a keyless build**.
> - **Phases 0 and 1 COMPLETE (verified 07:30 UTC).** Plaintext secret files
>   removed; credential re-encrypted with corrected keys; rebuilt via
>   `build-production.sh` and restarted via `install-root.sh` (gate passed).
>   Runtime CSP + build now serve `us.i.posthog.com` with the real PostHog +
>   Turnstile keys → bot protection and analytics live.
> - **Phase 2 config LIVE (verified 07:30 UTC).** Credential holds `sk_live` +
>   live `whsec` + live `price_…`; live €99 (9900 EUR) price, live webhook
>   (checkout + async + `charge.refunded`), and price id all confirmed; Resend key
>   rotated. Credential mtime (07:30:49) predates svc start (07:30:59) ⇒ live key
>   loaded by the running process. **Remaining Phase 2:** one controlled live
>   checkout + refund qualifying identity reveal→revoke. Next engineering: **Phase 3**.
> - **Phase 3 authenticated E2E COMPLETE (BMV-034).** Stood up a staging Supabase
>   project (IPv4 session pooler), applied all 25 migrations, and ran the SQL
>   security suite green against it. Built a magic-link auth fixture + a full
>   authenticated journey (staging Supabase + Stripe test): buyer sees their duel;
>   vendor identity is **locked pre-payment**; the real billing action creates a
>   real Stripe test session; a signed `checkout.session.completed` **reveals** the
>   buyer identity; a signed `charge.refunded` **revokes** it. Runnable via
>   `npm run qualify:staging` (needs `.env.test.local`). Remaining Phase 2 live
>   real-card smoke stays deferred to Phase 8.
> - **Phase 4 production qualification COMPLETE (2026-08-31).** Credential-aware
>   build deployed; 7-check live gate green; canonical SEO/redirects, CSP,
>   Turnstile, PostHog consent, Sentry, email/DNS, storage/retention, and
>   backup/rollback verified. Manual provider/operations items operator-confirmed.
>   Only the Phase 8 controlled live checkout/refund remains before go/no-go.
> - **Phase 5 (FR/DE) formally re-scoped to a post-launch fast-follow.** Launch
>   path is now **0 → 1 → 2 → 3 → 4 → 8**; FR/DE no longer blocks 1.0.
>
> This audit supersedes the status claims in 
`docs/beatmyvendor-implementation-audit.md` where evidence differs. The prior
report is largely accurate on **code** completion (phases 0–7 are implemented),
but it materially understates two operational realities discovered here:

1. **None of the phase 0–7 remediation is committed to git.** `HEAD` is
   `03b4630` (rebrand). Every remediation file (7 new migrations, all new libs,
   the rewritten actions/pages, the maintenance units) is uncommitted (modified
   or untracked). Git history does **not** reflect the running product.
2. **The running deployment is a stale build that does not embed the new
   `NEXT_PUBLIC_*` keys.** The live process started `18:17:58`; the build on disk
   is `18:56`. The build embeds Supabase + site URL but **not** the Turnstile
   site key or the analytics key/host. Turnstile and PostHog are therefore
   **dormant in the browser today** even though the credential file now contains
   the keys.

---

## 1. Executive summary

The application **code** for BeatMyVendor 1.0 is substantially complete. All
39 BMV findings have code-level remediation in the working tree, all 16 audited
RPCs exist in the migrations, the security-definer boundary is in place, the
release-gate tooling exists, and the systemd app/email/maintenance units are
installed, **active, and enabled**. The user has now supplied every integration
credential (Supabase, Stripe, Resend, Sentry, PostHog, Turnstile, cron), and the
variable names in the credential match what the code reads.

What remains before launch is **not primarily new feature code**. It is:

- **Getting the remediated code into a durable, deployable state** (commit) and
  **rebuilding + restarting** so the running server actually serves the current
  code with the newly-supplied public keys baked in.
- **Going live on Stripe** (currently test mode) with a **live €99 price** and a
  **live webhook endpoint**, then qualifying checkout/refund/identity reveal.
- **Verifying activation** of Turnstile, PostHog, and Sentry end-to-end (they are
  wired but not yet effective in the browser build).
- **Authenticated end-to-end test coverage** and **manual production
  qualification** (email/DNS, CSP browser smoke, storage RLS, backup/restore,
  rollback), which are genuinely still outstanding.
- **French/German localization** — a stated 1.0 spec requirement not yet built.

The single biggest risk right now is process, not engineering: the remediation is
real but **uncommitted and unbuilt into the running server**.

## 2. Current production-readiness percentage

**Overall: ~78% launch-ready.**

| Dimension | Weight | Score | Notes |
|---|---:|---:|---|
| Feature/security code (BMV-002…040 excl. config) | 40% | ~95% | Implemented in working tree; two product items deferred (BMV-029, BMV-036). |
| Source control durability (commit state) | 10% | ~5% | All remediation uncommitted; not reflected in git history. |
| Configuration correctness (keys wired & mode) | 15% | ~70% | Keys present & names match; Stripe still **test**, keys not in build. |
| Deployment/runtime correctness | 10% | ~50% | Services active, but **stale build** running without public keys. |
| Automated test coverage | 10% | ~65% | Strong SQL + unit gate; **no authenticated UI journey**. |
| Manual production qualification | 10% | ~10% | Checklist exists; not executed. |
| Localization (FR/DE, spec-required) | 5% | 0% | Not started. |

The **code** is ~95% done; **launch-readiness** is dragged down by commit state,
live-payment cutover, rebuild/redeploy, qualification, and localization.

## 3. BMV-001 → BMV-040 status matrix (verified against current code)

Legend: DONE · PARTIAL · NOT DONE · CONFIG (configuration required) · MANUAL
(manual qualification required) · DEFERRED (product decision) · N/A.

| ID | Title (short) | Verified status | Evidence |
|---|---|---|---|
| BMV-001 | Plaintext production secrets on disk | **PARTIAL / CONFIG** | Encrypted systemd credential + `LoadCredentialEncrypted` in all units ✓. But plaintext `beatmyvendor.env` and `supabase_keys.md` still present on host; Stripe still test-mode ⇒ rotation to live not done. |
| BMV-002 | Suspended users clear own suspension | **DONE** | Self-update revoked; suspension via audited admin RPC (migrations). |
| BMV-003 | Buyers self-verify business email | **DONE** | Direct buyer_profile mutation revoked; onboarding-only writes. |
| BMV-004 | Offer-lock bypass | **DONE** | Direct offer mutation revoked; trigger rejects lock/term changes. |
| BMV-005 | Identity leak via free text | **DONE** | Buyer RPC + trigger reject contact/company disclosure; UI copy. |
| BMV-006 | Prod Stripe webhook/checkout | **CONFIG / MANUAL** | Running webhook returns **400** (configured) not 503; install-root fails fast if secret missing. Still **test mode**; live endpoint + test-card qualification outstanding. |
| BMV-007 | Fee €99.99 → €99 | **DONE (code) / CONFIG** | `introduction_fee_cents()=9900` overrides old 9999; copy reads €99. **Live €99 Price** not yet created/switched. |
| BMV-008 | Admin can't inspect spend evidence | **DONE** | `admin_verification_documents` + signed-URL action. |
| BMV-009 | Material edits don't invalidate verification | **DONE** | Trigger resets verification on material change. |
| BMV-010 | Outcome/public-win workflow absent | **DONE** | Outcome state machine RPCs + buyer/vendor/admin UIs. |
| BMV-011 | Buyers write untrusted outcomes | **DONE** | Direct writes revoked; `record_deal_outcome` bound to paid intro. |
| BMV-012 | Expired offers selectable | **DONE** | `validate_selection`/`select_buyer_offer` reject expired. |
| BMV-013 | Expiry not automated | **DONE / MANUAL** | `run_marketplace_expiry` + `/api/maintenance/expiry` + **active** timer. |
| BMV-014 | No rate limits / bot protection | **DONE (code) / CONFIG** | `check_rate_limit` applied server-side; Turnstile wired but **dormant in build** (site key not embedded). |
| BMV-015 | Lifecycle emails incomplete/misrouted | **DONE** | Recipient-role routing; payment_receipt enqueued. |
| BMV-016 | Annual spend excludes fees | **DONE** | Generated column folds recurring fees. |
| BMV-017 | Narrow matching | **DONE** | `match_vendor_opportunities` + `notify_matching_vendors`. |
| BMV-018 | Offer version incomplete | **DONE** | Snapshot pins full coverage matrix + version id. |
| BMV-019 | Refund divergence | **DONE / MANUAL** | Intent→refund→reconcile RPCs; `process_stripe_refund_event`. Live refund test outstanding. |
| BMV-020 | Buyer dashboard omits info | **DONE** | Per-duel offers/status/best saving/next action. |
| BMV-021 | Vendor profile/products incomplete | **DONE** | Logo bucket, contact email, product inventory. |
| BMV-022 | Client-limited opportunity paging | **DONE** | Indexed keyset pagination. |
| BMV-023 | Admin fraud/evidence/reconciliation tooling | **PARTIAL** | Evidence + refund reconciliation shipped; dedicated **fraud-signal queue** still future work. |
| BMV-024 | Upload trusts declared MIME | **DONE** | Magic-byte sniffing server-side. |
| BMV-025 | Buyer deletes evidence during review | **DONE** | Storage delete policy blocks pending/verified. |
| BMV-026 | Analytics absent | **DONE (code) / CONFIG** | Consent-gated analytics lib; **dormant in build** (key not embedded); host region needs confirming. |
| BMV-027 | No observability | **DONE / CONFIG** | `reportError` + Sentry envelope (server-only), DSN present; runtime-loaded. Forced-error smoke outstanding. |
| BMV-028 | Inconsistent SEO/JSON-LD | **DONE / MANUAL** | Safe `JsonLd`; noindex on private sections. Sitemap/canonical browser check outstanding. |
| BMV-029 | FR/DE localization absent | **NOT DONE** | `lang="en"` only; no i18n infra. Spec-required (see §9). |
| BMV-030 | Consent not wired to analytics | **DONE** | Analytics inits only after consent; no-network-when-dormant unit test. |
| BMV-031 | Loose currency/country validation | **DONE** | `is_iso_country`/`is_supported_currency` enforced. |
| BMV-032 | Redirect loses intent | **DONE** | Validated same-origin `next` survives login/onboarding. |
| BMV-033 | Over-fetch / default caps | **DONE** | Bounded `range()` admin pagination. |
| BMV-034 | Missing critical tests | **PARTIAL / MANUAL** | SQL suite (329 lines, ~44 checks) runs & passes via gate; **authenticated Playwright journey still missing**; external-service qualification manual. |
| BMV-035 | Architecture divergence / no CSP | **DONE / MANUAL** | Runtime CSP served (verified on `/`); browser smoke (Stripe/Supabase/Turnstile) outstanding. |
| BMV-036 | Static catalog duplicates DB catalog | **NOT DONE / DEFERRED** | `public-catalog.ts` is a static array; DB `software_products` separate. |
| BMV-037 | Savings not separated | **DONE** | Offered/Selected/Confirmed computed distinctly. |
| BMV-038 | Public/admin product incomplete | **DONE** | Consent + admin publish/unpublish; RLS gates. |
| BMV-039 | Report success/duplicate | **DONE** | Idempotent report + PRG success. |
| BMV-040 | Dead admin actions | **DONE** | `src/app/actions/admin.ts` deleted (git: `D`). |

**Tally:** DONE ~30 · PARTIAL 3 (BMV-001, BMV-023, BMV-034) · CONFIG-dependent
5 (BMV-006/007/014/026/027) · NOT DONE 2 (BMV-029, BMV-036).

## 4. Configuration / key readiness matrix

All variable names in the credential match what the code reads. States only —
no values shown.

| Variable | Present | Code reader | State |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | yes | supabase client, CSP | **configured & in build** |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | yes | supabase client | **configured & in build** |
| SUPABASE_SERVICE_ROLE_KEY | yes | server clients/jobs | configured (runtime) |
| STRIPE_SECRET_KEY | yes | stripe server | **test-mode** ⚠ |
| STRIPE_WEBHOOK_SECRET | yes | webhook verify | configured (test endpoint) |
| STRIPE_VENDOR_INTRODUCTION_PRICE_ID | yes | checkout | present — **test €99 price**, live not created |
| RESEND_API_KEY / FROM / REPLY_TO | yes | resend worker | configured (runtime); DNS unverified |
| CRON_SECRET | yes | maintenance/email auth | configured (runtime) |
| SENTRY_DSN | yes | observability (server-only) | configured (runtime-loaded) |
| NEXT_PUBLIC_ANALYTICS_KEY | yes | analytics.ts (client) | **not in build ⇒ dormant** |
| NEXT_PUBLIC_ANALYTICS_HOST | yes (`us.i.posthog.com`) | analytics.ts, CSP | CSP ok at runtime; **not in build**; verify key is a **US-region** project |
| NEXT_PUBLIC_TURNSTILE_SITE_KEY | yes | turnstile-widget (client) | **not in build ⇒ widget dormant** |
| TURNSTILE_SECRET_KEY | yes | turnstile.ts (server) | configured (runtime); verification will run once site key ships |
| NEXT_PUBLIC_LEGAL_* / PRIVACY_* | yes | imprint/privacy | configured |

**Critical wiring gap:** `NEXT_PUBLIC_*` are inlined at **build time**. The build
on disk fell back to the code default `eu.i.posthog.com` and contains **no**
`phc_` analytics key and **no** Turnstile site key. `run-with-production-env.sh`
only sources the credential for **runtime** (`next start`, workers); nothing
sources it for `npm run build`. → **A rebuild with the full credential exported
is required** before Turnstile/analytics work in the browser.

## 5. Deployment / runtime readiness

| Check | Result |
|---|---|
| Git HEAD | `03b4630` (rebrand). **All remediation uncommitted** (modified + untracked). |
| Migrations on disk | 25 files incl. 7 uncommitted remediation migrations. **Prod DB apply state UNVERIFIED** (no DB URL); RPCs function at runtime, implying applied. |
| `beatmyvendor.service` | **active, enabled** |
| `beatmyvendor-email.timer` | **active, enabled** |
| `beatmyvendor-maintenance.timer` | **active, enabled** |
| Installed unit files | present in `/etc/systemd/system` (root-owned, 2026-08-30 10:46) |
| Encrypted credential on host | assumed present (units running; not stat-able as non-root) — **UNVERIFIED as up-to-date with new keys** |
| Running process start | `2026-08-30 18:17:58` |
| Build on disk (`.next/BUILD_ID`) | `2026-08-30 18:56` ⇒ **running process is stale vs latest build** |
| Public keys in build | Supabase + site URL yes; **Turnstile/analytics no** |
| Webhook (`POST` unsigned, running) | **400** (configured) |
| Maintenance endpoints (unauth) | **401** ✓ |
| Homepage | **200**; CSP header served with PostHog host at runtime ✓ |

**Conclusion:** even though the current build were served, Turnstile/analytics
would be dormant. The correct sequence is: commit → rebuild with full env →
re-encrypt credential (if keys changed) → `install-root.sh` (restart) → qualify.

## 6. Automated-test coverage matrix

**A. Automated & in the code gate (`npm run check`)**
- Lint, typecheck, ~98 vitest unit tests (analytics no-network-when-dormant,
  anonymity detector, pricing/fee, ISO, resend, stripe-webhook, verification-doc,
  observability), production build.

**B. Automated but NOT in the default gate (needs a DB / browser)**
- `supabase/tests/marketplace_security.sql` (329 lines, ~44 assertions) — RLS
  matrix, direct-write revocation, offer immutability, webhook idempotency
  (failed/expired/success/duplicate), identity reveal/revoke, refund
  reconciliation, spend-edit invalidation, expiry, rate-limit/matching privileges.
  Runs only with `QUALIFY_DATABASE_URL` (`npm run test:sql`/`qualify`).
- Playwright `phase10` (responsive, WCAG A/AA, keyboard, 404/405, metadata) and
  `phase11` (public **unauthenticated** journey, security headers, robots/sitemap).
  Run via `test:e2e`/`check:full`, not in `check`.

**C. Missing automated coverage**
- **Authenticated end-to-end journey through the UI**: buyer duel creation →
  email/spend verification → vendor approval/matching → offer submit →
  comparison/selection → Stripe checkout → identity reveal → outcome → public win.
  Only the DB layer of this is covered (SQL suite); no UI/session fixtures exist.
- Turnstile-enabled form path; consent→analytics network behavior in a browser;
  Sentry correlation end-to-end.

**D. Manual production qualification** (see §7).

Coverage by required scenario:

| Scenario | Coverage |
|---|---|
| Buyer duel creation | SQL (data) + public UI up to sign-in; **no authed UI** |
| Work-email / spend verification | SQL; manual for storage+admin UI |
| Vendor approval / matching | SQL |
| Offer submit / immutability / versioning | SQL ✓ |
| Offer expiry | SQL ✓ |
| Comparison / selection | SQL ✓; no authed UI |
| Stripe checkout / dup webhook / out-of-order / failed / refund | SQL idempotency ✓; **live Stripe manual** |
| Identity reveal / revoke on refund | SQL ✓ |
| Deal outcome workflow | SQL/RPC ✓; no authed UI |
| Public win consent/publication | RPC ✓; no authed UI |
| Suspension / anonymity free-text | SQL ✓ |
| RLS matrix / storage RLS | SQL RLS ✓; **storage RLS manual** |
| Turnstile / rate limiting | rate-limit SQL ✓; **Turnstile manual after rebuild** |
| Analytics consent / Sentry | unit (dormant) ✓; **browser/live manual** |
| Email delivery | unit ✓; **live Resend + DNS manual** |
| Expiry/retention jobs | SQL + live 401 ✓; timers active |
| CSP / noindex / SEO / PWA | header served ✓; **browser smoke manual** |
| Mobile/responsive/a11y | Playwright phase10 ✓ |
| Backup/restore / rollback | **manual, not rehearsed** |

## 7. Manual qualification still required

1. **Stripe live**: create live €99 (9900 EUR) price = `introduction_fee_cents()`;
   create live webhook `https://beatmyvendor.com/api/stripe/webhook` (checkout +
   `charge.refunded`); switch credential price id to live; run a controlled live
   checkout **and** refund; confirm identity reveal then revoke.
2. **Turnstile**: after rebuild, confirm the widget renders and siteverify passes
   on login/report; confirm the site-key/secret pair belongs to the same site.
3. **PostHog**: confirm the analytics key belongs to a **US** project (host is
   `us.i.posthog.com`); confirm no network before consent and capture after.
4. **Sentry**: force an error; confirm event with correlation id; confirm
   secrets/PII redacted in logs.
5. **Email/DNS**: SPF/DKIM/DMARC for the sending domain; a real inbox delivery
   (not just an accepted Resend response).
6. **CSP browser smoke**: Stripe redirect, Supabase images, Turnstile/analytics
   load with **no** CSP violations.
7. **Storage RLS**: verification documents never publicly reachable; retention
   deletes on schedule.
8. **Auth/RLS end-to-end**: vendor cannot reach buyer identity pre-payment via
   UI/API/RLS/storage/logs/free text.
9. **SEO**: canonical pages appear once in sitemap; private routes emit `noindex`.
10. **Backup/restore rehearsal** and **`install-root.sh` rollback rehearsal**.
11. Confirm the **encrypted credential on the host** matches the newly-supplied
    keys (re-encrypt with `deploy/encrypt-credential.sh` if not).

## 8. Launch blockers

1. **Commit the remediation.** All phase 0–7 work is uncommitted; a deploy or
   rollback from git would erase it. (Small, but foundational.)
2. **Rebuild with the full credential env + restart.** Current build lacks the
   Turnstile/analytics public keys and the running process is stale. Without this,
   BMV-014 (Turnstile) and BMV-026 (analytics) are non-functional. (Small.)
3. **Live Stripe cutover + live €99 price + live webhook + qualification**
   (BMV-006/007/019). Revenue cannot happen in test mode. (Medium.)
4. **Verify the on-host encrypted credential contains the new keys** and rotate
   any still-test/exposed provider credential; remove plaintext `beatmyvendor.env`
   / `supabase_keys.md` from the host after encryption (BMV-001). (Small–Medium.)
5. **Authenticated end-to-end journey test** (at least one automated happy-path
   through the UI) + execution of the SQL gate against staging (BMV-034). (Medium.)
6. **Core manual production qualification**: Stripe live checkout/refund, email
   inbox + DNS, CSP browser smoke, storage RLS, backup/restore + rollback
   rehearsal (§7 items 1,5,6,7,10). (Medium.)
7. **FR/DE localization** (BMV-029) — **spec-required for 1.0** (see §9). This is
   the one blocker that is a genuine scope decision for you. (Large.)

## 9. Non-blocking post-launch work

- **BMV-036 catalog consolidation** — an internal de-duplication of the static
  `public-catalog.ts` against the DB `software_products`. Not user-visible; no
  spec statement requires a single source for 1.0. **Post-launch.**
- **BMV-023 fraud-signal queue** — evidence review and refund reconciliation are
  shipped; a dedicated fraud queue is an enhancement. **Post-launch.**
- **CSP nonce hardening** (remove `script-src 'unsafe-inline'`) — noted as future.
- **Client-side Sentry** (currently server-only + client beacon) — optional.
- **Out-of-order/edge webhook fuzzing** beyond the current idempotency assertions.

### Localization reasoning (why BMV-029 blocks)
`docs/beatmyvendor.md` opens with the 1.0 scope line: _"english is default
language, **and add french and german**"_, and Phase 9 lists localized legal
copy. The spec therefore treats FR/DE as in-scope for the 1.0 release, not a
later iteration. The current app is English-only (`lang="en"`, no i18n). By the
letter of the spec this **blocks 1.0**. It is also the largest single remaining
effort. **Recommendation:** confirm whether you want to launch English-first and
formally re-scope FR/DE to a fast-follow; if not re-scoped, it is a blocker.

## 10. New implementation phases

Ordered by dependency. Names derived from findings, not the template.

---

### Phase 0 — Source-control durability & configuration correctness
- **Goal:** Make the remediated code durable and make the on-host configuration
  provably correct before anything else.
- **Why required:** All phase 0–7 work is uncommitted; any redeploy/rollback loses
  it. Keys exist but their build-time/runtime placement is not yet correct.
- **Findings/tasks:** commit the working tree on a branch (verify `AGENTS.md`
  Next.js agent block is committed with the work, not left dirty); confirm the
  encrypted credential on the host matches the new keys (`encrypt-credential.sh`
  if not); add `docs/production-secrets.md` to `.gitignore` (currently not
  ignored) and confirm it holds no secrets; remove plaintext `beatmyvendor.env`
  and `supabase_keys.md` from the host after encryption (BMV-001).
- **Files/components:** git; `deploy/encrypt-credential.sh`; `.gitignore`.
- **DB changes:** none.
- **Backend/Frontend:** none.
- **Deployment/config:** re-encrypt credential; confirm `/etc/credstore.encrypted`.
- **Tests:** `npm run check` clean on the committed tree.
- **Manual steps (you):** run the encrypt step as root if keys changed; confirm
  no plaintext secret files remain on the host.
- **Security:** closes BMV-001 residual (plaintext on disk).
- **Dependencies:** none. **Blocks launch:** yes. **Complexity:** Small.

### Phase 1 — Rebuild with full env, redeploy, verify activation
- **Goal:** Serve the current code with Turnstile/analytics keys embedded, on a
  freshly restarted service.
- **Why required:** Running process is stale (18:17 < 18:56 build) and the build
  lacks `NEXT_PUBLIC` analytics/Turnstile keys ⇒ both dormant in the browser.
- **Findings/tasks (BMV-014, BMV-026, BMV-027, BMV-035):** add a build step that
  exports the credential before `next build` (e.g. reuse
  `run-with-production-env.sh` to wrap the build, or document it in
  `install-root.sh`); rebuild; run `install-root.sh` (restarts + probes webhook
  400 / worker 401 / maintenance 401); confirm the served CSP `connect-src`
  contains the analytics host and Turnstile.
- **Files/components:** `deploy/install-root.sh`, `deploy/run-with-production-env.sh`,
  `next.config.ts` (verify only), `.next` (rebuilt).
- **DB changes:** none.
- **Backend:** build pipeline only. **Frontend:** none (re-embed keys).
- **Deployment/config:** rebuild + restart via installer.
- **Tests:** post-deploy probes; grep the new build embeds the site/analytics keys.
- **Manual steps (you):** run `sudo deploy/install-root.sh` after the build.
- **Security:** activates bot protection (Turnstile) and observability.
- **Dependencies:** Phase 0. **Blocks launch:** yes. **Complexity:** Small.

### Phase 2 — Live Stripe & payment qualification
- **Goal:** Real revenue path proven end-to-end in live mode.
- **Why required:** Credential is `sk_test`; no live €99 price; no live webhook.
- **Findings/tasks (BMV-006/007/019):** create live €99 (9900 EUR) price; set
  live secret + webhook secret + price id in the credential; create live webhook
  endpoint (checkout + `charge.refunded`); run controlled live checkout + refund;
  verify identity reveal then revoke; confirm `introduction_fee_cents()=9900`
  matches the live price.
- **Files/components:** credential; Stripe dashboard; `src/lib/stripe-webhook.ts`,
  `src/app/api/stripe/webhook/route.ts`, `src/app/actions/billing.ts` (verify).
- **DB changes:** none (fee already 9900).
- **Deployment/config:** credential swap + re-encrypt + restart.
- **Tests:** SQL webhook idempotency (exists) + live manual checkout/refund.
- **Manual steps (you):** Stripe live setup; one controlled live transaction.
- **Security:** payment integrity; webhook-only truth (already enforced).
- **Dependencies:** Phases 0–1. **Blocks launch:** yes. **Complexity:** Medium.

### Phase 3 — Automated authenticated journey coverage
- **Goal:** A repeatable authenticated E2E test through the real UI.
- **Why required:** BMV-034's authenticated Playwright journey is still missing;
  only DB invariants are covered.
- **Findings/tasks:** add Playwright fixtures that authenticate (magic-link/test
  seam or service-role-seeded session) and drive buyer→vendor→select→(test
  Stripe)→intro→outcome; wire `QUALIFY_DATABASE_URL` staging run into the release
  gate.
- **Files/components:** `tests/` (new spec + fixtures), `playwright.config.ts`,
  `scripts/qualify-sql.sh` (staging in CI), `docs/testing.md`.
- **DB changes:** none (test seeds only). **Backend/Frontend:** possibly a
  test-only auth seam behind an env flag.
- **Tests:** the new journey is the deliverable.
- **Manual steps (you):** provide a disposable/staging DB + Stripe test keys for CI.
- **Security:** ensure any test auth seam is disabled in production builds.
- **Dependencies:** Phases 1–2. **Blocks launch:** yes (at least happy-path).
  **Complexity:** Medium.

### Phase 4 — Production infrastructure & activation qualification
- **Goal:** Prove the live environment behaves per the release gate.
- **Why required:** Manual checks in `production-qualification.md` are unexecuted.
- **Findings/tasks:** Turnstile live check; PostHog consent+capture+region;
  Sentry forced-error + redaction; email inbox + SPF/DKIM/DMARC; CSP browser
  smoke; storage RLS + retention; SEO sitemap/noindex; backup/restore rehearsal;
  `install-root.sh` rollback rehearsal.
- **Files/components:** live environment; `docs/production-qualification.md`
  (record results).
- **DB changes:** none. **Deployment/config:** DNS records for email.
- **Tests:** manual, recorded against the checklist.
- **Manual steps (you):** all of §7.
- **Security:** confirms anonymity, CSP, storage, observability in production.
- **Dependencies:** Phases 1–2. **Blocks launch:** yes (core subset).
  **Complexity:** Medium.

### Phase 5 — French/German localization (spec-required)
- **Goal:** FR/DE across UI + legal copy, EN default.
- **Why required:** stated 1.0 scope in `docs/beatmyvendor.md` (see §9).
- **Findings/tasks (BMV-029):** choose an i18n approach compatible with this
  Next.js build (read `node_modules/next/dist/docs/` first per `AGENTS.md`);
  externalize strings; localized routing + `lang`; FR/DE legal/privacy/imprint
  copy (needs approved translations); localized emails.
- **Files/components:** most `src/app/**` pages, `src/components/**`,
  `src/lib/email-templates.ts`, `src/lib/legal.ts`, `layout.tsx`.
- **DB changes:** possibly localized catalog copy (ties to BMV-036).
- **Backend/Frontend:** large. **Deployment/config:** none new.
- **Tests:** locale routing + `noindex`/hreflang; a11y per locale.
- **Manual steps (you):** approve FR/DE legal + marketing copy.
- **Security:** ensure localized free-text still runs the anonymity detector.
- **Dependencies:** none technical. **Blocks launch:** yes **if not re-scoped**.
  **Complexity:** Large.

### Phase 6 — Catalog consolidation (post-launch)
- **Goal:** Single source of truth for the software catalog.
- **Why required:** BMV-036 duplication risk (static vs DB); not spec-mandated
  for 1.0.
- **Findings/tasks:** migrate public pages to read `software_products`/competitors
  from the DB; retire the static `public-catalog.ts` array.
- **Files/components:** `src/lib/public-catalog.ts`, `/software`, `/compare`,
  `/vendors`, sitemap.
- **DB changes:** none (catalog exists). **Blocks launch:** no. **Complexity:** Medium.

### Phase 7 — Fraud tooling & CSP nonce hardening (post-launch)
- **Goal:** Dedicated fraud-signal queue (BMV-023) + nonce-based CSP.
- **Blocks launch:** no. **Complexity:** Medium.

### Phase 8 — Final launch gate
- **Goal:** Single go/no-go.
- **Tasks:** run `qualify:full` against staging; confirm §11 acceptance criteria;
  submit sitemap; add first vendors; announce 1.0.
- **Blocks launch:** yes (it is the gate). **Complexity:** Small.

## 11. Exact launch acceptance criteria

- [x] Remediation committed; lint, typecheck, 105 unit tests, and the credential-aware
      production build passed on the committed tree (2026-08-31).
- [x] No plaintext secret files on the host; encrypted credential holds the
      current keys; provider credentials rotated where they were exposed.
- [x] Fresh build embeds the Supabase, analytics, and Turnstile public keys;
      service restarted at 12:37 UTC on the fresh artifact.
- [x] `POST /api/stripe/webhook` (unsigned) → 400; maintenance/email endpoints →
      401 unauth; all three timers active.
- [ ] Stripe **live**: €99 (9900 EUR) price = `introduction_fee_cents()`; live
      webhook (checkout + refund); one controlled live checkout **and** refund
      pass; identity reveal then revoke verified.
- [x] Turnstile renders and verifies on login/report; analytics fires only after
      consent to the correct region; Sentry receives a forced error with a
      correlation id and redacted context.
- [x] Email delivered to a real inbox; SPF/DKIM/DMARC valid.
- [x] CSP browser smoke clean (Stripe/Supabase/Turnstile/analytics).
- [x] Storage: verification docs never public; retention deletes on schedule.
- [x] SQL gate passes against staging; at least one authenticated E2E journey
      passes. **(2026-08-31: `npm run qualify:staging` green — SQL suite + auth +
      payment reveal/revoke journey.)**
- [x] Backup/restore and installer rollback rehearsed successfully.
- [x] FR/DE localization re-scoped to a post-launch fast-follow (2026-08-31).

## 12. Recommended execution order

Phase 0 → 1 → 2 → 3 → 4 → (5 if not re-scoped) → 8 launch gate.
Phases 6 and 7 run after launch. Phases 0 and 1 are small and unblock everything;
do them first and together. Phase 5 (localization) is the long pole — decide its
scope **now** so it can run in parallel with 2–4 if it stays in the 1.0 gate. 
