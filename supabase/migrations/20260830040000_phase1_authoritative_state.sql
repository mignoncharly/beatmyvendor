begin;

-- =============================================================================
-- Phase 1 - Restore authoritative data and state machines
-- Findings: BMV-009, BMV-011, BMV-012, BMV-013, BMV-016, BMV-018, BMV-024,
--           BMV-025, BMV-031. (BMV-024 upload sniffing is enforced in the
--           application layer; this migration covers its storage/retention half.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BMV-031: ISO-backed currency/country allowlists enforced server-side.
-- -----------------------------------------------------------------------------
create or replace function public.is_iso_country(p_code text)
returns boolean language sql immutable set search_path = '' as $$
  select upper(coalesce(p_code, '')) = any (array[
    'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
    'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
    'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
    'DE','DJ','DK','DM','DO','DZ',
    'EC','EE','EG','EH','ER','ES','ET',
    'FI','FJ','FK','FM','FO','FR',
    'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
    'HK','HM','HN','HR','HT','HU',
    'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
    'JE','JM','JO','JP',
    'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
    'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
    'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
    'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ',
    'OM',
    'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
    'QA',
    'RE','RO','RS','RU','RW',
    'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
    'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
    'UA','UG','UM','US','UY','UZ',
    'VA','VC','VE','VG','VI','VN','VU',
    'WF','WS',
    'YE','YT',
    'ZA','ZM','ZW'
  ]);
$$;

create or replace function public.is_supported_currency(p_code text)
returns boolean language sql immutable set search_path = '' as $$
  -- Currencies the marketplace supports for pricing and payment. Deliberately
  -- narrower than the full ISO 4217 list so savings maths stays reliable.
  select upper(coalesce(p_code, '')) = any (array[
    'EUR','USD','GBP','CHF','SEK','NOK','DKK','PLN','CZK','HUF','RON','BGN',
    'CAD','AUD','NZD','JPY','SGD','HKD','AED','ZAR','INR','BRL','MXN','ILS','TRY'
  ]);
$$;

comment on function public.is_iso_country(text) is 'True when the argument is a recognised ISO 3166-1 alpha-2 country code.';
comment on function public.is_supported_currency(text) is 'True when the argument is a marketplace-supported ISO 4217 currency code.';

-- -----------------------------------------------------------------------------
-- BMV-016: Fold recurring extra fees into the authoritative annual-spend baseline.
-- The generated column has no structural dependents (only function bodies and
-- composite-type projections read it by name at runtime), so it can be replaced.
-- -----------------------------------------------------------------------------
alter table public.duels drop column annual_spend;
alter table public.duels add column annual_spend numeric(14,2) generated always as (
  (case when billing_frequency = 'monthly' then current_price * 12 else current_price end) + current_fees
) stored;
comment on column public.duels.annual_spend is
  'Authoritative recurring annual spend: annualised current_price plus recurring current_fees. One-time offer fees are presented separately.';

-- -----------------------------------------------------------------------------
-- BMV-018 / BMV-012: complete offer-version snapshots and a pinned, validity-aware
-- selection.
-- -----------------------------------------------------------------------------
alter table public.selections
  add column if not exists selected_offer_version_id uuid references public.offer_versions(id);
comment on column public.selections.selected_offer_version_id is
  'Immutable offer version accepted at selection time. Billing, introductions, and outcomes read this snapshot, not mutable offer rows.';

-- Snapshot the complete commercial record, including the coverage matrix and notes.
create or replace function public.snapshot_submitted_offer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare next_version integer;
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    select coalesce(max(version_number), 0) + 1 into next_version
    from public.offer_versions where offer_id = new.id;
    insert into public.offer_versions (offer_id, version_number, snapshot, created_by)
    values (
      new.id,
      next_version,
      to_jsonb(new) || jsonb_build_object('features', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'duel_requirement_id', ofe.duel_requirement_id,
          'requirement_label', dr.label,
          'requirement_kind', dr.kind,
          'coverage', ofe.coverage,
          'note', ofe.note
        ) order by dr.label), '[]'::jsonb)
        from public.offer_features ofe
        join public.duel_requirements dr on dr.id = ofe.duel_requirement_id
        where ofe.offer_id = new.id
      )),
      (select auth.uid())
    );
  end if;
  return new;
