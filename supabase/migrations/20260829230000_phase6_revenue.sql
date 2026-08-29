begin;

alter table public.payments
  add column provider_receipt_url text,
  add column checkout_expires_at timestamptz;

create unique index payments_active_selection_idx
on public.payments(selection_id)
where status in ('pending', 'paid');

create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  payment_id uuid references public.payments(id),
  processed_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

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
    9999, 'eur', 'pending'
  ) returning id into saved_payment_id;
  return saved_payment_id;
exception when unique_violation then
  select p.id into saved_payment_id from public.payments p
  where p.selection_id = p_selection_id and p.status in ('pending','paid')
  order by p.created_at desc limit 1;
  return saved_payment_id;
end;
$$;

create or replace function public.attach_stripe_checkout(
  p_payment_id uuid,
  p_checkout_session_id text,
  p_checkout_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments p set
    provider_checkout_session_id = p_checkout_session_id,
    checkout_expires_at = p_checkout_expires_at
  where p.id = p_payment_id
    and p.status = 'pending'
    and public.is_organization_member(p.vendor_organization_id)
    and (p.provider_checkout_session_id is null or p.provider_checkout_session_id = p_checkout_session_id);
  if not found then raise exception 'Payment cannot be attached to this checkout' using errcode = '42501'; end if;
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
    if p_amount <> 9999 or lower(p_currency) <> 'eur' or payment_row.amount <> p_amount or payment_row.currency <> lower(p_currency) then
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

revoke all on function public.prepare_introduction_payment(uuid,uuid) from public, anon;
revoke all on function public.attach_stripe_checkout(uuid,text,timestamptz) from public, anon;
revoke all on function public.process_stripe_checkout_event(text,text,boolean,uuid,text,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.prepare_introduction_payment(uuid,uuid) to authenticated;
grant execute on function public.attach_stripe_checkout(uuid,text,timestamptz) to authenticated;
grant execute on function public.process_stripe_checkout_event(text,text,boolean,uuid,text,text,integer,text,text) to service_role;

comment on table public.stripe_webhook_events is 'Minimal Stripe event ledger for idempotent webhook processing; no raw customer payloads are retained.';
comment on function public.process_stripe_checkout_event(text,text,boolean,uuid,text,text,integer,text,text) is 'Service-role-only Stripe webhook state machine enforcing the fixed EUR 99.99 introduction fee.';

commit;
