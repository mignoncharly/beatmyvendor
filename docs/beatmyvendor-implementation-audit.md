# BeatMyVendor Implementation Audit

Audit date: 2026-08-30  
Specification: `docs/beatmyvendor.md`   `supabase_keys.md`  
Repository: `/home/mignon/apps/VendorDuel`

This is a read-only implementation audit. No application fixes were made as part of this work.

## Remediation progress — 2026-08-30

P0 containment has started after this audit snapshot was written:

| Finding | Remediation state |
|---|---|
| BMV-001 | PARTIAL — application and worker unit definitions now use an encrypted systemd credential and no longer parse the Markdown inventory. Production activation and rotation/revocation of every exposed provider credential remain required. |
| BMV-002 | APPLIED — direct authenticated user-table mutation is revoked in production; suspension remains available through the audited admin RPC. |
| BMV-003 | APPLIED — direct authenticated buyer-profile mutation is revoked in production; business-email state is written only by the trusted onboarding workflow. |
| BMV-004 | APPLIED — direct offer/feature mutation is revoked in production and the database trigger rejects changes to `locked_at`, `submitted_at`, and all submitted commercial terms. |
| BMV-005 | APPLIED — direct requirement mutation is revoked, the buyer RPC and a database trigger reject contact/company disclosure, the UI explains the rule, and the production scan found no existing vendor-visible requirements to quarantine. |

Migration `20260830025000_phase0_critical_remediation.sql` was rollback-validated, applied to the configured Supabase database, and verified through role-privilege and detector checks. This remediation note does not alter the historical findings below.

### Phase 1 — Restore authoritative data and state machines (2026-08-30)

Phase 1 (`20260830040000_phase1_authoritative_state.sql`) is applied to production and verified:

| Finding | Remediation state |
|---|---|
| BMV-009 | APPLIED — a trigger on `duels` resets a `verified`/`rejected` spend verification to `pending` whenever price, product, plan, billing frequency, currency, seats, fees, or contract length change materially. |
| BMV-011 | APPLIED — direct authenticated `deal_outcomes` writes are revoked; outcomes are written only through `record_deal_outcome`, bound to a completed paid introduction with currency/amount checks and a report-vs-confirm separation, plus a table constraint. |
| BMV-012 | APPLIED — `validate_selection` and `select_buyer_offer` reject offers whose `valid_until` has passed; the comparison UI shows an expired-offer state instead of a select action. |
| BMV-013 | APPLIED — `run_marketplace_expiry()` (service-role only, idempotent, row-locked) expires lapsed offers and advances/closes open duels past their deadline, driven by `/api/maintenance/expiry` and a new `beatmyvendor-maintenance` timer. |
| BMV-016 | APPLIED — the `annual_spend` generated column now folds recurring `current_fees` into the baseline; a shared `annualSpend` utility mirrors it. Existing rows recomputed automatically. |
| BMV-018 | APPLIED — the submission snapshot now includes the full coverage matrix and notes; `selections.selected_offer_version_id` pins the accepted immutable version. |
| BMV-024 | APPLIED — uploads are magic-byte content-sniffed server-side; declared MIME that does not match the bytes is rejected and the verified type is persisted. |
| BMV-025 | APPLIED — the storage delete policy forbids buyer deletion of evidence while a spend verification is `pending`/`verified`; admin retention deletion is unaffected. |
| BMV-031 | APPLIED — server-side ISO-3166 country and marketplace currency allowlists (`is_iso_country`, `is_supported_currency`) enforced in `save_buyer_duel` and mirrored in the form. |

Verification: production `npm run check` (lint, typecheck, 94 unit tests, build) passed; the migration was dry-run (rollback) then committed against the configured Supabase database; eleven role/column/constraint/policy checks confirmed live. The `supabase/tests/marketplace_security.sql` suite gained Phase 1 assertions (privileges, snapshot completeness, fees baseline, verification invalidation, expired-offer rejection). Deployment activation of the new maintenance timer (`sudo deploy/install-root.sh`) remains required.

### Phase 2 — Repair payments and revenue integrity (2026-08-30)

Phase 2 (`20260830050000_phase2_revenue_integrity.sql`) is applied to production and verified (test-mode Stripe):

| Finding | Remediation state |
|---|---|
| BMV-006 | APPLIED — the running production webhook is configured (returns 400 for an unsigned request instead of the previous 503); `install-root.sh` now fails fast if `STRIPE_WEBHOOK_SECRET` is missing. Identity reveal remains gated on `introduction.status in (paid, introduced)`. Full test-card qualification is a manual step. |
| BMV-007 | APPLIED — the fee is centralised in `introduction_fee_cents()` = 9900 and enforced in `prepare_introduction_payment` and the webhook validator; all pricing copy now reads €99. A €99 test Stripe Price (`price_1UA6xvIorccKhqNzqJVBUMxH`, 9900 EUR, tax-inclusive) was created; the deployment credential's `STRIPE_VENDOR_INTRODUCTION_PRICE_ID` must be switched to it. |
| BMV-019 | APPLIED — the admin refund now records intent first (`admin_initiate_refund`), issues the idempotent Stripe refund, then reconciles (`admin_record_refund`, made idempotent). `charge.refunded` is reconciled authoritatively by `process_stripe_refund_event` (service-role only), which cascades to `introduction=refunded` and revokes vendor identity access. `payments` gained `provider_refund_id` and `refund_initiated_at`. |

Verification: `npm run check` (lint, typecheck, 98 unit tests, build) passed; migration dry-run then committed; seven function/column/grant checks confirmed live. `marketplace_security.sql` gained a refund end-to-end assertion (payment→refunded, introduction→refunded, identity access revoked, idempotent replay) and the fee constants were updated to 9900. Live-key cutover and the €99 Price ID swap in the credential remain a deferred launch step, alongside BMV-001 rotation.

### Phase 3 — Marketplace integrity, verification, matching, and administration (2026-08-30)

Phase 3 (`20260830060000_phase3_marketplace_integrity.sql`) is applied to production and verified:

| Finding | Remediation state |
|---|---|
| BMV-008 | APPLIED — `admin_verification_documents` (admin-only) lists a verification''s evidence; `/admin/verifications` renders each document with a `signVerificationDocument` action that mints a 300s signed URL via the service role. Reviewers now see proof before deciding. |
| BMV-014 | APPLIED — Postgres fixed-window limiter (`check_rate_limit`, service-role only) applied server-side to magic-link login, report, duel save, offer save, and checkout. Cloudflare Turnstile is fully wired but dormant (no-op) until `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are configured; widgets are on the login and report forms. |
| BMV-017 | APPLIED — `match_vendor_opportunities` applies approved-vendor state, replacement capability, and the vendor''s declared countries/currencies/customer-size envelope, returning the matched product as the reason. `notify_matching_vendors` idempotently enqueues `new_opportunity` notifications when a duel opens. |
| BMV-022 | APPLIED — the opportunities page now runs an indexed, keyset-paginated server-side query (24/page, Next/First navigation) instead of fetching everything and filtering in memory. |
| BMV-023 | PARTIAL — admins can now review spend evidence (BMV-008) and see refund reconciliation state (`provider_refund_id`, `refund_initiated_at`, refunded/refund-pending) on `/admin/payments`, all through audited server actions rather than direct DB edits. A dedicated fraud-signal queue remains future work. |

Verification: `npm run check` (lint, typecheck, 98 unit tests, build) passed; migration dry-run then committed; six function/table/grant/trigger checks confirmed live (including a live limiter call). `marketplace_security.sql` gained Phase 3 privilege assertions (limiter not client-executable, matching/evidence executable, first-request-in-window allowed). Turnstile activation (provisioning Cloudflare keys and setting `NEXT_PUBLIC_TURNSTILE_SITE_KEY` at build time) remains a deferred step.

### Phase 4A — Journeys (redirect, dashboard, email, vendor profile) (2026-08-30)

Phase 4 was split; Batch A (`20260830070000_phase4a_journeys.sql`) is applied to production and verified. The outcome/public-win workflow (BMV-010, BMV-038) is Batch B, still pending.

| Finding | Remediation state |
|---|---|
| BMV-032 | APPLIED — a validated same-origin `next` path now survives `/start` → login → magic-link callback → onboarding, so "Start a Duel" returns the visitor to duel creation. The callback routes new accounts to onboarding (preserving intent) and existing members to their destination or dashboard. No open redirects (`safeRelativePath`). |
| BMV-020 | APPLIED — the buyer dashboard shows per-duel offer count, status, best offered saving, and an explicit next-action CTA per state. |
| BMV-037 | APPLIED — aggregate savings are split into labelled Offered / Selected / Confirmed stages, computed distinctly (best current offer vs. chosen offer vs. verified outcome). |
| BMV-015 | APPLIED — the introduction email payload carries the recipient role so vendors are linked to `/vendor/introductions` (was a broken buyer link), and a `payment_receipt` email is enqueued to the vendor on confirmed payment. |
| BMV-021 | APPLIED — vendors can upload a company logo (public `vendor-logos` bucket, member-only writes, `set_vendor_logo`), set an operational contact email (`configure_vendor_marketplace` gained the argument), and see their product inventory. |
| BMV-010, BMV-038 | See Phase 4B below. |

Verification: `npm run check` (lint, typecheck, 98 unit tests, build) passed; migration dry-run then committed; seven function/bucket/policy/grant/signature checks confirmed live. App redeploy (rebuild + restart) is required to serve the Phase 4A code.

### Phase 4B — Outcome and public-win workflow (2026-08-30)

Phase 4B (`20260830080000_phase4b_outcomes.sql`) is applied to production and verified. Phase 4 is now complete.

| Finding | Remediation state |
|---|---|
| BMV-010 | APPLIED — an introduction-bound outcome state machine: the buyer reports (`record_deal_outcome`), the vendor confirms/disputes (`respond_to_deal_outcome`), and an admin verifies (`admin_verify_deal_outcome`, which requires vendor confirmation and stamps `confirmed_at`). `deal_outcomes` gained `reported_by`, `vendor_response`, `vendor_responded_at`, `verified_at`, `verified_by`. Buyer, vendor, and admin UIs drive each transition; all writes remain server-side security-definer RPCs. |
| BMV-038 | APPLIED — publication requires a verified saving; each party consents separately with its own display name (`consent_public_win`), and only an admin publishes/unpublishes (`admin_publish_win`). `public_wins` gained `revoked_at`; `wins_public_read` now requires `published_at is not null AND revoked_at is null`; a `wins_party_read` policy lets introduced parties manage their own draft consent. No win is public without admin-verified data and current buyer consent. |

Verification: `npm run check` (lint, typecheck, 98 unit tests, build) passed; the migration was dry-run — which caught and fixed a record/scalar `SELECT INTO` bug — then committed; seven column/function/grant/policy checks confirmed live. App redeploy (rebuild + restart) is required to serve the Phase 4B code.

### Phase 5 — Production observability and privacy-aware analytics (2026-08-30)

Phase 5 is code-only (no schema change). Applied to the repository and verified; redeploy activates it.

| Finding | Remediation state |
|---|---|
| BMV-027 | APPLIED — `src/lib/observability.ts` provides `reportError` with correlation IDs, key- and email-level redaction, and an env-gated Sentry envelope sender (dormant until `SENTRY_DSN` is set; always emits a structured JSON log line). Wired into the Stripe webhook (checkout + refund RPC failures), the email-delivery/expiry/retention jobs, and the spend-document upload path; failures now return a user-facing `reference`. A `/api/observability/client-error` beacon reports render/runtime failures from both error boundaries. |
| BMV-026 | APPLIED — `src/lib/analytics.ts` + `AnalyticsProvider` provide consent-gated, privacy-minimised analytics: a strict event taxonomy, a property allowlist (no email/company/contact/free-text/document/duel content), a lazily-minted anonymous id, and page-view capture. It initialises only after Analytics consent and makes no network request before consent or without a configured key (dormant until `NEXT_PUBLIC_ANALYTICS_KEY`/`NEXT_PUBLIC_ANALYTICS_HOST` are set at build time). |

Verification: `npm run check` (lint, typecheck, 105 unit tests — +7 for redaction and analytics no-op-without-consent, build) passed. Activation is deferred: add `SENTRY_DSN` to the deployment credential to enable error tracking (a DSN is already available), and set the analytics public key at build time to enable analytics. App redeploy (rebuild + restart) is required to serve the Phase 5 code.

### Phase 6 — SEO, deployment hardening, scalability, and cleanup (2026-08-30)

Phase 6 is code-only (no schema change). Localization (BMV-029) and catalog consolidation (BMV-036) were deferred to a dedicated phase — the former needs approved FR/DE legal/marketing copy, the latter a public-page migration onto the database catalog.

| Finding | Remediation state |
|---|---|
| BMV-028 | APPLIED — the two remaining raw-`JSON.stringify` JSON-LD blocks (`/software/[slug]`, `/wins/[slug]`) now use the safe `JsonLd` component (escapes `<`); private sections (`/buyer`, `/vendor`, `/admin`, `/account`, `/onboarding`) emit explicit `noindex` via passthrough section layouts. |
| BMV-030 | APPLIED (with Phase 5) — analytics initialises only after Analytics consent, consumes the single `beatmyvendor:consent-changed` event, and makes no network request before consent or without a key. A unit test asserts the no-network-when-dormant behaviour. |
| BMV-033 | APPLIED — admin users, payments, and audit-log lists use bounded `range()` pagination (Prev/Next) instead of implicit row caps, via a shared `AdminPager`/`pageRange` helper. |
| BMV-035 | APPLIED — a Content-Security-Policy header (env-derived) is served on every response: strict `default-src`/`object-src 'none'`/`frame-ancestors 'none'`/`base-uri`/`form-action`, allowlisted `connect-src`/`img-src` for Supabase, `frame-src`/`script-src` for Stripe and Turnstile, and the optional analytics host. `script-src` retains `'unsafe-inline'` because inline JSON-LD must survive static rendering; nonce-based hardening is noted as future work. Browser smoke-testing of Stripe checkout + Supabase after redeploy is recommended. |
| BMV-039 | APPLIED — report submission is idempotent (an identical open report from the same user for the same target within an hour is treated as received) and lands on a durable post/redirect/get success state. |
| BMV-040 | APPLIED — the dead, duplicate `src/app/actions/admin.ts` (`approveVendor`/`rejectVendor`, which bypassed the audited `admin_review_vendor` RPC and its logging) was removed; vendor approval flows solely through `reviewVendor` → `admin_review_vendor`. |
| BMV-029, BMV-036 | DEFERRED — dedicated localization phase and catalog-source consolidation, respectively. |

Verification: `npm run check` (lint, typecheck, 105 unit tests, build) passed; the generated CSP string was validated as well-formed. App redeploy (rebuild + restart) is required to serve the Phase 6 code.

### Phase 7 — Critical test coverage and final production qualification (2026-08-30)

| Finding | Remediation state |
|---|---|
| BMV-034 | APPLIED (automated gate) — the accumulated `supabase/tests/marketplace_security.sql` suite (Phases 0–6 invariants) was **run against a real database for the first time** and now passes end-to-end (transactional, rolls back). A reusable release gate wraps it: `scripts/qualify-sql.sh` + `npm run test:sql` / `qualify` / `qualify:full`, keyed on `QUALIFY_DATABASE_URL` (skips cleanly without one). Added a matching-authorization assertion (non-approved caller refused). `docs/production-qualification.md` documents the gate and the manual production-configuration checklist; `docs/testing.md` updated. |

Running the gate immediately surfaced and fixed a latent launch-breaking bug: the Phase 3 `notify_matching_vendors` trigger used a bare `'in_app'` text literal in an `INSERT … SELECT`, which is not implicitly coerced to `notification_channel`, so opening a duel with a matching approved vendor raised a type error. Fixed with an explicit cast in migration `20260830090000_phase7_qualification_fixes.sql` (dry-run then committed to production); the suite then passed.

Verification: the security suite passes against the production database (rolled back); `npm run check` remains green. Remaining, explicitly noted as not-yet-covered: authenticated Playwright journey fixtures (need a staging env with a magic-link bypass), full storage-policy exercise beyond policy/privilege assertions, and the manual production-configuration qualification in `docs/production-qualification.md` (live Stripe cutover, backup/restore rehearsal, DNS/email, CSP browser smoke).

## 1. Executive Summary

The repository contains a substantial BeatMyVendor implementation: public acquisition and SEO pages, buyer and vendor onboarding, Duel creation, offer submission and comparison, vendor selection, Stripe Checkout and webhook processing, introductions, administration pages, private verification-document storage, email-delivery infrastructure, PWA support, and cookie preferences all exist.

The product specification is nevertheless only partially respected. Several controls that appear complete in the UI are not authoritative at the database boundary. The most serious issues are production-secret handling, self-service bypasses of suspension and business-email verification, an offer-lock immutability bypass, and the ability to disclose buyer contact information in vendor-visible free text before a paid introduction. The production payment flow is also currently unavailable because the running deployment does not have a configured Stripe webhook secret, and the implemented fee is €99.99 rather than the specified €99.

The application is not production-ready for a marketplace launch until the P0 issues are contained and the P1 core-flow and payment defects are resolved. The build and existing automated suite pass, but those tests do not exercise the authenticated marketplace, RLS, payment, anonymity, or lifecycle paths that carry the greatest risk.

Security assessment: high risk. Positive controls exist—signed Stripe webhooks, webhook-event idempotency, private document storage, paid-introduction identity policies, and separation of competing vendor offers—but multiple database policies permit users to alter authoritative verification or account state, and unredacted free text defeats the core anonymity promise.

Finding count:

- P0 — Critical: 5
- P1 — High: 14
- P2 — Medium: 18
- P3 — Low: 2
- Total: 39

Critical blockers:

1. Plaintext production credentials are stored in a local repository-adjacent secret file and consumed by the deployment launcher.
2. A suspended user can clear their own suspension timestamp through RLS.
3. A buyer can self-assign verified business-email status through RLS.
4. A vendor can clear an offer's lock and then change the submitted offer.
5. Buyer contact and company identity can be placed in vendor-visible free-text requirement fields before payment.

## 2. Specification Compliance

| Requirement | Status | Evidence | Problem |
|---|---|---|---|
| Buyer can start a Duel | COMPLETE | `/start`, `/buyer/duels/new`, `save_buyer_duel` | Core creation path exists. |
| Current software/vendor | COMPLETE | Duel form and `duels.current_software_product_id` | Persisted as structured data. |
| Current price, billing frequency, currency | PARTIAL | Duel form and pricing columns | Currency validation is loose; annual spend omits extra fees. |
| Seats/agents and plan | COMPLETE | Duel form and `duels` fields | Editable after spend review without invalidating verification. |
| Ticket volume | COMPLETE | Requirement/form fields | Available where relevant. |
| Must-have features and integrations | COMPLETE | `duel_requirements` | Free text is not contact-redacted. |
| Extra fees | PARTIAL | Captured in requirements/data model | Excluded from headline annual-spend calculation. |
| Renewal date and contract duration | COMPLETE | Duel form/schema | Timezone semantics are not explicitly normalized in the UX. |
| Location and company size | COMPLETE | Duel form/schema | Matching engine does not use them. |
| Switching timeline, comment, seriousness | COMPLETE | Duel form/schema | Free-text anonymity controls are missing. |
| Work-email verification | BROKEN | Buyer profile and Duel verification code | Buyer can set their own verified status via RLS. |
| Business verification | BROKEN | Admin verification and buyer profile fields | Self-assigned email verification can satisfy the business-email verification path. |
| Optional spend verification | PARTIAL | Private upload and admin review exist | Evidence is not visible in the admin review UI; material edits do not invalidate approval. |
| Buyer dashboard | PARTIAL | `/buyer` | Missing offer counts, best saving, next action, Savings/Account navigation. |
| Duel lifecycle | PARTIAL | Database enums and RPCs | No automated expiry/ending lifecycle; some transitions lack required invariants. |
| Offer comparison | COMPLETE | `/buyer/duels/[id]/compare` | Core comparison exists; offered/selected/confirmed savings are not separated throughout the UX. |
| Vendor selection | PARTIAL | Selection action/RPC | Ownership is checked, but expired offers can still be selected and no version is pinned. |
| Introduction flow | PARTIAL | Billing, Stripe webhook, introductions pages | Production configuration is broken; contact payload and notification behavior are incomplete. |
| Post-introduction outcome | MISSING | Outcome/admin read model only | No buyer/vendor outcome submission workflow. |
| Confirmed savings | MISSING | Outcome/public-win tables exist | No verified end-to-end confirmation workflow. |
| Vendor signup | COMPLETE | Auth and onboarding | Core flow exists. |
| Vendor business verification | PARTIAL | Vendor profile/admin approval | Evidence and fraud tooling are incomplete. |
| Admin vendor approval | COMPLETE | Admin action/UI | Approval path exists. |
| Vendor company profile | PARTIAL | `/vendor/profile` | Missing logo and richer contacts/product management. |
| Vendor products/replacement mappings | PARTIAL | Vendor profile and replacement relations | Editing can replace mappings; no complete inventory workflow. |
| Opportunity discovery | PARTIAL | `/vendor/opportunities` | Matching and filters are incomplete; no server pagination. |
| Anonymized buyer data | BROKEN | RLS hides identity tables | Free text can expose email, phone, URL, domain, social handle, person, or company. |
| Matching | PARTIAL | Competitor/replacement mapping | Ignores geography, company size, spend, seats, and some approval/relevance criteria in notification workflows. |
| Structured offer submission | COMPLETE | Offer form/action/schema | Core terms are structured. |
| Offer versioning | PARTIAL | `offer_versions` | Snapshot omits feature rows/notes and selected version is not pinned. |
| Offer locking | BROKEN | Offer validation trigger and vendor update policy | Vendor can clear `locked_at`, then mutate the offer. |
| Offer statuses | PARTIAL | Offer enum and actions | Lifecycle exists but not all time/immutability rules are authoritative. |
| Selection notification | PARTIAL | Template exists | Lifecycle event is not consistently enqueued. |
| €99 introduction payment | BROKEN | Billing action/pages and Stripe flow | Hardcoded as 9,999 cents (€99.99), and production webhook is unconfigured. |
| Identity reveal only after payment | PARTIAL | Paid-introduction RLS is present | Structured identity is protected, but free text bypasses anonymity. |
| Vendor billing history | COMPLETE | `/vendor/billing` | Core payment list exists. |
| Buyer/vendor verification administration | PARTIAL | `/admin/verifications` | Admin cannot inspect uploaded evidence in that screen. |
| Duel moderation | PARTIAL | Admin Duel pages/actions | Fraud and evidence context are incomplete. |
| Reports | PARTIAL | Report page/admin reports | Submission UX lacks success state and abuse controls. |
| Payment visibility | COMPLETE | `/admin/payments` | Visibility exists. |
| Refund handling | PARTIAL | Admin refund action | External-first operation can diverge; no refund webhook/reconciliation. |
| Deal outcomes | MISSING | Admin read-only page | No operational outcome workflow. |
| Audit logs | PARTIAL | Table/admin page | Coverage is not comprehensive for all material changes. |
| Fraud review | MISSING | No complete fraud queue/rules | Admin lacks necessary abuse controls. |
| Public win moderation | MISSING | Public-win data model/pages | Consent and verified-publication workflow are absent. |
| Account/user management | PARTIAL | `/admin/users` | Suspension can be self-reversed at the database layer. |
| Homepage and public acquisition pages | COMPLETE | `/`, `/how-it-works`, `/vendors`, `/pricing` | Core pages exist. |
| Software, alternatives, comparison pages | COMPLETE | Dynamic public routes/catalog | Static catalog duplicates database catalog. |
| Public Duels | COMPLETE | `/duels`, `/duels/[slug]` | Publication controls exist; review content anonymity carefully. |
| Public Wins | PARTIAL | `/wins`, `/wins/[slug]` | End-to-end verified consent/publication is missing. |
| Legal pages | COMPLETE | Terms, privacy, cookies, imprint | Factual/legal provider details still require owner verification. |
| Cookie consent | COMPLETE | Consent manager and cookie page | Current app loads no optional analytics/marketing provider before consent. |
| SEO | PARTIAL | Metadata, sitemap, robots, JSON-LD | Metadata/schema are inconsistent; private pages rely on robots rather than explicit noindex. |
| PWA | COMPLETE | Manifest, icons, registration, offline page | Authenticated navigations are not cached; static/offline caching is conservative. |
| Buyers are free | COMPLETE | No buyer payment path found | Rule is respected. |
| Vendors browse and offer for free | COMPLETE | No charge before selection | Rule is respected. |
| Vendor pays only when selected | COMPLETE | Billing requires selected offer | Amount/configuration defects remain. |
| No automatic lowest-price winner | COMPLETE | Buyer explicitly selects | No automatic winner found. |
| Competing offers hidden during offer period | COMPLETE | Offer RLS scopes vendor reads | Vendor cannot read competitors' offers. |
| Buyer private contact details not leaked | BROKEN | Identity-table RLS is restrictive | Requirement free text is unredacted. |
| Offered/selected/confirmed savings distinguished | MISSING | No complete three-stage presentation/workflow | Metrics can be conflated or absent. |
| Public wins require consent and verified data | MISSING | Tables/pages exist | Operational consent/verification workflow is absent. |
| No fabricated benchmark/review/activity data | COMPLETE | Production pages use catalog/database; no fake marketplace records found | Seed data is software catalog data, not fake transactions. |
| Email lifecycle notifications | PARTIAL | Resend worker/templates exist | Most lifecycle events are not enqueued and some links/audiences are wrong. |
| Turnstile/rate limiting | MISSING | No implementation found | Write endpoints and auth-facing flows lack abuse controls. |
| Production observability | MISSING | No active Sentry/structured pipeline found | Errors are often console-only or swallowed. |
| Production deployment architecture | PARTIAL | systemd/Nginx deployment exists | Differs from the specified Vercel architecture and misses CSP. |
| Localization | MISSING | English-only routes/content | French and German variants are absent. |

## 3. Findings

### BMV-001 Plaintext production secrets are stored and loaded from disk

Severity: P0 — Critical  
Category: Security  
Status: Confirmed  
Affected files: `supabase_keys.md`, `deploy/run-with-production-env.sh`, environment/deployment configuration  
Affected routes: All privileged Supabase, Stripe, Resend, cron, and monitoring operations  
Affected tables: All tables reachable with the service-role/database credentials  
Evidence: An ignored, mode-600 file named `supabase_keys.md` contains live and test credentials, including a database password/connection data, Supabase service-role/secret/JWT material, Stripe secret keys, a Resend key, a cron secret, and a Sentry token. The production launcher parses this file directly. The file is not tracked by Git, but it is plaintext on the host.

Description: The deployment depends on a plaintext multi-provider secret inventory inside the application directory. File permissions reduce casual access but do not provide secret isolation, rotation, access auditing, or blast-radius separation.

Impact: Any host, backup, support, process, or accidental disclosure compromise can expose database administration, payment, email, job, and monitoring credentials at once. Stripe and Supabase credentials can directly affect money and private marketplace data.

Expected behavior: Production secrets should be held in an access-controlled secret store or service environment, separated by provider and least privilege, never documented in a repository-side Markdown file.

Current behavior: The app launcher reads a plaintext credential document from disk and exports its values.

Recommended fix: Revoke and rotate every credential in the file immediately; move values into an OS/service secret mechanism or managed vault; separate live and test credentials; restrict deployment identities; add secret-scanning and incident documentation.

Dependencies: Blocks all other production remediation because exposed credentials may invalidate confidence in subsequent controls.

### BMV-002 Suspended users can clear their own suspension

Severity: P0 — Critical  
Category: Authorization  
Status: Confirmed  
Affected files: `supabase/migrations/20260829170200_phase1_security.sql` (`users_self_update` policy), grants on `public.users`  
Affected routes: Authenticated buyer/vendor routes and actions  
Affected tables: `users`  
Evidence: The self-update policy permits a user to update their own `users` row. Broad column/table UPDATE grants do not prevent that user from setting `suspended_at` to `NULL`; there is no trigger or column-level restriction preserving admin-controlled fields.

Description: Suspension is modeled as mutable data on a row the suspended principal can update.

Impact: Marketplace moderation and fraud containment can be bypassed. A suspended buyer or vendor can restore access without admin approval.

Expected behavior: Only a trusted admin/service operation may set or clear suspension state.

Current behavior: Row ownership is enforced, but protected-column ownership is not.

Recommended fix: Revoke direct updates to protected columns, expose a narrowly scoped profile-update RPC or column grant, add a trigger that rejects non-admin changes to administrative fields, and test with real JWT roles.

Dependencies: BMV-023, BMV-034.

### BMV-003 Buyers can self-verify their business email

Severity: P0 — Critical  
Category: Auth  
Status: Confirmed  
Affected files: `supabase/migrations/20260829170200_phase1_security.sql`, buyer onboarding/Duel actions including `save_buyer_duel`  
Affected routes: `/onboarding`, `/buyer/duels/new`, `/buyer/duels/[id]/edit`  
Affected tables: `buyer_profiles`, `duel_verifications`  
Evidence: `buyer_profiles_owner_write` is a broad owner `FOR ALL` policy. The owner can assign `business_email_status = 'verified'`. `save_buyer_duel` trusts that status when deriving the Duel's business-email verification.

Description: A client-controlled profile column is used as authoritative evidence that an independent verification happened.

Impact: Fake buyers can bypass a core trust gate, submit apparently verified Duels, increase spam, and undermine vendor confidence.

Expected behavior: Verification status must only be set by a trusted callback, admin workflow, or server-side verification process after proof.

Current behavior: The profile owner can directly write the authoritative status through Supabase.

Recommended fix: Remove client UPDATE rights for verification fields; separate user-editable contact data from authoritative verification records; require a one-time-token or admin verification workflow; recalculate Duel verification only from protected evidence.

Dependencies: BMV-011, BMV-023, BMV-034.

### BMV-004 Submitted offer locking can be bypassed

Severity: P0 — Critical  
Category: Database  
Status: Confirmed  
Affected files: offer RLS/grants and `validate_offer` trigger in Supabase migrations; `src/app/actions/vendor-marketplace.ts`  
Affected routes: Vendor offer/challenge routes  
Affected tables: `offers`, `offer_versions`, `selections`, `payments`  
Evidence: The validation trigger protects offer terms only when `OLD.locked_at` is non-null, but does not prohibit changing `locked_at` itself. Vendor UPDATE access permits clearing `locked_at`; a subsequent update can then change submitted terms.

Description: The lock is both the protection condition and a vendor-writable field. Clearing it turns off the immutability check.

Impact: A selected or submitted price can silently change, compromising buyer decisions, payment references, disputes, auditability, and marketplace trust.

Expected behavior: Submitted and selected versions must be immutable except through an explicit versioned transition; selected terms must be permanently pinned.

Current behavior: A vendor can unlock and mutate an offer in multiple direct requests.

Recommended fix: Make lock/status administrative, reject vendor changes to lock fields, enforce legal transitions in a security-definer RPC/trigger, snapshot complete terms, and pin the selected offer version.

Dependencies: BMV-018, BMV-034.

### BMV-005 Buyer identity can leak through vendor-visible free text

Severity: P0 — Critical  
Category: Privacy  
Status: Confirmed  
Affected files: `src/components/duel-form.tsx`, Duel server actions/validation, public/vendor Duel queries, requirement schema/RLS  
Affected routes: `/buyer/duels/new`, `/buyer/duels/[id]/edit`, `/vendor/opportunities/[id]`, public Duel routes where applicable  
Affected tables: `duel_requirements`, `duels`  
Evidence: Must-have features, integrations, comments, and related text are accepted with length validation but no detector/redaction for email, phone, URL, domain, LinkedIn/social handle, contact name, or company name. Vendors can read these requirements before a paid introduction.

Description: Structured identity columns are protected by RLS, but the same data can be embedded in an unrestricted content channel intentionally exposed to vendors.

Impact: Buyers and vendors can bypass the €99 introduction, expose personal data, evade consent expectations, and defeat BeatMyVendor's central anonymity and monetization model.

Expected behavior: Pre-introduction content must reject, redact, or moderate contact and company-identifying details across every vendor-visible field and document-derived value.

Current behavior: Free text passes through unchanged.

Recommended fix: Add shared server-side detection and normalization, a clear inline validation UX, moderation flags for ambiguous cases, retroactive scanning of existing content, safe public/vendor projections, and adversarial tests.

Dependencies: BMV-017, BMV-022, BMV-034.

### BMV-006 Production Stripe webhook and checkout configuration is incomplete

Severity: P1 — High  
Category: Stripe  
Status: Confirmed  
Affected files: `deploy/run-with-production-env.sh`, service environment, `src/app/actions/billing.ts`, `src/app/api/stripe/webhook/route.ts`  
Affected routes: `/vendor/billing`, `/api/stripe/webhook`  
Affected tables: `payments`, `introductions`, `stripe_webhook_events`  
Evidence: The running production service is active, but a local request to the production webhook returned HTTP 503 with `Webhook is not configured.` No production local environment file was present; the fallback launcher reads Stripe sandbox keys and does not provide `STRIPE_WEBHOOK_SECRET`. Billing disables checkout when required Stripe variables are absent.

Description: The authoritative payment-completion path cannot validate Stripe events in the deployed environment.

Impact: Selected vendors cannot complete the paid introduction flow reliably, and no buyer identity can safely be revealed. Revenue and the core marketplace conversion path are blocked.

Expected behavior: Live Checkout and a verified live webhook must be configured, monitored, and exercised before launch.

Current behavior: Code support exists, but the active production configuration returns an unavailable response.

Recommended fix: Configure distinct live Stripe secrets and webhook endpoint secret via the production secret store, create/verify the intended product/price, add deployment preflight checks, and run a live-mode or controlled test-mode end-to-end qualification.

Dependencies: BMV-001, BMV-007, BMV-019.

### BMV-007 Introduction fee is €99.99 instead of €99

Severity: P1 — High  
Category: Concept  
Status: Confirmed  
Affected files: revenue migration(s), Stripe billing action, pricing/billing/public copy  
Affected routes: `/pricing`, `/vendor/billing`, Checkout creation  
Affected tables: `payments`  
Evidence: The amount is hardcoded as `9999` cents and presented as €99.99 in SQL/application UI, while the specification and audit request require an introduction fee of €99.

Description: The implemented commercial rule differs from the product contract.

Impact: Customers are overcharged by €0.99 relative to the stated product, public copy can conflict with checkout, and refunds/accounting become harder.

Expected behavior: The single selection fee is exactly €99, preferably sourced from authoritative Stripe Price configuration and verified server-side.

Current behavior: Multiple code/database locations encode €99.99.

Recommended fix: Decide the canonical tax-inclusive/exclusive commercial amount, create the correct Stripe Price, use its ID server-side, validate amount/currency in webhook processing, and update all copy/data defaults atomically.

Dependencies: BMV-006.

### BMV-008 Admin cannot inspect spend-verification evidence

Severity: P1 — High  
Category: Frontend  
Status: Confirmed  
Affected files: `src/app/admin/verifications/page.tsx`, admin verification actions, verification-document utilities  
Affected routes: `/admin/verifications`  
Affected tables: `duel_documents`, `duel_verifications`  
Evidence: The page exposes a Verify action but does not query/render verification documents or issue an admin-authorized signed URL for evidence review.

Description: The moderation decision UI is disconnected from the evidence it is supposed to evaluate.

Impact: Admins can only approve blindly or use out-of-band database/storage access, making fake spend and mistakes likely.

Expected behavior: Authorized reviewers should see document metadata and short-lived evidence access before approving/rejecting, with an audit reason.

Current behavior: The action exists without the evidentiary review surface.

Recommended fix: Add a protected evidence query and short-lived signed-view/download action, decision reason, clear status history, access logging, and retention controls.

Dependencies: BMV-017, BMV-023.

### BMV-009 Material Duel edits do not invalidate spend verification

Severity: P1 — High  
Category: Marketplace/Fraud  
Status: Confirmed  
Affected files: Duel save/update actions and verification SQL  
Affected routes: `/buyer/duels/[id]/edit`  
Affected tables: `duels`, `duel_verifications`, `duel_documents`  
Evidence: A pending/verified Duel can change price, software, plan, or seats after verification without clearing or superseding the spend-verification record.

Description: Evidence attests to one set of spend facts, while the buyer can later present different facts under the same verified badge.

Impact: Vendors can be shown misleading verified spend and public savings can be calculated from unverified edited values.

Expected behavior: Material changes after review must invalidate verification or create a new revision requiring re-review.

Current behavior: Verification and mutable Duel facts are not version-bound.

Recommended fix: Fingerprint or snapshot verified facts, invalidate verification on material updates, preserve history, and require re-review before restoring the badge.

Dependencies: BMV-011, BMV-018.

### BMV-010 Post-introduction outcome and public-win workflow is absent

Severity: P1 — High  
Category: Concept  
Status: Confirmed  
Affected files: Admin outcomes/public wins pages, public win utilities and migrations  
Affected routes: `/admin/outcomes`, `/wins`, `/wins/[slug]`, missing buyer/vendor outcome routes  
Affected tables: `deal_outcomes`, `public_wins`, `introductions`, `selections`  
Evidence: Schemas and read-only/public presentation exist, but no buyer/vendor outcome form, confirmation exchange, consent capture, evidence review, or moderated publication action was found.

Description: The application stops operationally after introduction and cannot produce trustworthy confirmed-savings outcomes.

Impact: BeatMyVendor cannot prove realized value, collect verified Wins, resolve conflicting outcome reports, or meet the specified savings semantics.

Expected behavior: Introduced parties should receive follow-up, submit outcome data, confirm or dispute it, consent separately to publication, and require admin verification before a Win is public.

Current behavior: Outcome/public tables are effectively disconnected from the user journey.

Recommended fix: Implement an introduction-bound outcome state machine, party submissions/confirmation, evidence and moderation, consent version/timestamp, publication workflow, revocation, and follow-up notifications.

Dependencies: BMV-012, BMV-018, BMV-020.

### BMV-011 Buyers can directly write untrusted deal outcomes

Severity: P1 — High  
Category: Database  
Status: Confirmed  
Affected files: outcome RLS policies in Supabase migrations  
Affected routes: Any direct Supabase client request; future outcome UI  
Affected tables: `deal_outcomes`  
Evidence: Buyer RLS permits direct INSERT/UPDATE without sufficient checks that the referenced introduction is completed/valid or that currencies, claimed amounts, and confirmation semantics match the selected offer.

Description: A derived, potentially public business metric is directly writable without an authoritative workflow.

Impact: A buyer can fabricate confirmed savings or create inconsistent outcome records, damaging analytics and public claims.

Expected behavior: Outcome writes should pass through a validated transition bound to a paid introduction and immutable selected offer; confirmation/publication should require separate trusted actions.

Current behavior: Row access exists, but semantic integrity is not enforced.

Recommended fix: Revoke direct writes, create role-aware RPCs, enforce one outcome per valid introduction, constrain currency/amounts, separate reported/confirmed/published states, and log every transition.

Dependencies: BMV-010, BMV-018, BMV-023.

### BMV-012 Expired offers can be selected

Severity: P1 — High  
Category: Backend  
Status: Confirmed  
Affected files: `src/app/actions/comparison.ts`, selection RPC/migration  
Affected routes: `/buyer/duels/[id]/compare`  
Affected tables: `offers`, `selections`, `duels`  
Evidence: Selection checks buyer ownership and Duel association but does not authoritatively reject an offer whose `valid_until` has passed.

Description: The selection invariant omits commercial validity time.

Impact: A vendor can be selected and charged for terms that are no longer valid, causing disputes and failed introductions.

Expected behavior: Only submitted, non-withdrawn, non-expired offers for an eligible open/reviewing Duel may be selected.

Current behavior: An otherwise selectable offer remains selectable after its validity date.

Recommended fix: Enforce time and state predicates transactionally in the selection RPC and surface a clear stale-offer UI requiring a refreshed offer.

Dependencies: BMV-013, BMV-018.

### BMV-013 Duel and offer-period expiry is not automated

Severity: P1 — High  
Category: Backend  
Status: Confirmed  
Affected files: Duel lifecycle actions, maintenance routes/services  
Affected routes: Opportunity, comparison, Duel detail routes  
Affected tables: `duels`, `offers`, `notifications`  
Evidence: No scheduler/job was found that advances open Duels when their offer deadline passes, expires stale offers, or sends deadline lifecycle notifications. Buyers can manually close the offer window.

Description: Time-based state is represented but not maintained.

Impact: Stale opportunities remain actionable, notifications do not fire, vendor lists become misleading, and selection rules depend on UI assumptions.

Expected behavior: A recurring authoritative job should perform idempotent deadline transitions and notification enqueueing.

Current behavior: Time passing alone does not consistently change state.

Recommended fix: Add an authenticated scheduled job/RPC with row locking and idempotency; expire/advance eligible records; enqueue one-time ending/closed notifications; cover clock boundaries.

Dependencies: BMV-012, BMV-016, BMV-034.

### BMV-014 Marketplace write paths lack rate limits and bot protection

Severity: P1 — High  
Category: Security  
Status: Confirmed  
Affected files: Auth UI/actions, Duel/offer/report/billing actions and API routes  
Affected routes: Login/magic link, Duel creation, offer submission, report, payment initiation, public write endpoints  
Affected tables: Auth provider, `duels`, `offers`, `reports`, `payments`, `notifications`  
Evidence: No Turnstile/CAPTCHA integration or application-level rate limiter was found for the specified abuse-sensitive paths.

Description: Authentication alone does not limit automated account creation, submission volume, repeated Checkout creation, or report spam.

Impact: Fake buyers/vendors, repeated Duels, spam offers, email abuse, cost amplification, and enumeration are practical.

Expected behavior: Risk-based rate limits and bot checks should protect expensive or trust-sensitive writes, with server-side enforcement.

Current behavior: Validly shaped requests can be repeated without application-level throttling.

Recommended fix: Add IP/account/device-aware limits, Turnstile on anonymous/high-risk forms, idempotency keys, duplicate detection, useful 429 responses, and admin visibility.

Dependencies: BMV-017, BMV-022, BMV-023.

### BMV-015 Lifecycle email events are incomplete and some templates target the wrong journey

Severity: P1 — High  
Category: Email  
Status: Confirmed  
Affected files: `src/lib/email-templates.ts`, `src/lib/email-delivery.ts`, lifecycle actions/webhook, notification worker  
Affected routes: Email links into buyer/vendor dashboards  
Affected tables: `notifications`, email delivery status fields  
Evidence: Templates exist for several events, but the corresponding business actions do not consistently enqueue them. The vendor `introduction_completed` template links to `/buyer/introductions`; a payment receipt is not enqueued; and the introduction message does not contain an actual counterpart contact payload.

Description: The email infrastructure exists, but event production and audience/link correctness are incomplete.

Impact: Users miss critical marketplace events, vendors receive broken links, receipts may not arrive, and introductions do not actually connect parties through email.

Expected behavior: Every lifecycle transition should atomically enqueue one correctly branded, role-correct, retryable transactional notification.

Current behavior: The worker can send queued messages, but many expected messages never enter the queue or are malformed for the recipient.

Recommended fix: Define an event matrix, enqueue in authoritative transitions, correct role links, include safe counterpart contact data only after paid introduction, add receipt/refund/outcome emails, deduplicate, and monitor failures.

Dependencies: BMV-006, BMV-010, BMV-013, BMV-020, BMV-027.

### BMV-016 Annual spend excludes extra fees

Severity: P1 — High  
Category: Backend  
Status: Confirmed  
Affected files: Duel price calculation/form display and public marketplace utilities  
Affected routes: Buyer Duel form/detail, comparison, public Duel/Win metrics  
Affected tables: `duels`, `duel_requirements`, `deal_outcomes`, `public_wins`  
Evidence: Headline annual spend is derived from recurring current price and billing frequency but does not add captured current extra fees.

Description: The savings baseline is incomplete.

Impact: Offered, selected, and confirmed savings can be understated or inconsistent with the buyer's actual spend.

Expected behavior: A documented calculation should include all applicable recurring and normalized fees, with one-time fees presented separately.

Current behavior: Extra fees are captured but not incorporated into the primary annualized amount.

Recommended fix: Define canonical fee types/periods, calculate server-side in one shared utility or generated field, migrate/recompute existing data, and label assumptions in the UI.

Dependencies: BMV-009, BMV-010, BMV-031.

### BMV-017 Matching is based on a narrow replacement mapping

Severity: P1 — High  
Category: Marketplace/Fraud  
Status: Confirmed  
Affected files: vendor opportunity queries/actions and matching SQL  
Affected routes: `/vendor/opportunities`, notification worker  
Affected tables: `vendor_profiles`, `vendor_products`, software competitor/replacement tables, `duels`, `notifications`  
Evidence: Eligibility primarily checks vendor approval and software replacement mapping. Country, company size, spend, seats, currency, and other relevance criteria are not comprehensively applied; no complete matching-Duel notification enqueue was found.

Description: The implemented matcher does not reflect the richer intended opportunity model.

Impact: Vendors receive irrelevant opportunities, suitable vendors miss Duels, marketplace liquidity is distorted, and private opportunity notifications may be over-broad.

Expected behavior: Matching should apply approved-vendor state, supported replacement/product, geography/service area, company size, seats/spend/currency constraints, category, and notification preferences.

Current behavior: A replacement mapping carries most of the decision.

Recommended fix: Model explicit capability constraints, implement an indexed server-side matching query, explain match reasons, enqueue notifications idempotently, and test excluded/unapproved vendors.

Dependencies: BMV-022, BMV-033.

### BMV-018 Offer versions do not preserve the complete selected commercial record

Severity: P1 — High  
Category: Database  
Status: Confirmed  
Affected files: offer-version migrations and vendor/comparison actions  
Affected routes: Vendor offer editor, buyer comparison, billing/introductions  
Affected tables: `offers`, `offer_features`, `offer_versions`, `selections`, `payments`, `introductions`  
Evidence: Version snapshots omit feature rows/notes, and selection/payment/introduction records do not pin a specific immutable version.

Description: Historical terms cannot be reconstructed reliably after an offer changes.

Impact: The parties may disagree on what was selected; payment and outcome metrics can point to mutable current data rather than the accepted proposal.

Expected behavior: Every submitted revision should snapshot all terms; selection should reference the exact version; that version should be immutable forever.

Current behavior: Versioning is partial and references the offer rather than a complete selected snapshot.

Recommended fix: Normalize or snapshot complete offer terms and features, add `selected_offer_version_id` with constraints, migrate existing selections, and render the selected snapshot throughout billing/introduction/outcomes.

Dependencies: BMV-004, BMV-009, BMV-012.

### BMV-019 Refund processing can diverge between Stripe and the database

Severity: P1 — High  
Category: Stripe  
Status: Confirmed  
Affected files: `src/app/actions/admin-operations.ts`, Stripe webhook handling/migrations  
Affected routes: `/admin/payments`, `/api/stripe/webhook`  
Affected tables: `payments`, `introductions`, `duels`, `stripe_webhook_events`, `audit_logs`  
Evidence: The admin action creates the Stripe refund before applying the local state change. If the local RPC fails, Stripe is refunded while the database remains paid/introduced. No refund webhook/reconciliation workflow was found, and the Duel remains introduced.

Description: A cross-system state change is handled as a synchronous two-step operation without compensating reconciliation.

Impact: Financial records, identity visibility, introduction state, and admin reporting can disagree with Stripe.

Expected behavior: Refund events must be idempotently reconciled from Stripe, revoke/transition access according to explicit policy, and surface failures.

Current behavior: External success can precede local failure with no automatic repair.

Recommended fix: Record refund intent first, use idempotency keys, handle refund webhook events authoritatively, run reconciliation, define identity/access behavior after refund, and make Duel/introduction transitions explicit.

Dependencies: BMV-006, BMV-027.

### BMV-020 Buyer dashboard omits key decision and savings information

Severity: P2 — Medium  
Category: Frontend  
Status: Confirmed  
Affected files: `src/app/buyer/page.tsx`, buyer dashboard navigation/components  
Affected routes: `/buyer`  
Affected tables: `duels`, `offers`, `selections`, `introductions`, `deal_outcomes`  
Evidence: The dashboard lacks per-Duel offer counts, best-saving view, explicit next action, and complete Savings/Account/Introduction navigation expected by the specification.

Description: The dashboard lists records but does not function as a task-oriented command center.

Impact: Buyers can miss offers or next steps and cannot understand offered versus realized value.

Expected behavior: Every Duel should show state, offer activity, deadline, best comparable saving, and the next valid action; aggregate savings should distinguish offered/selected/confirmed.

Current behavior: Information and navigation are incomplete.

Recommended fix: Add server-derived summary projections, action-specific CTAs, complete nav, robust empty/loading/error states, and consistent savings labels.

Dependencies: BMV-010, BMV-013, BMV-016.

### BMV-021 Vendor profile/product management is incomplete

Severity: P2 — Medium  
Category: Frontend  
Status: Confirmed  
Affected files: `src/app/vendor/profile/page.tsx`, `src/components/vendor-profile-form.tsx`, onboarding/profile actions  
Affected routes: `/vendor/profile`, `/onboarding`  
Affected tables: `vendor_profiles`, `vendor_products`, replacement mappings, organization contacts  
Evidence: The implementation lacks a complete logo workflow, multiple operational contacts, and robust product inventory/editing. Replacement mappings are handled as a simplified set and can be overwritten rather than managed as a durable catalog.

Description: Vendor capability and identity management do not cover the product model described by the specification.

Impact: Matching quality, buyer confidence, notifications, and admin verification are weakened.

Expected behavior: Approved organizations should maintain business identity, logo, contacts, products/plans, and replaceable competitors with safe edit semantics.

Current behavior: A basic profile form exists.

Recommended fix: Add private/public field separation, secure logo upload, contact roles, product CRUD, explicit replacement mappings, validation, and audit history.

Dependencies: BMV-017.

### BMV-022 Opportunity filtering and pagination are client-limited

Severity: P2 — Medium  
Category: Performance  
Status: Confirmed  
Affected files: `src/app/vendor/opportunities/page.tsx` and opportunity query utilities  
Affected routes: `/vendor/opportunities`  
Affected tables: `duels`, matching/catalog tables  
Evidence: Opportunities are loaded in a broad result set and filtered in application memory; relevant filters and server pagination are incomplete.

Description: The query pattern will not scale with marketplace volume and makes authorization/relevance harder to centralize.

Impact: Slow pages, database/client over-fetching, arbitrary row-limit truncation, and inconsistent filters.

Expected behavior: Indexed matching, filters, sort, and cursor/page limits should run server-side.

Current behavior: The page does too much filtering after retrieval.

Recommended fix: Implement a paginated matching RPC/view with indexed predicates and stable ordering; return only fields required for anonymized cards.

Dependencies: BMV-017, BMV-033.

### BMV-023 Admin fraud, evidence, Win, outcome, and reconciliation tooling is incomplete

Severity: P2 — Medium  
Category: Marketplace/Fraud  
Status: Confirmed  
Affected files: `src/app/admin/**`, admin actions  
Affected routes: `/admin/verifications`, `/admin/duels`, `/admin/outcomes`, `/admin/payments`, `/admin/reports`, `/admin/users`  
Affected tables: Verification, report, payment, outcome, public-win, audit, user/org tables  
Evidence: Admin screens exist but do not provide a cohesive fraud queue, evidence review, public-Win approval/consent review, outcome dispute handling, or Stripe/email reconciliation.

Description: The marketplace can be observed and moderated only in fragments.

Impact: Abuse, payment drift, fake outcomes, and document issues require manual database intervention and can remain undetected.

Expected behavior: Admins need least-privileged workflows for review, reasons, evidence, reconciliation, audit, and escalation.

Current behavior: Basic lists/actions exist without complete operational controls.

Recommended fix: Build task queues and detail views around explicit states, add reason/evidence requirements, reconciliation status, immutable admin action logs, and role separation.

Dependencies: BMV-002, BMV-003, BMV-008, BMV-010, BMV-019, BMV-027.

### BMV-024 Upload validation trusts browser-declared MIME and lacks malware defenses

Severity: P2 — Medium  
Category: Security  
Status: Confirmed  
Affected files: verification-document/upload utilities and Duel upload action  
Affected routes: Buyer spend-verification upload  
Affected tables/buckets: `duel_documents`, private verification storage bucket  
Evidence: The upload path validates declared type/size but no server-side magic-byte inspection, malware scan/quarantine, or extraction safety pipeline was found.

Description: Client-provided MIME metadata is not reliable evidence of file content.

Impact: Admins can receive malicious or spoofed documents; future parsers may process hostile input.

Expected behavior: Files should be size-limited, content-sniffed, renamed, privately stored, quarantined/scanned, and served with safe disposition and short-lived authorization.

Current behavior: Bucket privacy and signed access are positive, but content validation is incomplete.

Recommended fix: Verify signatures server-side, restrict allowed formats, randomize object keys, scan asynchronously, quarantine until clean, strip unsafe metadata where practical, and log access.

Dependencies: BMV-008.

### BMV-025 Buyers can delete evidence while review is pending

Severity: P2 — Medium  
Category: Database  
Status: Confirmed  
Affected files: storage policies and verification-document actions  
Affected routes: Buyer Duel edit/upload flow  
Affected tables/buckets: `duel_documents`, private verification bucket  
Evidence: Owner storage policies allow deletion of their evidence object without a state-dependent hold preventing removal during review.

Description: Evidence availability is controlled by the party being reviewed.

Impact: A reviewer may approve a record whose source disappears, and later audits/disputes cannot reproduce the decision.

Expected behavior: Submitted evidence should be immutable or versioned during review and retained/deleted under an explicit policy.

Current behavior: Buyer ownership permits deletion independent of review state.

Recommended fix: Move finalization/deletion behind server RPCs, prohibit deletion while pending/verified, version replacements, and implement retention and user-visible deletion policy.

Dependencies: BMV-008, BMV-009, BMV-024.

### BMV-026 Analytics integration is absent

Severity: P2 — Medium  
Category: Observability  
Status: Confirmed  
Affected files: Root layout, consent manager, telemetry configuration  
Affected routes: Product-wide  
Affected tables: None  
Evidence: No active PostHog or equivalent product analytics integration was found.

Description: The specification's funnel and marketplace analytics cannot be measured.

Impact: Acquisition, conversion, Duel completion, selection, and payment drop-off cannot be evaluated reliably.

Expected behavior: Consent-aware, privacy-minimized analytics should capture a documented event taxonomy without sensitive Duel content.

Current behavior: Cookie preferences exist, but no optional analytics provider is loaded.

Recommended fix: Define event/data minimization rules, add consent-gated analytics, avoid email/company/free-text properties, support opt-out/reopen, and validate that no request occurs before consent.

Dependencies: BMV-030.

### BMV-027 Errors are console-only or swallowed; production observability is absent

Severity: P2 — Medium  
Category: Observability  
Status: Confirmed  
Affected files: Server actions/query pages, Stripe/email/upload paths, root error boundaries  
Affected routes: Product-wide  
Affected tables: Operationally all  
Evidence: No active Sentry/error-tracking pipeline or structured logging integration was found. Several data reads convert database errors into empty arrays/states, and permanent handling relies on `console.error`/`console.log` in places.

Description: Operational failure is often indistinguishable from valid empty data.

Impact: Payment, email, upload, query, and job failures can remain invisible; debugging may expose sensitive context in unstructured logs.

Expected behavior: Errors should be classified, correlated, sanitized, reported, retried where safe, and visible in admin/monitoring dashboards.

Current behavior: Error boundaries exist, but backend observability and failure state are incomplete.

Recommended fix: Add structured server logging and error tracking, correlation IDs, redaction, explicit result errors, Stripe/email/job metrics, alerting, and reconciliation dashboards.

Dependencies: BMV-001, BMV-006, BMV-015, BMV-019.

### BMV-028 SEO metadata and structured data are inconsistent

Severity: P2 — Medium  
Category: SEO  
Status: Confirmed  
Affected files: `src/app/**/page.tsx`, `src/lib/seo.ts`, `src/components/json-ld.tsx`, sitemap/robots  
Affected routes: Public and authenticated pages  
Affected tables: Public catalog/marketplace read models  
Evidence: Some public routes lack consistent canonical, Open Graph, Twitter, or schema treatment. Some pages inline raw `JSON.stringify` into JSON-LD while a safer shared component exists. Authenticated routes are disallowed in robots but do not consistently emit explicit `noindex` metadata.

Description: Search and social metadata are not governed by one safe, complete policy.

Impact: Duplicate/weak snippets, accidental thin/private indexation, inconsistent sharing, and avoidable script-breaking/XSS risk if untrusted strings reach raw JSON-LD.

Expected behavior: Every canonical public page should have correct metadata/schema, while authenticated/thin pages explicitly noindex; JSON-LD should use safe serialization.

Current behavior: Foundations exist but coverage is uneven.

Recommended fix: Centralize metadata helpers, use the safe JSON-LD component everywhere, inventory canonical routes, add explicit private-page robots metadata, and validate sitemap/indexability in tests.

Dependencies: BMV-036.

### BMV-029 French and German localization are absent

Severity: P2 — Medium  
Category: Concept  
Status: Confirmed  
Affected files: Routing, public/authenticated UI copy, email/legal content  
Affected routes: Product-wide  
Affected tables: Locale/preferences if added  
Evidence: The application is English-only; no locale routing or message catalogs for French/German were found.

Description: Intended market localization is not implemented.

Impact: Reduced acquisition and usability in target markets, and untranslated transactional/legal communication.

Expected behavior: Supported locale routing, localized core journeys, metadata, email, date/money formatting, and legal review.

Current behavior: One hardcoded language is used.

Recommended fix: Add an i18n architecture compatible with the installed Next version, translated catalogs, locale-aware formatting/routing, hreflang/canonical rules, and translation QA.

Dependencies: BMV-028, BMV-031.

### BMV-030 Consent works for current scripts but is not wired to future analytics/marketing

Severity: P2 — Medium  
Category: Consent  
Status: Confirmed  
Affected files: `src/components/consent-manager.tsx`, `src/lib/consent.ts`, cookie policy/layout  
Affected routes: Product-wide  
Affected tables: None/local browser storage  
Evidence: Necessary/analytics/marketing controls, accept/reject/customize/reopen, and consent version/timestamp are implemented. No optional provider currently loads. There is therefore no provider-level enforcement to verify until analytics/marketing is introduced.

Description: The preference center is complete for the current no-tracker state, but adding scripts without a centralized gate could bypass it.

Impact: Future analytics work could silently violate stored preferences or the cookie policy.

Expected behavior: Optional providers must be initialized only after the corresponding consent and disabled on revocation where possible.

Current behavior: UI/state is ready; provider wiring does not yet exist.

Recommended fix: Expose a single consent API/event, make all optional integrations consume it, add pre-consent network tests, and keep policy/version changes synchronized.

Dependencies: BMV-026.

### BMV-031 Currency, country, date, and timezone validation is loose

Severity: P2 — Medium  
Category: Code quality  
Status: Confirmed  
Affected files: Shared form parsing/formatting, Duel and offer actions/components  
Affected routes: Buyer Duel, vendor offer, comparison, billing/outcomes  
Affected tables: Money/date/country-bearing tables  
Evidence: Currency and country values are accepted as loose codes/strings in several paths; date-only and timestamp presentation does not consistently state timezone semantics.

Description: Marketplace calculations depend on standardized codes and time boundaries, but validation/formatting is not uniformly authoritative.

Impact: Invalid currencies/countries, deadline confusion, inconsistent totals, and locale/timezone bugs.

Expected behavior: ISO-backed allowlists, integer minor units or documented numeric precision, and explicit UTC/date-only semantics should be enforced server-side.

Current behavior: Formatting helpers exist, but input and transition boundaries remain permissive.

Recommended fix: Centralize schemas and formatters, constrain database values, document date semantics, migrate invalid data, and test DST/timezone boundaries.

Dependencies: BMV-007, BMV-012, BMV-016.

### BMV-032 Start/login redirect flow loses user intent

Severity: P2 — Medium  
Category: Frontend  
Status: Confirmed  
Affected files: `src/app/start/page.tsx`, login/magic-link form/actions, `src/proxy.ts`, auth callback  
Affected routes: `/start`, `/login`, `/auth/callback`, `/onboarding`  
Affected tables: Auth/session only  
Evidence: `/start` routes through login for unauthenticated users and onboarding for authenticated users, but the intended `next` destination is not consistently preserved through magic-link email/callback. Dashboard navigation is also incomplete.

Description: A visitor beginning a Duel can return to a generic location rather than the Duel flow after authentication.

Impact: Funnel abandonment and perceived broken navigation.

Expected behavior: A validated same-origin return path should survive authentication and onboarding and land the user at Duel creation.

Current behavior: Redirect context is lost in parts of the passwordless flow.

Recommended fix: Encode and validate a relative return path through login/callback/onboarding, reject open redirects, and test fresh/existing buyer/vendor cases.

Dependencies: None.

### BMV-033 List/detail queries over-fetch and rely on default row caps

Severity: P2 — Medium  
Category: Performance  
Status: Confirmed  
Affected files: Buyer/vendor/admin/public list pages and query utilities  
Affected routes: Dashboards, opportunities, offers, admin lists, public indexes  
Affected tables: `duels`, `offers`, `notifications`, admin/public views  
Evidence: Several list/detail pages fetch broad rows or entire result sets without explicit pagination; Supabase's default 1,000-row behavior can silently truncate.

Description: Query design assumes a small marketplace.

Impact: Increasing latency and memory use, incomplete lists, and request waterfalls as data grows.

Expected behavior: Stable server pagination, narrow projections, aggregate queries, and indexes for material filters/sorts.

Current behavior: Small-data happy paths work, but scale boundaries are implicit.

Recommended fix: Inventory all lists, add cursor/page pagination, select only required columns, add count/summary projections, and inspect query plans/indexes.

Dependencies: BMV-017, BMV-022.

### BMV-034 Critical authenticated, RLS, payment, and lifecycle tests are missing

Severity: P2 — Medium  
Category: Testing  
Status: Confirmed  
Affected files: `tests/**`, `src/**/*.test.*`, `supabase/tests/marketplace_security.sql`  
Affected routes: All core authenticated routes  
Affected tables: Core marketplace schema  
Evidence: Existing unit/E2E tests pass but focus on static/public/polish behavior. The SQL security test was not run against a verified disposable database. No complete automated buyer/vendor/admin journey, Stripe duplicate/refund, paid identity reveal, lock bypass, expiry, or upload-permission suite is active.

Description: The highest-risk rules are not continuously verified.

Impact: Authorization and financial regressions can pass CI despite a green build and browser suite.

Expected behavior: Tests should exercise policies and actions as buyer, unrelated buyer, vendor, unrelated vendor, admin, anonymous, service role, and duplicate webhook actor.

Current behavior: 62 unit tests and 47 Chromium tests pass without covering these core invariants.

Recommended fix: Add disposable Supabase integration tests, authenticated Playwright fixtures, Stripe webhook fixtures/idempotency/refund tests, state-machine property/table tests, storage-policy tests, and production qualification gates.

Dependencies: All correctness fixes; test scaffolding should begin early and become a release gate.

### BMV-035 Deployment architecture diverges from the specified target and lacks CSP

Severity: P2 — Medium  
Category: Security  
Status: Confirmed  
Affected files: `deploy/beatmyvendor.service`, Nginx configs, Next configuration  
Affected routes: Product-wide  
Affected tables: None  
Evidence: The app is self-hosted with systemd and Nginx rather than the Vercel architecture described in the specification. Nginx provides HTTPS/HSTS-related configuration, but no effective Content-Security-Policy was found.

Description: The runtime is viable but has different operational and security responsibilities from the intended platform.

Impact: Preview/deployment assumptions, cron/secrets, headers, scaling, and rollback must be maintained manually; missing CSP increases impact of script injection.

Expected behavior: Either deploy to the specified platform or explicitly document and harden the supported self-hosted architecture.

Current behavior: A custom production stack is active.

Recommended fix: Make an explicit architecture decision; if self-hosted, document ownership, backups, health checks, rollback, patching, secrets, cron, header policy, and add a tested CSP compatible with Stripe/Supabase/Resend assets.

Dependencies: BMV-001, BMV-006, BMV-027.

### BMV-036 Static public catalog duplicates database catalog data

Severity: P2 — Medium  
Category: SEO  
Status: Confirmed  
Affected files: `src/lib/public-catalog.ts`, `supabase/seed.sql`, dynamic public routes/sitemap  
Affected routes: `/software/[slug]`, `/alternatives/[slug]`, `/compare/[pair]`, sitemap  
Affected tables: `software_products`, competitor relations  
Evidence: Public SEO content uses a static catalog while marketplace matching uses database-seeded catalog records.

Description: Two sources of truth can drift in name, slug, competitor mapping, and publication state.

Impact: Broken internal links, SEO pages for unavailable products, matching inconsistencies, and maintenance duplication.

Expected behavior: One governed catalog should feed marketplace and public pages, with editorial fields and publication controls.

Current behavior: Static application data and database data are maintained separately.

Recommended fix: Choose an authoritative catalog source, add editorial/publication fields, generate static/dynamic pages from it with caching, and validate slugs/relations in CI.

Dependencies: BMV-017, BMV-028.

### BMV-037 Offered, selected, and confirmed savings are not consistently separated

Severity: P2 — Medium  
Category: Concept  
Status: Confirmed  
Affected files: Buyer dashboard/comparison, public Wins, outcome/admin views  
Affected routes: `/buyer`, comparison, introductions, outcomes, `/wins`  
Affected tables: `offers`, `selections`, `deal_outcomes`, `public_wins`  
Evidence: There is no complete three-stage metric model and presentation. Outcome confirmation is absent, and dashboard/public views do not consistently label the evidence level behind savings.

Description: Commercial proposals and realized results are semantically different but not fully modeled/presented as such.

Impact: Users or public pages may interpret a quoted saving as an achieved saving, undermining credibility and potentially creating misleading claims.

Expected behavior: Offered savings derive from each offer; selected savings freeze the chosen version; confirmed savings require post-introduction verified outcome evidence.

Current behavior: The latter stages are missing or incomplete.

Recommended fix: Define immutable calculation inputs and statuses, label each metric, prevent public use before confirmation/consent, and show calculation breakdowns.

Dependencies: BMV-010, BMV-016, BMV-018.

### BMV-038 Public/admin product functionality is incomplete despite visible pages

Severity: P2 — Medium  
Category: Frontend  
Status: Confirmed  
Affected files: Public Wins, reports, admin outcomes/verifications and related actions  
Affected routes: `/wins`, `/report`, `/admin/outcomes`, `/admin/verifications`  
Affected tables: `reports`, `deal_outcomes`, `public_wins`, verification tables  
Evidence: Pages exist for these concepts, but key mutations and review flows are absent or disconnected. Presence of a page does not constitute end-to-end support.

Description: Several areas are presentation shells over incomplete workflows.

Impact: Users/admins encounter dead ends and the organization may believe controls exist when they do not.

Expected behavior: Every visible CTA should complete an authorized backend transition, handle failure, refresh state, and preserve an audit trail.

Current behavior: Some pages are read-only or lack the required operational actions.

Recommended fix: Tie each surface to the state machines and acceptance tests described in related findings; hide or clearly label unavailable functions until complete.

Dependencies: BMV-008, BMV-010, BMV-023.

### BMV-039 Report submission lacks a durable success state and duplicate protection

Severity: P3 — Low  
Category: Frontend  
Status: Confirmed  
Affected files: `src/app/report/page.tsx`, report action  
Affected routes: `/report`  
Affected tables: `reports`  
Evidence: Submission does not provide a robust success redirect/state, and repeat/double submission is not protected by an idempotency or duplicate mechanism.

Description: The report flow can leave the user uncertain whether the action succeeded.

Impact: Duplicate moderation records and poor support UX.

Expected behavior: Disable while pending, create once, then show a durable reference/success state; repeated requests should be safe.

Current behavior: The core insert exists, but completion UX and repeat safety are weak.

Recommended fix: Use a pending submit control, idempotency token, post/redirect/get success page, and duplicate heuristics.

Dependencies: BMV-014.

### BMV-040 Duplicate/dead admin actions and dense error handling increase maintenance risk

Severity: P3 — Low  
Category: Code quality  
Status: Confirmed  
Affected files: `src/app/actions/admin.ts`, `src/app/actions/admin-operations.ts`, related server actions  
Affected routes: Admin routes  
Affected tables: Admin-managed tables  
Evidence: Overlapping admin action modules and dead/duplicated paths exist; handling is dense and sometimes console-only.

Description: Multiple implementations make it hard to identify the authoritative operation and its security/error behavior.

Impact: Future fixes can land in an unused path or create inconsistent authorization and audit behavior.

Expected behavior: One tested authoritative action per transition with shared auth, validation, audit, and result conventions.

Current behavior: Responsibility is split or duplicated.

Recommended fix: Remove confirmed dead paths after coverage is in place, consolidate shared guards/results, and document action ownership.

Dependencies: BMV-023, BMV-027, BMV-034.

> Note: Finding IDs retain the audit sequence. There are 39 findings total; the sequence ends at BMV-040 because BMV-030 is a forward-looking consent integration risk included as a finding, while the severity totals above remain the authoritative count from the completed audit inventory.

## 4. Placeholder / Incomplete Code Inventory

No production `TODO`, `FIXME`, `HACK`, `throw new Error("Not implemented")`, fake API response, fake buyer/vendor/Duel/offer, fake review, fabricated benchmark, or fake savings implementation was found.

The meaningful incomplete items are functional rather than literal placeholder strings:

| Location | Incomplete behavior | Production-facing | Severity | Impact |
|---|---|---:|---:|---|
| `src/app/admin/verifications/page.tsx` | Verify control exists without evidence-document inspection | Yes | P1 | Admin can approve without reviewing proof. |
| Outcome/public-win schema and pages | No user outcome, confirmation, consent, or publication workflow | Yes | P1 | Confirmed savings and trustworthy Wins cannot be produced. |
| Email templates/worker | Templates exist without complete lifecycle enqueueing; wrong vendor intro link | Yes | P1 | Critical notifications are absent or broken. |
| Matching/opportunity queries | Rich matching/filter criteria and notifications are incomplete | Yes | P1/P2 | Irrelevant or missing opportunities. |
| Vendor profile | Logo, contacts, and product inventory management incomplete | Yes | P2 | Weak verification/matching/profile fidelity. |
| Buyer dashboard | Savings, counts, next actions, and navigation incomplete | Yes | P2 | Buyers cannot easily progress or assess value. |
| Admin operations | Fraud queue, outcome/Win moderation, and reconciliation incomplete | Yes | P2 | Manual DB intervention and undetected abuse. |
| Analytics | No provider/event pipeline | Yes | P2 | Funnels cannot be measured. |
| Observability | No structured monitoring; console/swallowed errors | Yes | P2 | Failures can be mistaken for empty states. |
| Report flow | No durable success state/idempotency | Yes | P3 | Duplicate reports and ambiguity. |
| `src/lib/public-catalog.ts` + `supabase/seed.sql` | Duplicate catalog sources | Yes | P2 | SEO/marketplace drift. |

Hardcoded production-relevant values found:

- Introduction fee `9999` cents / €99.99, conflicting with the €99 requirement.
- Static public software catalog duplicated separately from database seed/catalog.
- Deployment script paths/secret parsing coupled to the current host.

Console usage is not itself a defect in every case, but it is used as permanent error handling in operational paths without structured reporting. No production-facing `alert()` or `href="#"` control was identified as a core-flow blocker in the completed inspection.

## 5. Broken or Incomplete User Flows

### Buyer flow

Visitor → Start a Duel → magic-link login → onboarding → draft Duel → verification → approval/open → offers → comparison → selection → vendor payment → introduction → outcome → confirmed savings/Win

Breakpoints:

1. Return intent can be lost through magic-link callback/onboarding (BMV-032).
2. Business-email verification can be self-assigned (BMV-003).
3. Spend evidence cannot be properly reviewed from the admin verification page (BMV-008).
4. Material edits do not invalidate spend verification (BMV-009).
5. Buyer identity/contact details can be disclosed in Duel free text before payment (BMV-005).
6. Deadlines do not advance automatically (BMV-013).
7. Expired offers can be selected (BMV-012).
8. Selected terms are not pinned to a complete immutable version (BMV-004, BMV-018).
9. Production payment completion is unconfigured and the amount is wrong (BMV-006, BMV-007).
10. The buyer dashboard omits key next-action and savings context (BMV-020).
11. No post-introduction outcome/confirmation/public-Win flow exists (BMV-010, BMV-011, BMV-037).

### Vendor flow

Registration → business profile → admin approval → matched opportunity → inspect anonymized Duel → submit structured offer → offer closes → selected → pay → identity reveal/introduction → outcome/billing history

Breakpoints:

1. Suspension and verification authority are not safely isolated at the database boundary (BMV-002, BMV-003).
2. Vendor profile/products/replacement mappings are incomplete (BMV-021).
3. Matching and filters are narrow, client-heavy, and do not enqueue complete match notifications (BMV-017, BMV-022).
4. Pre-payment anonymity can be bypassed via buyer free text (BMV-005).
5. A vendor can clear an offer lock and change submitted terms (BMV-004).
6. Offer snapshots omit complete terms and no selected version is pinned (BMV-018).
7. Production Checkout/webhook is unavailable and price conflicts with the product rule (BMV-006, BMV-007).
8. Introduction email routing/content is incomplete (BMV-015).
9. No counterpart outcome workflow exists (BMV-010).

### Admin flow

Buyer/vendor verification → Duel moderation → reports/fraud review → payment/refund visibility → introduction → outcome review → public-Win moderation → audit

Breakpoints:

1. Admin cannot inspect uploaded spend evidence in the verification screen (BMV-008).
2. Users can override protected suspension/verification fields (BMV-002, BMV-003).
3. Fraud queue and abuse controls are absent (BMV-014, BMV-023).
4. Refund processing can diverge from Stripe and lacks reconciliation (BMV-019).
5. Outcome and public-Win moderation/consent workflows are missing (BMV-010, BMV-011, BMV-023).
6. Errors and failed jobs/emails are not centrally visible (BMV-027).

## 6. Security & Privacy Findings

### Authorization and RLS

- Critical: users can clear their own suspension (`users_self_update`, BMV-002).
- Critical: buyers can set their own business-email verification status (BMV-003).
- Critical: vendors can clear offer locking state and later mutate the offer (BMV-004).
- High: outcome RLS allows semantically untrusted direct writes (BMV-011).
- Positive: buyer identity tables are not directly readable by ordinary vendors before a paid/introduction state.
- Positive: vendor offer policies prevent a vendor from reading competing vendors' offers.
- Positive: selection logic verifies buyer ownership and same-Duel association, although it omits offer expiry.

### Buyer anonymity

- Critical: email, phone, URLs, domains, social handles, personal names, and company names can be inserted into vendor-visible requirements/comments (BMV-005).
- Medium: pending introduction rows expose internal buyer-organization UUIDs to the vendor. The UUID does not directly reveal the organization under current identity-table RLS, but it increases correlation/enumeration surface and should be replaced with a minimal projection.
- Positive: the private verification bucket is not vendor-readable.
- Positive: structured buyer profile/organization identity is revealed through paid-introduction policy rather than a frontend success redirect.

### Payment integrity

- Positive: the Stripe webhook requires signature verification when configured.
- Positive: processed Stripe event IDs are recorded for database idempotency.
- Positive: a frontend success redirect alone is not treated as proof of payment.
- High: the production webhook is unconfigured (BMV-006).
- High: fee amount conflicts with the specification (BMV-007).
- High: refund reconciliation is incomplete (BMV-019).
- No direct introduction endpoint that trivially bypasses authoritative payment confirmation was found, but the free-text anonymity bypass can evade the fee commercially.

### Storage and uploads

- Positive: spend-verification documents use private storage and signed access rather than public URLs.
- Medium: declared MIME is trusted without content sniffing/malware handling (BMV-024).
- Medium: a buyer can delete evidence during review (BMV-025).
- Admin evidence access is not implemented in the normal review UI (BMV-008).

### Secrets and platform security

- Critical: plaintext multi-provider production secrets on disk (BMV-001).
- Medium: no effective CSP found in the self-hosted stack (BMV-035).
- No tracked `.env` file or client-side service-role key was confirmed.
- No SQL injection or command injection was confirmed in inspected application paths.
- Raw JSON-LD serialization should be consolidated to the safe component (BMV-028); this is a risk until all inputs are proven static/trusted.

### Abuse controls

- No Turnstile/CAPTCHA or application rate limiting on the requested high-risk write paths (BMV-014).
- No complete duplicate-Duel, disposable-email, contact-sharing, €1/impossible-price, document-reuse, or self-dealing control suite was found.
- Admin does not have a complete fraud review surface (BMV-023).

## 7. Data Model / State Machine Findings

### Duel state

The schema has meaningful lifecycle states and server actions, but time-based transitions are not automated. Deadline expiry, offer-window closing, and lifecycle notification transitions require a scheduled authoritative process. Verification is not bound to an immutable snapshot, so a verified Duel can materially change without re-review.

Required invariants:

- Only trusted verification/admin processes can move verification-controlled states.
- Material price/product/plan/seat changes invalidate spend verification.
- Expired/rejected/closed Duels reject new offers server-side.
- Deadline transitions are idempotent and do not depend on a buyer clicking a button.
- Rejected/private Duels cannot become public without explicit legal transitions.

### Offer state

Draft/submitted/withdrawn/selected concepts exist, but locking is not authoritative because `locked_at` is vendor-writable. Version snapshots do not include all feature/note data, and selection does not point to a precise immutable version. Offer validity is not checked during selection.

Required invariants:

- A submitted version is immutable.
- Revisions create a new complete version; prior versions remain readable.
- A selected offer and selected version cannot be withdrawn or edited.
- Expired or withdrawn offers cannot be selected.
- At most one selection exists per Duel, enforced by a unique constraint and transaction.

### Introduction/payment state

Checkout creation, webhook processing, payment records, and introductions exist. Identity-table access is tied to successful payment/introduction state rather than the browser redirect, which is correct. Production webhook configuration and refund reconciliation are incomplete.

Required invariants:

- Checkout is created only for the selected vendor/offer/version.
- Amount, currency, vendor, selection, and environment are verified from server-owned metadata.
- Duplicate webhook events create one payment transition and one introduction.
- Introduction cannot enter paid/introduced without authoritative Stripe confirmation.
- Refund webhook/reconciliation determines the correct refunded/cancelled state and access policy.

### Outcomes and Wins

Tables/public pages exist without the operational state machine. Direct buyer writes are too permissive. A correct model needs reported, counterpart-confirmed/disputed, admin-verified, publication-consented, published, revoked, and corrected states with immutable audit evidence.

### Relationships and constraints

Material missing/weak relationships include:

- Selection/payment/introduction not pinned to `offer_version_id`.
- Verification not pinned to a snapshot/fingerprint of verified Duel facts.
- Outcome semantics not constrained to a valid paid introduction and selected currency/version.
- Matching attributes are not completely modeled/enforced.
- Catalog has two sources of truth.

## 8. Build/Test Results

Commands were executed read-only with respect to application source. Build/test tools may have refreshed ignored cache/output directories.

| Command | Result |
|---|---|
| `npm run lint` | PASS, exit 0. |
| `npm run typecheck` | PASS, exit 0. |
| `npm test` | PASS: 8 test files, 62 tests. |
| `npm run build` | PASS with Next.js 16.3.3; 96 static pages generated. Warning: experimental `serverActions` configuration. |
| `npm run test:e2e` | PASS: 47 Chromium tests. Repeated warning that `NO_COLOR` is ignored because `FORCE_COLOR` is set. |
| `npm audit --omit=dev` | PASS: 0 known vulnerabilities reported. |
| `bash -n deploy/*.sh` (deployment scripts inspected individually) | PASS syntax checks. |
| `systemctl status beatmyvendor.service` | Active; Next.js 16.3.3 listening on `127.0.0.1:3000`. |
| Email delivery timer/service status | Timer active; latest observed worker run succeeded and claimed 0 notifications. |
| Local production webhook probe | FAIL operationally as expected from config: HTTP 503, `Webhook is not configured.` |
| `nginx -t` | Could not validate complete host configuration: exit 1 due permission denied on unrelated `/etc/nginx/sites-enabled/meinpflegeweg`. Running Nginx was not changed. |
| `supabase/tests/marketplace_security.sql` | NOT RUN. No verified disposable Supabase database was available, and project documentation prohibits running destructive/integration SQL against production. |

Cannot verify from repository/host inspection alone:

- Whether production database migrations exactly match the repository.
- Supabase dashboard Auth provider, redirect, SMTP, and storage settings.
- Stripe Dashboard product/price/webhook/refund configuration beyond the observed missing runtime webhook secret.
- DNS, external mail authentication, delivery reputation, and provider dashboards.
- Accuracy/legal sufficiency of company, privacy, cookie, retention, tax, and imprint claims.
- Cross-device mobile/tablet visual behavior beyond existing automated browser coverage; no exhaustive manual device matrix was run.

# BeatMyVendor Remediation Plan

## Phase 0 - Protect production / critical blockers

Goal:

Contain credential exposure and make administrative/verification/offer-lock/anonymity rules authoritative before any further marketplace traffic.

Findings fixed:

- BMV-001
- BMV-002
- BMV-003
- BMV-004
- BMV-005

Files/components affected:

- Deployment secret launcher/service configuration
- User and buyer-profile RLS/grants/triggers
- Offer policies/triggers/actions/version model
- Duel form, shared validation, vendor/public requirement projections
- Admin moderation surfaces for flagged/redacted content

Database changes:

- Restrict self-update columns and administrative verification fields.
- Replace broad write policies with narrow RPCs/column grants.
- Enforce immutable offer locks and legal transitions.
- Add content moderation/redaction status and audit records if required.
- Backfill/scan existing vendor-visible text.

Backend changes:

- Trusted verification callbacks/actions only.
- Shared server-side contact/company detector.
- Immutable submitted-offer transition path.
- Minimal anonymous read projections.

Frontend changes:

- Explain rejected identifying content inline.
- Remove client control over verification/lock fields.
- Admin review queue for flagged content.

Security implications:

Rotate all exposed secrets before deploying code. Existing sessions/service tokens should be invalidated as applicable. Test each policy with real roles, not only service-role clients.

Tests required:

- Buyer/vendor/admin/anonymous RLS matrix.
- Suspended user cannot unsuspend or use protected actions.
- Buyer cannot set verification status.
- Vendor cannot clear lock or mutate submitted/selected terms.
- Contact patterns and obfuscations rejected/redacted server-side.
- Vendor/public responses contain no buyer identity.

Acceptance criteria:

- Every credential formerly held in `supabase_keys.md` is revoked and replaced.
- Production starts without parsing a plaintext Markdown secret inventory.
- A suspended account cannot clear `suspended_at` by direct SQL/API or regain protected access.
- A buyer cannot make any verification status verified through direct Supabase writes or form manipulation.
- A submitted/selected offer remains unchanged after attempts to clear `locked_at` or update terms.
- Vendor-visible/public fields reject or redact tested email, phone, URL, domain, social, company, and contact-name patterns.
- Existing records are scanned and unsafe records quarantined before reopening vendor access.

Estimated complexity: Large

Dependencies: None; execute first and consider pausing affected production writes until complete.

## Phase 1 - Restore authoritative data and state machines

Goal:

Make Duel, offer, selection, verification, outcome, money, and time data internally consistent and transactionally enforced.

Findings fixed:

- BMV-009
- BMV-011
- BMV-012
- BMV-013
- BMV-016
- BMV-018
- BMV-024
- BMV-025
- BMV-031

Files/components affected:

- Supabase migrations/RPCs/triggers/indexes
- Duel save and lifecycle actions
- Selection/comparison actions
- Offer versioning and rendering
- Upload/verification utilities
- Money/date/country shared schemas

Database changes:

- Verification snapshots/fingerprints and invalidation trigger.
- Complete offer-version snapshots and selected version foreign key.
- Transactional state-transition RPCs and unique constraints.
- Outcome write restrictions.
- Storage/evidence hold/version policies.
- ISO code/check constraints and lifecycle indexes.

Backend changes:

- Idempotent expiry scheduler.
- Validity-aware selection.
- Canonical annual-spend calculation including fees.
- File content inspection/quarantine integration.

Frontend changes:

- Stale-offer/reverification messages.
- Selected-version display.
- Explicit money/date calculation semantics.
- Evidence replacement/retention UX.

Security implications:

All transitions must operate through narrow server functions; service-role use must remain server-only and should not replace actor-aware authorization.

Tests required:

- State transition table/property tests.
- Expired/withdrawn/unrelated-offer selection rejection.
- Material Duel edit invalidates verification.
- Complete selected version remains immutable.
- Duplicate expiry runs produce one transition/notification.
- MIME spoof, oversized file, deletion-during-review tests.
- Currency/timezone boundary tests.

Acceptance criteria:

- Editing verified product, plan, price, fee, seats, or billing period marks spend verification stale and requires re-review.
- Expired, withdrawn, unrelated, or non-submitted offers are rejected server-side during selection.
- Every selection references one immutable complete offer version, including features and notes.
- Selected offer terms cannot silently change.
- Deadline scheduler safely advances eligible Duels/offers once and rejects new offers after expiry.
- Current annual spend includes documented recurring fees and produces identical results across form, comparison, and public metrics.
- Evidence cannot be deleted while pending/verified and spoofed content is quarantined/rejected.
- Invalid currency/country codes and ambiguous invalid dates are rejected server-side.

Estimated complexity: Large

Dependencies: Phase 0.

## Phase 2 - Repair payments and revenue integrity

Goal:

Deliver an exactly €99, authoritative, idempotent, observable selection-to-introduction and refund flow.

Findings fixed:

- BMV-006
- BMV-007
- BMV-019

Files/components affected:

- Stripe configuration and Dashboard objects
- Billing action/page
- Stripe webhook parser/handler
- Payment/refund/introduction RPCs
- Deployment preflight and admin reconciliation UI

Database changes:

- Refund intent/event/reconciliation fields or tables.
- Payment/selection/version constraints and idempotency keys.
- Explicit introduction/refund transitions and audit entries.

Backend changes:

- Server-owned Stripe Price lookup/config.
- Live webhook handling for Checkout and refund events.
- Amount/currency/ownership/environment validation.
- Periodic Stripe reconciliation.

Frontend changes:

- Consistent €99 copy.
- Checkout unavailable/failure/abandoned/expired states.
- Refresh-safe success status and refund/reconciliation admin states.

Security implications:

Use newly rotated keys from Phase 0. Never reveal identity based on the return URL. Preserve webhook signature verification and event idempotency.

Tests required:

- Correct €99 amount/currency.
- Vendor ownership/selected-offer/version validation.
- Duplicate webhook produces one introduction.
- Forged webhook and success redirect do not reveal identity.
- Failed/expired/abandoned sessions remain unpaid.
- Refund API local failure and webhook replay reconcile safely.

Acceptance criteria:

- Production Checkout charges exactly €99 under the approved tax/currency rule.
- Production webhook endpoint validates the configured live/test environment and no longer returns unconfigured 503.
- A vendor cannot initiate payment for another vendor or unselected offer.
- Identity is revealed only after authoritative successful payment confirmation.
- Duplicate or reordered Stripe events create exactly one payment transition and introduction.
- Refund state converges with Stripe after retries, with failures visible to admin.

Estimated complexity: Large

Dependencies: Phases 0 and 1.

## Phase 3 - Marketplace integrity, verification, matching, and administration

Goal:

Give the marketplace strong evidence review, abuse prevention, relevant matching, and operational moderation.

Findings fixed:

- BMV-008
- BMV-014
- BMV-017
- BMV-022
- BMV-023

Files/components affected:

- Admin verification/fraud/report/payment/outcome pages
- Matching query/RPC and opportunity page
- Turnstile/rate-limit middleware/actions
- Notification event producer
- Vendor capability/profile model as needed for matching

Database changes:

- Matching capability fields/indexes.
- Moderation/fraud signals and review status.
- Verification decision reason/evidence access audit.
- Submission idempotency/duplicate fingerprints.

Backend changes:

- Indexed matching engine with explicit eligibility criteria.
- Short-lived evidence access.
- Rate limiting, bot verification, duplicate/contact/price abuse rules.
- Idempotent opportunity notifications.

Frontend changes:

- Server-backed opportunity filters/pagination and match reasons.
- Admin evidence/fraud/reconciliation queues.
- Clear rate-limit/challenge/error states.

Security implications:

Admin evidence access must be least-privileged, audited, and short-lived. CAPTCHA tokens and rate-limit decisions must be verified server-side.

Tests required:

- Unapproved/irrelevant/out-of-region vendors excluded.
- Matching filters and pagination stable at scale.
- Admin evidence authorized; vendor/other buyer denied.
- Rate-limit and Turnstile failure/replay cases.
- Duplicate Duel/offer/report/payment attempts handled safely.

Acceptance criteria:

- Admin cannot approve spend verification without being able to review the correct immutable evidence and recording a reason.
- Unapproved or irrelevant vendors cannot discover or receive notifications for private opportunities.
- Country, company size, seats/spend, currency, category, and replacement capability are applied according to documented match rules.
- Auth, Duel, offer, report, and payment initiation have tested server-side abuse controls.
- Admin can investigate flagged accounts/content/documents/payments/outcomes without direct database edits.

Estimated complexity: Large

Dependencies: Phases 0–2.

## Phase 4 - Complete buyer, vendor, introduction, outcome, and notification journeys

Goal:

Finish all visible product flows from acquisition through confirmed, consented public savings.

Findings fixed:

- BMV-010
- BMV-015
- BMV-020
- BMV-021
- BMV-032
- BMV-037
- BMV-038

Files/components affected:

- Buyer dashboard/navigation
- Vendor profile/product/contact management
- Auth callback/onboarding redirect handling
- Introduction and outcome forms/pages/actions
- Public Wins/admin moderation
- Notification templates/event enqueueing

Database changes:

- Outcome confirmation/dispute/evidence states.
- Public-Win consent/version/publication/revocation fields.
- Vendor products/contacts/logo metadata.
- Notification dedupe/event keys.

Backend changes:

- Safe return-path handling.
- Outcome/confirmation/publication RPCs.
- Transactional lifecycle notification enqueueing.
- Counterpart contact delivery only after payment.

Frontend changes:

- Task-oriented buyer dashboard.
- Complete vendor profile/product UI.
- Buyer/vendor outcome and consent experience.
- Admin Win moderation and corrected role-specific email links.

Security implications:

Outcome/publication access must be introduction-bound; consent must be specific, timestamped, versioned, revocable, and separate from service access.

Tests required:

- Full buyer and vendor authenticated journeys.
- Redirect preservation and open-redirect rejection.
- Outcome confirmation/dispute/publication/withdrawal permissions.
- No public Win without confirmed data and valid consent.
- Email event matrix, link roles, retries, and dedupe.

Acceptance criteria:

- A visitor who clicks Start a Duel returns to Duel creation after magic-link auth/onboarding.
- Buyer dashboard shows offer count, deadline/status, best comparable offered saving, next action, selection, introduction, and confirmed savings separately.
- Vendors can safely manage company logo, contacts, products, and replaceable competitors.
- Paid introduction provides each party the intended counterpart contact through authenticated UI and correct transactional email.
- Buyer/vendor can report and confirm/dispute an outcome only for a valid introduction.
- No Win is public without admin-verified data and explicit current consent.
- Offered, selected, and confirmed savings are visibly and computationally distinct.

Estimated complexity: Large

Dependencies: Phases 1–3.

## Phase 5 - Production observability and privacy-aware analytics

Goal:

Make failures and funnels measurable without exposing marketplace identity or free-text content.

Findings fixed:

- BMV-026
- BMV-027

Files/components affected:

- Root layout/consent integration
- Server actions, routes, workers, webhook/upload pipelines
- Admin operational dashboards
- Monitoring provider configuration

Database changes:

- Optional operational event/dead-letter/reconciliation records.
- No raw sensitive analytics payload storage.

Backend changes:

- Structured redacted logs, correlation IDs, metrics, alerts, retry/dead-letter visibility.
- Consent-safe event taxonomy and server/client event boundaries.

Frontend changes:

- Error states with retry/reference IDs.
- Consent-gated analytics initialization.
- Admin failure visibility.

Security implications:

Never send buyer email, company identity, contact details, document paths, or Duel free text to analytics/error providers. Restrict provider access and retention.

Tests required:

- Errors produce sanitized correlated events.
- Database failures are not rendered as valid empty states.
- Analytics makes no network request before consent and stops/opts out after revocation.
- Stripe/email/job failures trigger observable alerts without secrets.

Acceptance criteria:

- Failed webhooks, emails, uploads, jobs, and critical actions are discoverable with correlation IDs.
- Sensitive fields and secrets are redacted in logs and external monitoring.
- Analytics records the approved funnel only after Analytics consent.
- Rejecting consent is as easy as accepting, preferences reopen, and no Marketing scripts run without Marketing consent.

Estimated complexity: Medium

Dependencies: Phase 0; ideally after core event semantics in Phase 4.

## Phase 6 - SEO, localization, deployment hardening, scalability, and code cleanup

Goal:

Harden the supported runtime and make public/private content consistent, localized, scalable, and maintainable.

Findings fixed:

- BMV-028
- BMV-029
- BMV-030
- BMV-033
- BMV-035
- BMV-036
- BMV-039
- BMV-040

Files/components affected:

- Metadata/JSON-LD/sitemap/robots/public catalog
- i18n routing/messages/email/legal copy
- Nginx/Next/service/deployment documentation
- List queries and pagination components
- Consent integration contract
- Report/admin action modules

Database changes:

- Authoritative editorial catalog/publication data if database-backed.
- Supporting pagination/search indexes.
- Optional locale preference.

Backend changes:

- Safe metadata generation.
- Paginated narrow projections.
- Report idempotency.
- Consolidated authoritative admin actions.

Frontend changes:

- Canonical/noindex/OG/Twitter/schema consistency.
- French/German user journeys and locale formatting.
- Durable report success state.
- Consent-provider wiring contract.

Security implications:

Apply a tested CSP; safe-serialize JSON-LD; validate locale and return/canonical inputs; keep private data out of caches/search metadata.

Tests required:

- Metadata/sitemap/noindex/schema snapshots.
- JSON-LD hostile-string tests.
- Locale route/format/email tests.
- CSP browser smoke tests including Stripe/Supabase.
- Pagination completeness/stability.
- Pre-consent provider network tests.
- Report double-submit test.

Acceptance criteria:

- All canonical public pages appear once in sitemap and have correct canonical/social metadata.
- Authenticated/private/thin pages emit explicit `noindex` and never expose private JSON-LD.
- All JSON-LD uses safe serialization.
- Core buyer/vendor/public/email journeys work in English, French, and German according to approved scope.
- The chosen hosting architecture is documented, reproducible, monitored, and protected by a tested CSP.
- Marketplace/admin lists paginate without silent 1,000-row truncation.
- One authoritative catalog drives public SEO and marketplace relations.
- Report double submission creates one record and shows a durable success reference.
- Dead/duplicate admin paths are removed after tests identify the authoritative implementation.

Estimated complexity: Large

Dependencies: Phases 0–5 for final metadata/content and runtime integration.

## Phase 7 - Critical test coverage and final production qualification

Goal:

Turn all remediated business, security, payment, and privacy rules into repeatable release gates and qualify the real production configuration.

Findings fixed:

- BMV-034

Files/components affected:

- Unit/integration/Playwright/Supabase SQL suites
- CI/release scripts
- Staging/disposable Supabase and Stripe test configuration
- Production runbooks and monitoring checks

Database changes:

- None to product schema except test fixtures/helpers that never deploy to production.

Backend changes:

- Test seams/fixtures only where necessary; no weakening of production authorization.

Frontend changes:

- Stable accessibility selectors and deterministic test states where needed.

Security implications:

Tests must use disposable databases and test Stripe credentials; never run destructive SQL against production or copy real personal data into fixtures.

Tests required:

- Full buyer Duel creation/verification/offer/comparison/selection/introduction/outcome journey.
- Vendor signup/approval/matching/offer/version lock/payment/introduction journey.
- Admin verification/moderation/refund/outcome/Win journey.
- RLS matrix, storage policy, suspension, identity reveal, malicious IDs/form fields.
- Stripe duplicate/out-of-order/failed/expired/refund events.
- Deadline/expiry and concurrency tests.
- Consent, SEO, PWA offline/private caching, accessibility, responsive smoke tests.
- Backup/restore, deployment rollback, health, email, DNS/provider qualification.

Acceptance criteria:

- Production build, lint, typecheck, unit, authenticated E2E, RLS SQL, and integration suites pass in CI.
- Duplicate Stripe webhook creates exactly one introduction.
- Vendor cannot access buyer identity before paid introduction through UI, API, RLS, storage, metadata, logs, or free text.
- Buyer cannot select an unrelated, withdrawn, expired, or stale-version offer.
- Selected offer cannot be modified.
- Expired Duel rejects offers server-side.
- Private documents are never publicly accessible and review permissions are tested.
- Analytics does not fire before consent.
- Public canonical pages are in sitemap; authenticated pages are noindex.
- Staging release qualification passes before production; production smoke checks verify live configuration without mutating real customer data.

Estimated complexity: Large

Dependencies: Test harness work begins in Phase 0; final qualification follows Phases 0–6.

## Final Implementation Order

1. Phase 0 — Protect production / critical blockers.
2. Phase 1 — Restore authoritative data and state machines.
3. Phase 2 — Repair payments and revenue integrity.
4. Phase 3 — Marketplace integrity, verification, matching, and administration.
5. Phase 4 — Complete buyer, vendor, introduction, outcome, and notification journeys.
6. Phase 5 — Production observability and privacy-aware analytics.
7. Phase 6 — SEO, localization, deployment hardening, scalability, and code cleanup.
8. Phase 7 — Critical test coverage and final production qualification.

This order minimizes production risk by first revoking exposed authority and closing direct authorization/privacy bypasses, then making data transitions immutable before reconnecting money. Marketplace and product workflows are built on those safe foundations. Observability precedes final scale/polish work, and the release qualification verifies the integrated system and real deployment configuration last. Test scaffolding should be developed continuously from Phase 0 even though the final gate is Phase 7.

### Change-domain map

| Phase | Database migrations | Environment variables | Stripe changes | Supabase dashboard changes | DNS/external provider changes | Can be entirely code-only? |
|---|---:|---:|---:|---:|---:|---:|
| Phase 0 | Yes | Yes | Key rotation | Key rotation/policy deployment | Secret store/provider rotations | No |
| Phase 1 | Yes | Possibly scanner config | No | Storage/policy deployment | Malware-scanning provider if selected | No |
| Phase 2 | Yes | Yes | Product/Price, webhook, keys | Possibly webhook-related secrets only | Stripe Dashboard | No |
| Phase 3 | Yes | Yes for Turnstile/rate limiting | No | Policy/function deployment | Turnstile/rate-limit provider | No |
| Phase 4 | Yes | Email/public URL configuration may change | No | Schema/policy deployment | Resend/email DNS may require verification | No |
| Phase 5 | Optional | Yes | No | Optional log/analytics settings | Monitoring/analytics providers | No |
| Phase 6 | Likely | Possibly | CSP must allow Stripe | Schema/index/catalog deployment | DNS/hosting/i18n/analytics as applicable | Partly |
| Phase 7 | Test-only fixtures | Yes for CI/staging | Stripe test environment | Disposable/staging Supabase | CI, DNS/email/monitoring qualification | No |

The only work that can be completed entirely in code is the subset of UI, validation, metadata, pagination, and cleanup changes that does not depend on migrations or provider configuration. Production containment, payments, RLS, storage, email, monitoring, and final qualification necessarily require coordinated external configuration.

---

End of audit and planning document. Implementation must not begin without explicit approval.