end;
$$;

-- A selection is only legal for a submitted offer whose validity has not lapsed.
create or replace function public.validate_selection()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.offers o
    join public.duels d on d.id = o.duel_id
    where o.id = new.offer_id
      and o.duel_id = new.duel_id
      and o.status = 'submitted'
      and o.valid_until > now()
      and d.status = 'reviewing'
  ) then
    raise exception 'Only a submitted, non-expired offer for a reviewing duel can be selected' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Finalize statuses, pin the accepted version, and create the introduction.
create or replace function public.finalize_selection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare selected_offer public.offers; selected_duel public.duels;
begin
  select * into selected_offer from public.offers where id = new.offer_id;
  select * into selected_duel from public.duels where id = new.duel_id;

  update public.offers set status = 'selected' where id = new.offer_id;
  update public.offers set status = 'not_selected'
    where duel_id = new.duel_id and id <> new.offer_id and status = 'submitted';
  update public.duels set status = 'selected' where id = new.duel_id;

  update public.selections s set selected_offer_version_id = (
    select ov.id from public.offer_versions ov
    where ov.offer_id = new.offer_id
    order by ov.version_number desc limit 1
  ) where s.id = new.id;

  insert into public.introductions (
    selection_id, buyer_organization_id, vendor_organization_id, status
  ) values (
    new.id, selected_duel.buyer_organization_id, selected_offer.vendor_organization_id, 'awaiting_payment'
  ) on conflict (selection_id) do nothing;
  return new;
end;
$$;

