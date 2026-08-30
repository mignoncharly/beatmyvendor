begin;

-- =============================================================================
-- Phase 2 - Repair payments and revenue integrity
-- Findings: BMV-006 (webhook/config), BMV-007 (exact EUR 99 fee),
--           BMV-019 (refund intent + authoritative reconciliation).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BMV-007: single source of truth for the introduction fee, now exactly EUR 99.
-- The Stripe Price must match this amount; the webhook rejects any mismatch.
-- -----------------------------------------------------------------------------
create or replace function public.introduction_fee_cents()
returns integer language sql immutable set search_path = '' as $$ select 9900; $$;
comment on function public.introduction_fee_cents()
  is 'Authoritative introduction fee in minor units (EUR 99.00). Must equal the configured Stripe Price.';
revoke all on function public.introduction_fee_cents() from public, anon;
grant execute on function public.introduction_fee_cents() to authenticated, service_role;

create or replace function public.prepare_introduction_payment(
  p_selection_id uuid,
  p_vendor_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_payment_id uuid;
begin
  if (select auth.uid()) is null or not public.is_organization_member(p_vendor_organization_id) then
    raise exception 'Vendor workspace access required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.selections s
    join public.offers o on o.id = s.offer_id
    join public.introductions i on i.selection_id = s.id
    where s.id = p_selection_id
      and o.vendor_organization_id = p_vendor_organization_id
      and o.status = 'selected'
      and i.status in ('awaiting_payment', 'paid', 'introduced')
  ) then
    raise exception 'No payable introduction found' using errcode = '23514';
  end if;

  select p.id into saved_payment_id
  from public.payments p
  where p.selection_id = p_selection_id
    and p.vendor_organization_id = p_vendor_organization_id
    and p.status in ('pending', 'paid')
  order by p.created_at desc limit 1;
  if saved_payment_id is not null then return saved_payment_id; end if;

  insert into public.payments (
    selection_id, vendor_organization_id, idempotency_key, amount, currency, status
  ) values (
    p_selection_id, p_vendor_organization_id,
    'introduction:' || p_selection_id::text || ':' || extensions.gen_random_uuid()::text,
    public.introduction_fee_cents(), 'eur', 'pending'
  ) returning id into saved_payment_id;
  return saved_payment_id;
exception when unique_violation then
  select p.id into saved_payment_id from public.payments p
  where p.selection_id = p_selection_id and p.status in ('pending','paid')
  order by p.created_at desc limit 1;
  return saved_payment_id;
end;
$$;

create or replace function public.process_stripe_checkout_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_payment_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount integer,
  p_currency text,
  p_receipt_url text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  introduction_row public.introductions;
  duel_id uuid;
begin
  insert into public.stripe_webhook_events (event_id, event_type, livemode, payment_id)
  values (p_event_id, p_event_type, p_livemode, p_payment_id)
  on conflict (event_id) do nothing;
  if not found then return false; end if;

  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found or payment_row.provider_checkout_session_id is distinct from p_checkout_session_id then
    raise exception 'Webhook payment does not match checkout session' using errcode = '23514';
  end if;

  if p_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
    if p_amount <> public.introduction_fee_cents() or lower(p_currency) <> 'eur'
       or payment_row.amount <> p_amount or payment_row.currency <> lower(p_currency) then
      raise exception 'Unexpected introduction payment amount or currency' using errcode = '23514';
    end if;
    if payment_row.status = 'pending' then
      update public.payments set
        provider_payment_intent_id = p_payment_intent_id,
        provider_receipt_url = p_receipt_url,
        status = 'paid'
      where id = p_payment_id;
    end if;

    select * into introduction_row
    from public.introductions where selection_id = payment_row.selection_id for update;
    if introduction_row.status = 'paid' then
      update public.introductions set status = 'introduced' where id = introduction_row.id;
      select s.duel_id into duel_id from public.selections s where s.id = payment_row.selection_id;
      update public.duels set status = 'introduced' where id = duel_id and status = 'selected';
      insert into public.notifications (organization_id, channel, template_key, payload)
      values
        (introduction_row.buyer_organization_id, 'email', 'introduction_completed', jsonb_build_object('introduction_id', introduction_row.id, 'duel_id', duel_id)),
        (introduction_row.vendor_organization_id, 'email', 'introduction_completed', jsonb_build_object('introduction_id', introduction_row.id, 'duel_id', duel_id));
    end if;
  elsif p_event_type = 'checkout.session.async_payment_failed' and payment_row.status = 'pending' then
    update public.payments set provider_payment_intent_id = p_payment_intent_id, status = 'failed' where id = p_payment_id;
    insert into public.notifications (organization_id, channel, template_key, payload)
    values (payment_row.vendor_organization_id, 'in_app', 'payment_failed', jsonb_build_object('payment_id', p_payment_id));
  elsif p_event_type = 'checkout.session.expired' and payment_row.status = 'pending' then
    update public.payments set status = 'cancelled' where id = p_payment_id;
  end if;
  return true;
