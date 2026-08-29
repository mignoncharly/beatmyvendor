# Phase 1 — Data & Security

Phase 1 is implemented as ordered Supabase migrations plus an idempotent catalog seed.

## Run locally

Install the Supabase CLI, then run:

```bash
supabase start
supabase db reset
```

`db reset` applies every file in `supabase/migrations/` and then `supabase/seed.sql`.

## Security invariants

- Buyer and vendor organizations are separate tenants with explicit memberships.
- Vendors never query `duels` directly. `list_vendor_opportunities()` returns an anonymous projection without buyer organization or contact fields.
- A buyer cannot read submitted offers while the submission window is open. Vendors can only read their own offers, so competitors' pricing remains secret.
- Verification files use the private `duel-verifications` bucket. Only the owning buyer organization and admins can access them.
- Vendor approval, spend review, payments, and introductions cannot be promoted by ordinary users.
- Submitted offers are locked and automatically snapshotted in `offer_versions`.
- Duel and offer state changes are checked in the database.
- Sensitive tables emit append-only audit rows; clients cannot write audit records or offer versions directly.
- Introduction identity access becomes available only after payment is recorded as paid or introduced.

## Storage path contract

Verification uploads must use this object path:

```text
<buyer-organization-uuid>/<duel-uuid>/<random-uuid>.<extension>
```

The database stores the same path in `duel_documents.storage_path`. Accepted formats are PDF, JPEG, PNG, and WebP, with a 10 MiB limit and a default 30-day retention deadline.

## Service-role responsibilities

Trusted server code uses the Supabase service role for operations that ordinary clients cannot perform:

- vendor approval and verification review;
- Stripe webhook payment transitions;
- introduction creation and identity unlock;
- notification delivery bookkeeping;
- retention-based object deletion.

The service role must never be exposed to browser code.

## Seed catalog

The seed includes the launch Customer Support category and ten products from the product brief. Competitor edges are directed and complete inside that launch category, allowing either-side lookups without recursive query logic. Vendor-specific replacement claims remain in `vendor_product_replacements`.