-- Guard the client-callable selection path with the same validity predicate so
-- buyers get a clear error rather than a trigger failure.
create or replace function public.select_buyer_offer(p_duel_id uuid, p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  buyer_organization_id uuid;
  selected_vendor_organization_id uuid;
  saved_selection_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select d.buyer_organization_id, o.vendor_organization_id
    into buyer_organization_id, selected_vendor_organization_id
  from public.duels d
  join public.offers o on o.duel_id = d.id
  where d.id = p_duel_id
    and o.id = p_offer_id
    and d.status = 'reviewing'
    and o.status = 'submitted'
    and o.valid_until > now()
    and public.is_organization_member(d.buyer_organization_id)
  for update of d, o;
  if buyer_organization_id is null then
    if exists (
      select 1 from public.offers o
      where o.id = p_offer_id and o.duel_id = p_duel_id
        and o.status = 'submitted' and o.valid_until <= now()
    ) then
      raise exception 'This offer has expired. Ask the vendor for a refreshed offer before selecting.' using errcode = '55000';
    end if;
    raise exception 'This offer cannot be selected' using errcode = '23514';
  end if;

  insert into public.selections (duel_id, offer_id, selected_by)
  values (p_duel_id, p_offer_id, actor_id)
  returning id into saved_selection_id;

  insert into public.notifications (organization_id, channel, template_key, payload)
  values
    (buyer_organization_id, 'in_app', 'selection_confirmed', jsonb_build_object('duel_id', p_duel_id, 'offer_id', p_offer_id)),
    (selected_vendor_organization_id, 'in_app', 'challenge_selected', jsonb_build_object('duel_id', p_duel_id, 'offer_id', p_offer_id));
  insert into public.notifications (organization_id, channel, template_key, payload)
  select distinct o.vendor_organization_id, 'in_app', 'challenge_not_selected', jsonb_build_object('duel_id', p_duel_id, 'offer_id', o.id)
  from public.offers o
  where o.duel_id = p_duel_id and o.id <> p_offer_id and o.status = 'not_selected';

  return saved_selection_id;
end;
$$;

revoke all on function public.select_buyer_offer(uuid,uuid) from public, anon;
grant execute on function public.select_buyer_offer(uuid,uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- BMV-009: material spend changes invalidate a completed spend verification.
-- -----------------------------------------------------------------------------
create or replace function public.invalidate_spend_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (
    new.current_price is distinct from old.current_price or
    new.current_software_product_id is distinct from old.current_software_product_id or
    new.current_plan is distinct from old.current_plan or
    new.billing_frequency is distinct from old.billing_frequency or
    new.currency is distinct from old.currency or
    new.seats is distinct from old.seats or
    new.current_fees is distinct from old.current_fees or
    new.contract_months is distinct from old.contract_months
  ) then
    update public.duel_verifications
      set status = 'pending', verified_fields = '{}', reviewed_by = null, reviewed_at = null,
          rejection_reason = 'Superseded by a material spend change; re-verification required',
          updated_at = now()
    where duel_id = new.id and verification_type = 'spend' and status in ('verified', 'rejected');
  end if;
  return new;
end;
$$;
drop trigger if exists invalidate_spend_verification_after_update on public.duels;
create trigger invalidate_spend_verification_after_update
after update on public.duels
for each row execute function public.invalidate_spend_verification();

-- -----------------------------------------------------------------------------
-- BMV-011: deal outcomes are written only through a validated, introduction-bound
-- RPC. Direct client writes are revoked; publication/confirmation stays admin-only.
-- -----------------------------------------------------------------------------
drop policy if exists outcomes_buyer_insert on public.deal_outcomes;
drop policy if exists outcomes_buyer_update on public.deal_outcomes;
revoke insert, update, delete on public.deal_outcomes from authenticated;
create policy outcomes_admin_manage on public.deal_outcomes for all to authenticated
  using (public.current_user_is_admin()) with check (public.current_user_is_admin());

alter table public.deal_outcomes
  add constraint deal_outcomes_amount_currency_ck check (
    (outcome in ('selected_vendor', 'another_vendor')) = (final_annual_price is not null)
    and (final_annual_price is null or currency is not null)
  );

create or replace function public.record_deal_outcome(
  p_introduction_id uuid,
  p_outcome public.deal_outcome_kind,
  p_final_annual_price numeric default null,
  p_currency text default null,
  p_contract_months integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  intro public.introductions;
  duel_currency text;
  effective_currency text;
  effective_price numeric := p_final_annual_price;
  saved_outcome_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into intro from public.introductions where id = p_introduction_id;
  if not found then raise exception 'Introduction not found' using errcode = 'P0002'; end if;
  if not public.is_organization_member(intro.buyer_organization_id) then
    raise exception 'Only the introduced buyer can report an outcome' using errcode = '42501';
  end if;
  if intro.status not in ('paid', 'introduced') then
    raise exception 'Outcomes can only be reported for a completed paid introduction' using errcode = '55000';
  end if;

  select d.currency into duel_currency
  from public.duels d
  join public.selections s on s.duel_id = d.id
  where s.id = intro.selection_id;

  if p_outcome in ('selected_vendor', 'another_vendor') then
    if effective_price is null or effective_price <= 0 then
      raise exception 'A final annual price is required for a decided outcome' using errcode = '23514';
    end if;
    effective_currency := upper(coalesce(nullif(trim(p_currency), ''), duel_currency));
    if not public.is_supported_currency(effective_currency) then
      raise exception 'Unsupported outcome currency' using errcode = '23514';
    end if;
  else
    effective_price := null;
    effective_currency := null;
  end if;

  insert into public.deal_outcomes (
    introduction_id, outcome, final_annual_price, currency, contract_months
  ) values (
    p_introduction_id, p_outcome, effective_price, effective_currency,
    case when p_contract_months is not null and p_contract_months > 0 then p_contract_months else null end
  )
  on conflict (introduction_id) do update set
    outcome = excluded.outcome,
    final_annual_price = excluded.final_annual_price,
    currency = excluded.currency,
    contract_months = excluded.contract_months,
    updated_at = now()
  where public.deal_outcomes.confirmed_at is null
  returning id into saved_outcome_id;

  if saved_outcome_id is null then
    raise exception 'A confirmed outcome can no longer be changed' using errcode = '55000';
  end if;
  return saved_outcome_id;
end;
$$;
revoke all on function public.record_deal_outcome(uuid, public.deal_outcome_kind, numeric, text, integer) from public, anon;
grant execute on function public.record_deal_outcome(uuid, public.deal_outcome_kind, numeric, text, integer) to authenticated;
comment on function public.record_deal_outcome(uuid, public.deal_outcome_kind, numeric, text, integer)
  is 'Buyer-reported deal outcome bound to a completed paid introduction. Confirmation and publication remain admin-controlled.';

-- -----------------------------------------------------------------------------
-- BMV-013: authoritative, idempotent deadline maintenance run by the cron worker.
-- -----------------------------------------------------------------------------
create or replace function public.run_marketplace_expiry()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_offers integer := 0;
  advanced_duels integer := 0;
  expired_duels integer := 0;
  duel_row record;
begin
  -- Expire submitted offers whose commercial validity has lapsed and that were
  -- never selected. Only the status changes, so locked terms remain immutable.
  with expired as (
    update public.offers o set status = 'expired'
    where o.status = 'submitted'
      and o.valid_until <= now()
      and not exists (select 1 from public.selections s where s.offer_id = o.id)
    returning o.id
  ) select count(*) into expired_offers from expired;

  -- Advance or close open duels whose submission window has passed.
  for duel_row in
    select d.id, d.buyer_organization_id,
      (select count(*) from public.offers o where o.duel_id = d.id and o.status = 'submitted') as submitted_count
    from public.duels d
    where d.status = 'open'
      and d.submission_deadline is not null
      and d.submission_deadline <= now()
    for update skip locked
  loop
    if duel_row.submitted_count > 0 then
      update public.duels set status = 'reviewing' where id = duel_row.id;
      insert into public.notifications (organization_id, channel, template_key, payload)
      values (duel_row.buyer_organization_id, 'in_app', 'offers_ready',
        jsonb_build_object('duel_id', duel_row.id, 'offer_count', duel_row.submitted_count));
      advanced_duels := advanced_duels + 1;
    else
      update public.duels set status = 'expired', closed_at = now() where id = duel_row.id;
      insert into public.notifications (organization_id, channel, template_key, payload)
      values (duel_row.buyer_organization_id, 'in_app', 'duel_expired',
        jsonb_build_object('duel_id', duel_row.id));
      expired_duels := expired_duels + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'expired_offers', expired_offers,
    'advanced_duels', advanced_duels,
    'expired_duels', expired_duels
  );
end;
$$;
revoke all on function public.run_marketplace_expiry() from public, anon, authenticated;
grant execute on function public.run_marketplace_expiry() to service_role;
comment on function public.run_marketplace_expiry()
  is 'Idempotent deadline maintenance: expires lapsed offers and advances/closes open duels past their submission deadline.';

-- -----------------------------------------------------------------------------
-- BMV-025: submitted spend evidence cannot be deleted by the buyer while a spend
-- verification is pending or verified. Admin retention deletion is unaffected.
-- -----------------------------------------------------------------------------
drop policy if exists verification_files_buyer_delete on storage.objects;
create policy verification_files_buyer_delete on storage.objects for delete to authenticated using (
  bucket_id = 'duel-verifications' and exists (
    select 1 from public.duels d
    where d.id::text = (storage.foldername(name))[2]
      and d.buyer_organization_id::text = (storage.foldername(name))[1]
      and (
        public.current_user_is_admin() or (
          public.is_organization_member(d.buyer_organization_id)
          and not exists (
            select 1 from public.duel_verifications v
            where v.duel_id = d.id and v.verification_type = 'spend'
              and v.status in ('pending', 'verified')
          )
        )
      )
  )
);

-- -----------------------------------------------------------------------------
-- BMV-031: enforce supported currency and ISO country inside the buyer duel RPC.
-- Full re-creation of save_buyer_duel from the Phase 0 definition with the added
-- ISO validation. Anonymity, verification, and requirement handling are unchanged.
-- -----------------------------------------------------------------------------
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
  if not public.is_supported_currency(p_currency) then
    raise exception 'Unsupported currency' using errcode = '23514';
  end if;
  if not public.is_iso_country(p_country_code) then
    raise exception 'Unrecognised country code' using errcode = '23514';
  end if;
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

commit;
