# Phase 3 — Authenticated E2E test environment

> **Status (2026-08-31): implemented and green.** With `.env.test.local` in place:
> `npm run qualify:staging` runs the SQL security gate (over the IPv4 session
> pooler) **and** the authenticated Playwright journey. `npm run test:journey`
> runs just the journey; `npm run test:sql:staging` just the SQL gate.

The authenticated journey exercises the real app (magic-link auth, RLS, storage),
so it needs a **non-production** Supabase + **Stripe test** mode. It must never run
against the production project — it seeds users and writes real rows.

## Why a cloud staging Supabase (not local)
This host has no Docker or Supabase CLI, and the migrations/SQL suite depend on the
Supabase platform bootstrap (`auth.uid()`, `auth.users`, the `anon`/`authenticated`/
`service_role` roles, the `extensions` and `storage` schemas). The authenticated UI
journey additionally needs **GoTrue** (the magic-link auth server), which a bare
Postgres cannot provide. A free Supabase staging project supplies all of it and is
the target the SQL gate was designed for (`QUALIFY_DATABASE_URL`).

## What you provide (one-time)
A disposable/staging Supabase project and Stripe **test** credentials:

| Env var | Purpose |
|---|---|
| `STAGING_SUPABASE_URL` | staging project URL (also used as `NEXT_PUBLIC_SUPABASE_URL` for the local app run) |
| `STAGING_SUPABASE_ANON_KEY` | publishable/anon key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | service role — fixtures seed users/sessions |
| `QUALIFY_DATABASE_URL` | staging Postgres connection string (`postgresql://…`) — applies migrations + runs the SQL gate |
| `STRIPE_TEST_SECRET_KEY` | `sk_test_…` |
| `STRIPE_TEST_WEBHOOK_SECRET` | `whsec_…` from `stripe listen` / a test endpoint |
| `STRIPE_TEST_PRICE_ID` | a **test-mode** price of 9900 EUR (matches `introduction_fee_cents()`) |

Put these in `.env.test.local` (gitignored). Nothing production is touched.

## What I run
1. **Apply schema:** `psql "$QUALIFY_DATABASE_URL" -f` each `supabase/migrations/*.sql`
   in order (idempotent on a fresh project).
2. **SQL security gate:** `QUALIFY_DATABASE_URL=… npm run test:sql` — the ~44-check
   RLS/payment/reveal/refund suite (transactional, rolls back).
3. **Authenticated UI journey:** Playwright, app started locally against staging
   Supabase + Stripe test keys, using the auth fixture in `tests/fixtures/auth.ts`:
   buyer duel → verify → vendor match → offer → select → **test-card** checkout →
   identity reveal → refund → revoke → outcome → public win.
4. **Wire into the gate:** add the journey to `check:full`/`qualify:full`.

## Auth fixture contract
`tests/fixtures/auth.ts` mints a session without email delivery: service-role
`admin.generateLink({ type: 'magiclink' })` → `token_hash` → the browser visits
`/auth/callback?token_hash=…&type=…&next=…`, which calls `verifyOtp` and sets the
session cookies. No auth-bypass code ships to production.
