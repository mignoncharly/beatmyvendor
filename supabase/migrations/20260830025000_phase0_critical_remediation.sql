begin;

-- Administrative account state is writable only through trusted functions such as
-- admin_set_user_suspension. RLS limits rows, but it cannot protect individual
-- columns from a user who owns the row.
revoke insert, update, delete on public.users from authenticated;

-- Buyer verification is derived by onboard_organization from the confirmed auth
-- identity. Clients may read their profile, but cannot replace or mutate the
-- authoritative verification fields (including by delete-and-reinsert).
drop policy if exists buyer_profiles_owner_write on public.buyer_profiles;
revoke insert, update, delete on public.buyer_profiles from authenticated;

-- Offers and their feature matrices are written through save_vendor_offer. This
-- removes the direct-table path that could clear locked_at before changing terms.
revoke insert, update, delete on public.offers from authenticated;
revoke insert, update, delete on public.offer_features from authenticated;

-- Requirements are written through save_buyer_duel so anonymity checks cannot be
-- bypassed with a direct PostgREST table mutation.
revoke insert, update, delete on public.duel_requirements from authenticated;

create or replace function public.duel_text_disclosure_reason(
  p_buyer_organization_id uuid,
  p_text text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  candidate text := lower(trim(coalesce(p_text, '')));
  normalized_candidate text;
  organization_name text;
  contact_name text;
  contact_domain text;
  normalized_identity text;
begin
  if candidate = '' then return null; end if;

  if candidate ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}' then
    return 'email address';
  end if;
  if candidate ~ '(^|[^[:alnum:]])(https?://|www[.])' then
    return 'web address';
  end if;
  if candidate ~ '(^|[^[:alnum:]])[[:alnum:]][[:alnum:]-]*([.][[:alnum:]][[:alnum:]-]*)*[.](com|net|org|io|co|ai|app|dev|de|fr|uk|eu)([^[:alnum:]]|$)' then
    return 'domain name';
  end if;
  if candidate ~ '(^|[^[:alnum:]_-])@[[:alnum:]_][[:alnum:]_.-]+' or candidate ~ 'linkedin[.]com' then
    return 'social profile';
  end if;
  if candidate ~ '(^|[^0-9])(\+?[0-9][0-9 ()/.-]{6,}[0-9])([^0-9]|$)' then
    return 'phone number';
  end if;

  select o.name, bp.contact_name, lower(split_part(bp.contact_email::text, '@', 2))
    into organization_name, contact_name, contact_domain
  from public.organizations o
  join public.buyer_profiles bp on bp.organization_id = o.id
  where o.id = p_buyer_organization_id;

  normalized_candidate := trim(regexp_replace(candidate, '[^[:alnum:]]+', ' ', 'g'));
  foreach normalized_identity in array array[
    trim(regexp_replace(lower(coalesce(organization_name, '')), '[^[:alnum:]]+', ' ', 'g')),
    trim(regexp_replace(lower(coalesce(contact_name, '')), '[^[:alnum:]]+', ' ', 'g'))
  ] loop
    if length(normalized_identity) >= 3
       and position(' ' || normalized_identity || ' ' in ' ' || normalized_candidate || ' ') > 0 then
      return 'buyer identity';
    end if;
  end loop;

  if length(coalesce(contact_domain, '')) >= 4 and position(contact_domain in candidate) > 0 then
    return 'buyer domain';
  end if;
  return null;
end;
$$;

revoke all on function public.duel_text_disclosure_reason(uuid,text) from public, anon, authenticated;

create or replace function public.protect_duel_requirement_anonymity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  buyer_organization_id uuid;
  disclosure_reason text;
begin
  select d.buyer_organization_id into buyer_organization_id
  from public.duels d where d.id = new.duel_id;

  disclosure_reason := public.duel_text_disclosure_reason(buyer_organization_id, new.label);
  if disclosure_reason is not null then
    raise exception 'Duel requirements cannot include contact or company details (%)', disclosure_reason
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_duel_requirement_anonymity on public.duel_requirements;
create trigger protect_duel_requirement_anonymity
before insert or update on public.duel_requirements
for each row execute function public.protect_duel_requirement_anonymity();

