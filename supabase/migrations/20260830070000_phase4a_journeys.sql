begin;

-- =============================================================================
-- Phase 4A - Journeys: email lifecycle correctness + vendor profile completeness
-- Findings: BMV-015 (role-correct intro link + payment receipt),
--           BMV-021 (vendor logo + operational contact email).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BMV-015: the introduction email is sent to both parties, so the payload now
-- carries the recipient role (the template routes vendors to /vendor/...), and a
-- payment receipt is enqueued to the vendor on confirmed payment.
-- -----------------------------------------------------------------------------
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
      insert into public.notifications (organization_id, channel, template_key, payload)
      values (payment_row.vendor_organization_id, 'email', 'payment_receipt',
        jsonb_build_object('payment_id', p_payment_id));
    end if;

    select * into introduction_row
    from public.introductions where selection_id = payment_row.selection_id for update;
    if introduction_row.status = 'paid' then
      update public.introductions set status = 'introduced' where id = introduction_row.id;
      select s.duel_id into duel_id from public.selections s where s.id = payment_row.selection_id;
      update public.duels set status = 'introduced' where id = duel_id and status = 'selected';
      insert into public.notifications (organization_id, channel, template_key, payload)
      values
        (introduction_row.buyer_organization_id, 'email', 'introduction_completed', jsonb_build_object('introduction_id', introduction_row.id, 'duel_id', duel_id, 'role', 'buyer')),
        (introduction_row.vendor_organization_id, 'email', 'introduction_completed', jsonb_build_object('introduction_id', introduction_row.id, 'duel_id', duel_id, 'role', 'vendor'));
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

-- -----------------------------------------------------------------------------
-- BMV-021: private-by-default is unnecessary for a public logo, so a dedicated
-- public bucket serves vendor logos; writes are limited to workspace members.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-logos', 'vendor-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vendor_logos_member_write on storage.objects;
create policy vendor_logos_member_write on storage.objects for all to authenticated using (
  bucket_id = 'vendor-logos' and public.is_organization_member(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id = 'vendor-logos' and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

create or replace function public.set_vendor_logo(p_vendor_organization_id uuid, p_logo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_organization_role(p_vendor_organization_id, array['owner','admin']::public.membership_role[]) then
    raise exception 'Vendor workspace owner access required' using errcode = '42501';
  end if;
  update public.vendor_profiles set logo_path = nullif(trim(p_logo_path), '')
  where organization_id = p_vendor_organization_id;
end;
$$;
revoke all on function public.set_vendor_logo(uuid,text) from public, anon;
grant execute on function public.set_vendor_logo(uuid,text) to authenticated;

-- Add an operational contact email to the marketplace configuration RPC.
drop function if exists public.configure_vendor_marketplace(uuid,text,text,text,text,integer,integer,text[],text[],boolean,text,uuid,text,text,uuid[]);
create or replace function public.configure_vendor_marketplace(
  p_vendor_organization_id uuid,
  p_website_url text,
  p_country_code text,
  p_company_size text,
  p_description text,
  p_minimum_customer_size integer,
  p_maximum_customer_size integer,
  p_countries_served text[],
  p_currencies text[],
  p_migration_support boolean,
  p_contact_name text,
  p_contact_email text,
  p_software_product_id uuid,
  p_product_name text,
  p_product_url text,
  p_replaces_software_product_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_vendor_product_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.has_organization_role(
    p_vendor_organization_id,
    array['owner','admin']::public.membership_role[]
  ) or not exists (
    select 1 from public.vendor_profiles vp
    where vp.organization_id = p_vendor_organization_id
  ) then
    raise exception 'Vendor workspace owner access required' using errcode = '42501';
  end if;
  if p_country_code is not null and p_country_code !~ '^[A-Za-z]{2}$' then
    raise exception 'Invalid country code' using errcode = '23514';
  end if;
  if p_contact_email is not null and trim(p_contact_email) <> ''
     and p_contact_email !~ '^[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}$' then
    raise exception 'Invalid contact email' using errcode = '23514';
  end if;
  if p_minimum_customer_size is not null and p_maximum_customer_size is not null
    and p_maximum_customer_size < p_minimum_customer_size then
    raise exception 'Maximum customer size must be at least the minimum' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.software_products sp
    where sp.id = p_software_product_id and sp.is_active
  ) then
    raise exception 'Choose an active catalog product' using errcode = '23514';
  end if;
  if cardinality(coalesce(p_replaces_software_product_ids, '{}'::uuid[])) = 0 then
    raise exception 'Choose at least one product you can replace' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(p_replaces_software_product_ids) replacement_id
    where replacement_id = p_software_product_id
      or not exists (
        select 1 from public.software_competitors sc
        where sc.software_product_id = p_software_product_id
          and sc.competitor_product_id = replacement_id
      )
  ) then
    raise exception 'Every replacement must be a catalog competitor' using errcode = '23514';
  end if;

  update public.organizations set
    website_url = nullif(trim(p_website_url), ''),
    country_code = case when p_country_code is null or trim(p_country_code) = '' then null else upper(p_country_code) end,
    company_size = nullif(trim(p_company_size), '')
  where id = p_vendor_organization_id;

  update public.vendor_profiles set
    description = nullif(trim(p_description), ''),
    minimum_customer_size = p_minimum_customer_size,
    maximum_customer_size = p_maximum_customer_size,
    countries_served = array(select distinct upper(value) from unnest(coalesce(p_countries_served, '{}'::text[])) value where value ~* '^[A-Z]{2}$'),
    currencies = array(select distinct upper(value) from unnest(coalesce(p_currencies, '{}'::text[])) value where value ~* '^[A-Z]{3}$'),
    migration_support = coalesce(p_migration_support, false),
    contact_name = nullif(trim(p_contact_name), ''),
    contact_email = nullif(trim(p_contact_email), '')
  where organization_id = p_vendor_organization_id;

  insert into public.vendor_products (
    vendor_organization_id, software_product_id, product_name, product_url, is_active
  ) values (
    p_vendor_organization_id, p_software_product_id, trim(p_product_name), nullif(trim(p_product_url), ''), true
  )
  on conflict (vendor_organization_id, software_product_id) do update set
    product_name = excluded.product_name,
    product_url = excluded.product_url,
    is_active = true
  returning id into saved_vendor_product_id;

  delete from public.vendor_product_replacements
  where vendor_product_id = saved_vendor_product_id;

  insert into public.vendor_product_replacements (vendor_product_id, replaces_software_product_id)
  select saved_vendor_product_id, replacement_id
  from unnest(p_replaces_software_product_ids) replacement_id
  on conflict do nothing;

  return saved_vendor_product_id;
end;
$$;
revoke all on function public.configure_vendor_marketplace(uuid,text,text,text,text,integer,integer,text[],text[],boolean,text,text,uuid,text,text,uuid[]) from public, anon;
grant execute on function public.configure_vendor_marketplace(uuid,text,text,text,text,integer,integer,text[],text[],boolean,text,text,uuid,text,text,uuid[]) to authenticated;

commit;
