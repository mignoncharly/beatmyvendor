# VendorDuel testing

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

## Database integration journey

The rollback-only journey in `supabase/tests/marketplace_security.sql` is for a
disposable local Supabase database with all migrations applied. It verifies:

- Buyer A can read its Duel while Buyer B cannot.
- A vendor cannot read buyer identity before a paid introduction.
- A submitted offer is immutable.
- Failed and expired Stripe checkouts leave the introduction locked.
- A failed payment queues the vendor notification.
- A fresh checkout can succeed after earlier failures.
- Replaying the same Stripe event is idempotent.
- Buyer identity becomes visible to the selected vendor only after payment.

Run it only against a disposable local database:

    psql "$LOCAL_DATABASE_URL" --set ON_ERROR_STOP=1 \
      --file supabase/tests/marketplace_security.sql

The script wraps all fixtures and assertions in a transaction and always ends
with `rollback`.

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
    RESEND_FROM_EMAIL="VendorDuel <notifications@beatmyvendor.com>"
    RESEND_REPLY_TO_EMAIL=support@beatmyvendor.com
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