create or replace function public.validate_offer()
returns trigger language plpgsql set search_path = '' as $$
declare duel_row public.duels;
begin
  select * into duel_row from public.duels where id = new.duel_id;
  if not found then raise exception 'Duel does not exist' using errcode = '23503'; end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'New offers must start as drafts' using errcode = '23514';
  end if;
  if duel_row.status <> 'open' or duel_row.submission_deadline is null or duel_row.submission_deadline <= now() then
    if not (tg_op = 'UPDATE' and old.status <> 'draft') then
      raise exception 'This duel is not accepting offers' using errcode = '55000';
    end if;
  end if;
  if new.currency <> duel_row.currency then
    raise exception 'Offer currency must match duel currency' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.vendor_products vp
    where vp.id = new.vendor_product_id
      and vp.vendor_organization_id = new.vendor_organization_id
      and vp.is_active
  ) then
    raise exception 'Vendor product does not belong to the vendor' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.vendor_product_replacements vpr
    where vpr.vendor_product_id = new.vendor_product_id
      and vpr.replaces_software_product_id = duel_row.current_software_product_id
  ) then
    raise exception 'Vendor product is not registered as a replacement for the current software' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.locked_at is not null and (
    new.duel_id is distinct from old.duel_id or
    new.vendor_organization_id is distinct from old.vendor_organization_id or
    new.vendor_product_id is distinct from old.vendor_product_id or
    new.created_by is distinct from old.created_by or
    new.plan_name is distinct from old.plan_name or
    new.annual_price is distinct from old.annual_price or
    new.currency is distinct from old.currency or
    new.seats_included is distinct from old.seats_included or
    new.implementation_fee is distinct from old.implementation_fee or
    new.migration_fee is distinct from old.migration_fee or
    new.contract_months is distinct from old.contract_months or
    new.price_lock_months is distinct from old.price_lock_months or
    new.valid_until is distinct from old.valid_until or
    new.migration_included is distinct from old.migration_included or
    new.onboarding_included is distinct from old.onboarding_included or
    new.support_included is distinct from old.support_included or
    new.included_features is distinct from old.included_features or
    new.uncovered_features is distinct from old.uncovered_features or
    new.limitations is distinct from old.limitations or
    new.commercial_comment is distinct from old.commercial_comment or
    new.accuracy_confirmed_at is distinct from old.accuracy_confirmed_at or
    new.submitted_at is distinct from old.submitted_at or
    new.locked_at is distinct from old.locked_at
  ) then
    raise exception 'A locked offer cannot be changed' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and new.status = 'submitted' and old.status is distinct from 'submitted' then
    if new.accuracy_confirmed_at is null then
      raise exception 'Offer accuracy confirmation is required' using errcode = '23514';
    end if;
    new.submitted_at := now();
    new.locked_at := now();
  end if;
  if tg_op = 'UPDATE' and old.status <> new.status and not (
    (old.status = 'draft' and new.status in ('submitted', 'withdrawn')) or
    (old.status = 'submitted' and new.status in ('withdrawn', 'selected', 'not_selected', 'expired'))
  ) then
    raise exception 'Invalid offer transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Validate anonymity inside the only client-callable requirement write path. The