end;
$$;

comment on function public.process_stripe_checkout_event(text,text,boolean,uuid,text,text,integer,text,text)
  is 'Service-role-only Stripe webhook state machine enforcing the fixed EUR 99.00 introduction fee.';

-- -----------------------------------------------------------------------------
-- BMV-019: refund intent is recorded before the external call, and refund
-- events are reconciled authoritatively. Identity access is already gated on
-- introduction.status in (paid, introduced), so a refund revokes it via the
-- existing payment->introduction sync trigger.
-- -----------------------------------------------------------------------------
alter table public.payments
  add column if not exists provider_refund_id text,
  add column if not exists refund_initiated_at timestamptz;

-- Step 1 of an admin refund: record intent and return the intent to refund.
create or replace function public.admin_initiate_refund(p_payment_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.assert_admin();
  intent text;
begin
  select provider_payment_intent_id into intent
  from public.payments where id = p_payment_id and status = 'paid' for update;
  if intent is null then
    raise exception 'This payment is not eligible for a refund' using errcode = '23514';
  end if;
  update public.payments set refund_initiated_at = coalesce(refund_initiated_at, now())
  where id = p_payment_id;
  insert into public.admin_actions (admin_user_id, action, target_type, target_id, reason, metadata)
  values (actor, 'refund_initiated', 'payment', p_payment_id, nullif(trim(p_reason), ''), '{}'::jsonb);
  return intent;
end;
$$;
revoke all on function public.admin_initiate_refund(uuid,text) from public, anon;
grant execute on function public.admin_initiate_refund(uuid,text) to authenticated;

-- Step 3 of an admin refund: reconcile locally. Idempotent so a prior webhook
-- reconciliation does not turn this into an error.
create or replace function public.admin_record_refund(p_payment_id uuid, p_provider_refund_id text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.assert_admin();
  current_status public.payment_status;
begin
  select status into current_status from public.payments where id = p_payment_id for update;
  if current_status is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if current_status = 'refunded' then
    update public.payments set provider_refund_id = coalesce(provider_refund_id, p_provider_refund_id)
    where id = p_payment_id;
    return;
  end if;
  if current_status <> 'paid' then
    raise exception 'Only a paid payment can be refunded' using errcode = '23514';
  end if;
  update public.payments set status = 'refunded', refunded_at = now(), provider_refund_id = p_provider_refund_id
  where id = p_payment_id;
  insert into public.admin_actions (admin_user_id, action, target_type, target_id, reason, metadata)
  values (actor, 'payment_refunded', 'payment', p_payment_id, nullif(trim(p_reason), ''),
    jsonb_build_object('provider_refund_id', p_provider_refund_id));
end;
$$;
revoke all on function public.admin_record_refund(uuid,text,text) from public, anon;
grant execute on function public.admin_record_refund(uuid,text,text) to authenticated;

-- Authoritative refund reconciliation from Stripe, idempotent on event id.
create or replace function public.process_stripe_refund_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_payment_intent_id text,
  p_refund_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare payment_row public.payments;
begin
  select * into payment_row from public.payments
  where provider_payment_intent_id = p_payment_intent_id for update;

  insert into public.stripe_webhook_events (event_id, event_type, livemode, payment_id)
  values (p_event_id, p_event_type, p_livemode, payment_row.id)
  on conflict (event_id) do nothing;
  if not found then return false; end if;          -- duplicate event, already processed
  if payment_row.id is null then return true; end if; -- unknown intent, nothing to reconcile

  if payment_row.status = 'paid' then
    update public.payments set
      status = 'refunded',
      refunded_at = now(),
      provider_refund_id = coalesce(payment_row.provider_refund_id, nullif(p_refund_id, ''))
    where id = payment_row.id;
    insert into public.notifications (organization_id, channel, template_key, payload)
    values (payment_row.vendor_organization_id, 'in_app', 'payment_refunded',
      jsonb_build_object('payment_id', payment_row.id));
  end if;
  return true;
end;
$$;
revoke all on function public.process_stripe_refund_event(text,text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.process_stripe_refund_event(text,text,boolean,text,text) to service_role;
comment on function public.process_stripe_refund_event(text,text,boolean,text,text)
  is 'Service-role-only Stripe refund reconciliation. Refunding a paid introduction cascades to introduction=refunded and revokes identity access.';

commit;
