# BeatMyVendor testing

## Local checks

Run the fast code and production checks:

    npm run check

Run the complete browser suite as well:

    npm run check:full

The browser suites can also be run independently:

    npm run test:phase10
    npm run test:phase11

Phase 10 covers responsive layouts, WCAG A/AA scans, keyboard navigation,
error routes, unsupported methods, and branded metadata. Phase 11 covers the
public acquisition journey, form constraints, catalog navigation, baseline
security headers, protected operational endpoints, and search-indexing
boundaries.

## Database integration journey (release gate)

The rollback-only journey in `supabase/tests/marketplace_security.sql` runs
against a database with all migrations applied. It verifies:

- Buyer A can read its Duel while Buyer B cannot.
- Direct writes to users / buyer_profiles / offers / requirements / deal_outcomes
  are revoked; the contact/company disclosure detector rejects identity.
- A submitted offer is immutable; its version snapshot captures the coverage matrix.
- Failed and expired Stripe checkouts leave the introduction locked; a failed
  payment queues the vendor notification; a fresh checkout can succeed afterward.
- Replaying the same Stripe event is idempotent (checkout and refund).
- Buyer identity is hidden before payment, revealed to the selected vendor after
  payment, and revoked again after a refund.
- Recurring fees fold into annual spend; a material spend edit invalidates the
  spend verification; an expired offer cannot be selected.
- The rate limiter, matching, and admin-evidence functions have correct
  privileges; opportunity matching is gated to approved members.

Run it through the release gate (skips cleanly when no database is provided):

    QUALIFY_DATABASE_URL="postgresql://…disposable-or-staging…" npm run test:sql

    # or the combined gate:
    QUALIFY_DATABASE_URL="postgresql://…" npm run qualify        # check + SQL
    QUALIFY_DATABASE_URL="postgresql://…" npm run qualify:full   # + Playwright

The script wraps all fixtures and assertions in a transaction and always ends
with `rollback`, so it is non-destructive. See `docs/production-qualification.md`
for the full release gate and the manual production-configuration checklist.

## External-service scenarios

Before launch, run a staging smoke test with real Supabase authentication,
private verification storage, Stripe test-mode Checkout, signed webhook
delivery, and the configured email provider. Local browser tests deliberately
do not fabricate successful responses from these services.

## Transactional email delivery

Every in-app notification is fanned out to a durable email notification by the
database. The delivery worker atomically claims due messages, renders the
matching branded HTML and plain-text template, sends through Resend, and records
the provider message ID. Temporary failures are retried with bounded exponential
backoff; invalid recipients and other permanent failures are retained as failed
notifications for operations review.

Production requires these settings:

    RESEND_API_KEY=re_...
    RESEND_FROM_EMAIL="BeatMyVendor <notifications@beatmyvendor.com>"
    RESEND_REPLY_TO_EMAIL=hello@beatmyvendor.com
    CRON_SECRET=a-long-random-secret

The authenticated worker endpoint is:

    POST /api/maintenance/notifications
    Authorization: Bearer $CRON_SECRET

The deployment includes `beatmyvendor-email.timer`, which invokes the endpoint
once per minute. Inspect it with:

    systemctl status beatmyvendor-email.timer
    journalctl -u beatmyvendor-email.service -n 100 --no-pager

For a manual production run:

    deploy/run-with-production-env.sh deploy/deliver-notifications.sh

Do not interpret an accepted Resend API response as inbox delivery. The stored
provider message ID identifies the accepted request; delivery and bounce status
remain observable in Resend.