-- trigger above remains a second line of defense.
create or replace function public.save_buyer_duel(
  p_duel_id uuid,
  p_buyer_organization_id uuid,
  p_category_id uuid,
  p_current_software_product_id uuid,
  p_current_plan text,
  p_current_price numeric,
  p_billing_frequency public.billing_frequency,
  p_currency text,
  p_seats integer,
  p_approximate_ticket_volume integer,
  p_current_fees numeric,
  p_renewal_date date,
  p_contract_months integer,
  p_country_code text,
  p_company_size text,
  p_switching_timeline text,
  p_buyer_intent public.buyer_intent,
  p_private_comment text,
  p_submission_deadline timestamptz,
  p_requirements jsonb,
  p_submit boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_duel_id uuid;
  saved_status public.duel_status;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.buyer_profiles bp
    join public.organizations o on o.id = bp.organization_id
    where bp.organization_id = p_buyer_organization_id and o.kind = 'buyer'
      and o.deleted_at is null and public.is_organization_member(bp.organization_id)
  ) then raise exception 'Buyer workspace access required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.software_products sp
    where sp.id = p_current_software_product_id and sp.category_id = p_category_id and sp.is_active
  ) then raise exception 'Current software does not belong to the selected category' using errcode = '23514'; end if;
  if p_submission_deadline is null or p_submission_deadline <= now() then
    raise exception 'Submission deadline must be in the future' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_requirements, '[]'::jsonb)) <> 'array' then
    raise exception 'Requirements must be an array' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) item
    where coalesce(item->>'kind', '') not in ('feature', 'integration')
      or length(trim(coalesce(item->>'label', ''))) not between 1 and 120
  ) then raise exception 'Invalid duel requirement' using errcode = '23514'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) item
    where public.duel_text_disclosure_reason(p_buyer_organization_id, item->>'label') is not null
  ) then
    raise exception 'Duel requirements cannot include contact or company details' using errcode = '23514';
  end if;
  if p_submit and jsonb_array_length(coalesce(p_requirements, '[]'::jsonb)) = 0 then
    raise exception 'At least one requirement is needed before submission' using errcode = '23514';
  end if;

  if p_duel_id is null then
    insert into public.duels (
      buyer_organization_id, created_by, category_id, current_software_product_id,
      current_plan, current_price, billing_frequency, currency, seats,
      approximate_ticket_volume, current_fees, renewal_date, contract_months,
      country_code, company_size, switching_timeline, buyer_intent,
      private_comment, submission_deadline, status
    ) values (
      p_buyer_organization_id, actor_id, p_category_id, p_current_software_product_id,
      nullif(trim(p_current_plan), ''), p_current_price, p_billing_frequency, upper(p_currency), p_seats,
      p_approximate_ticket_volume, coalesce(p_current_fees, 0), p_renewal_date, p_contract_months,
      upper(p_country_code), trim(p_company_size), nullif(trim(p_switching_timeline), ''), p_buyer_intent,
      nullif(trim(p_private_comment), ''), p_submission_deadline, 'draft'
    ) returning id, status into saved_duel_id, saved_status;
  else
    select d.id, d.status into saved_duel_id, saved_status
    from public.duels d
    where d.id = p_duel_id and d.buyer_organization_id = p_buyer_organization_id
      and public.is_organization_member(d.buyer_organization_id)
    for update;
    if saved_duel_id is null then raise exception 'Duel not found' using errcode = 'P0002'; end if;
    if saved_status not in ('draft', 'pending_verification') then
      raise exception 'This duel can no longer be edited' using errcode = '55000';
    end if;
    update public.duels set
      category_id = p_category_id, current_software_product_id = p_current_software_product_id,
      current_plan = nullif(trim(p_current_plan), ''), current_price = p_current_price,
      billing_frequency = p_billing_frequency, currency = upper(p_currency), seats = p_seats,
      approximate_ticket_volume = p_approximate_ticket_volume, current_fees = coalesce(p_current_fees, 0),
      renewal_date = p_renewal_date, contract_months = p_contract_months,
      country_code = upper(p_country_code), company_size = trim(p_company_size),
      switching_timeline = nullif(trim(p_switching_timeline), ''), buyer_intent = p_buyer_intent,
      private_comment = nullif(trim(p_private_comment), ''), submission_deadline = p_submission_deadline
    where id = saved_duel_id;
    delete from public.duel_requirements where duel_id = saved_duel_id;
  end if;

  insert into public.duel_requirements (duel_id, kind, label, is_required)
  select saved_duel_id, (item->>'kind')::public.requirement_kind, trim(item->>'label'),
    coalesce((item->>'is_required')::boolean, true)
  from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) item
  on conflict (duel_id, kind, label) do update set is_required = excluded.is_required;

  if p_submit then
    if exists (
      select 1 from public.buyer_profiles bp
      where bp.organization_id = p_buyer_organization_id and bp.business_email_status = 'verified'
    ) then
      insert into public.duel_verifications (duel_id, verification_type, status, verified_fields, reviewed_at)
      values (saved_duel_id, 'business_email', 'verified', array['business_email'], now())
      on conflict (duel_id, verification_type) do update set status = 'verified',
        verified_fields = array['business_email'], rejection_reason = null, reviewed_at = now();
    end if;
    if saved_status = 'draft' then
      update public.duels set status = 'pending_verification' where id = saved_duel_id;
    end if;
  end if;
  return saved_duel_id;
end;
$$;

revoke all on function public.save_buyer_duel(
  uuid, uuid, uuid, uuid, text, numeric, public.billing_frequency, text,
  integer, integer, numeric, date, integer, text, text, text,
  public.buyer_intent, text, timestamptz, jsonb, boolean
) from public, anon;
grant execute on function public.save_buyer_duel(
  uuid, uuid, uuid, uuid, text, numeric, public.billing_frequency, text,
  integer, integer, numeric, date, integer, text, text, text,
  public.buyer_intent, text, timestamptz, jsonb, boolean
) to authenticated;

comment on function public.duel_text_disclosure_reason(uuid,text)
is 'Server-side detector for contact, domain, social, phone, and buyer-identity disclosure in vendor-visible Duel text.';

commit;
