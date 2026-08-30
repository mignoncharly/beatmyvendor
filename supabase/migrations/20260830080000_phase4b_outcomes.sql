begin;

-- =============================================================================
-- Phase 4B - Post-introduction outcome and public-win workflow
-- Findings: BMV-010 (outcome report -> counterpart response -> admin verify),
--           BMV-038 (consent-gated, admin-published wins).
-- All writes flow through validated, introduction-bound, security-definer RPCs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Outcome state: buyer reports, the vendor confirms or disputes, an admin
-- verifies. confirmed_at is set only on admin verification and remains the
-- single signal consumed by dashboards, metrics, and public wins.
-- -----------------------------------------------------------------------------
alter table public.deal_outcomes
  add column if not exists reported_by uuid references public.users(id),
  add column if not exists vendor_response text not null default 'pending'
    check (vendor_response in ('pending', 'confirmed', 'disputed')),
  add column if not exists vendor_responded_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.users(id);

alter table public.public_wins
  add column if not exists revoked_at timestamptz;

-- Buyer reports (or re-reports) the outcome. Re-reporting resets the vendor
-- response and any prior verification so the loop restarts cleanly.
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
    introduction_id, outcome, final_annual_price, currency, contract_months, reported_by, vendor_response
  ) values (
    p_introduction_id, p_outcome, effective_price, effective_currency,
    case when p_contract_months is not null and p_contract_months > 0 then p_contract_months else null end,
    actor_id, 'pending'
  )
  on conflict (introduction_id) do update set
    outcome = excluded.outcome,
    final_annual_price = excluded.final_annual_price,
    currency = excluded.currency,
    contract_months = excluded.contract_months,
    reported_by = actor_id,
    vendor_response = 'pending',
    vendor_responded_at = null,
    verified_at = null,
    verified_by = null,
    updated_at = now()
  where public.deal_outcomes.confirmed_at is null
  returning id into saved_outcome_id;

  if saved_outcome_id is null then
    raise exception 'A confirmed outcome can no longer be changed' using errcode = '55000';
  end if;

  insert into public.notifications (organization_id, channel, template_key, payload)
  values (intro.vendor_organization_id, 'in_app', 'deal_confirmation',
    jsonb_build_object('introduction_id', p_introduction_id, 'role', 'vendor'));
  return saved_outcome_id;
end;
$$;
revoke all on function public.record_deal_outcome(uuid, public.deal_outcome_kind, numeric, text, integer) from public, anon;
grant execute on function public.record_deal_outcome(uuid, public.deal_outcome_kind, numeric, text, integer) to authenticated;

-- Vendor confirms or disputes the buyer-reported outcome.
create or replace function public.respond_to_deal_outcome(p_introduction_id uuid, p_agree boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  intro public.introductions;
  outcome_row public.deal_outcomes;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into intro from public.introductions where id = p_introduction_id;
  if not found then raise exception 'Introduction not found' using errcode = 'P0002'; end if;
  if not public.is_organization_member(intro.vendor_organization_id) then
    raise exception 'Only the introduced vendor can respond to an outcome' using errcode = '42501';
  end if;
  select * into outcome_row from public.deal_outcomes where introduction_id = p_introduction_id for update;
  if not found then raise exception 'The buyer has not reported an outcome yet' using errcode = 'P0002'; end if;
  if outcome_row.confirmed_at is not null then
    raise exception 'A verified outcome can no longer be changed' using errcode = '55000';
  end if;

  update public.deal_outcomes set
    vendor_response = case when p_agree then 'confirmed' else 'disputed' end,
    vendor_responded_at = now(),
    updated_at = now()
  where id = outcome_row.id;

  insert into public.notifications (organization_id, channel, template_key, payload)
  values (intro.buyer_organization_id, 'in_app', 'deal_confirmation',
    jsonb_build_object('introduction_id', p_introduction_id, 'role', 'buyer'));
  return outcome_row.id;
end;
$$;
revoke all on function public.respond_to_deal_outcome(uuid, boolean) from public, anon;
grant execute on function public.respond_to_deal_outcome(uuid, boolean) to authenticated;

-- Admin verifies (finalises) or rejects the reported outcome. Verification
-- requires the vendor to have confirmed, and stamps confirmed_at.
create or replace function public.admin_verify_deal_outcome(p_outcome_id uuid, p_verified boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.assert_admin();
  outcome_row public.deal_outcomes;
begin
  select * into outcome_row from public.deal_outcomes where id = p_outcome_id for update;
  if not found then raise exception 'Outcome not found' using errcode = 'P0002'; end if;

  if p_verified then
    if outcome_row.vendor_response <> 'confirmed' then
      raise exception 'The vendor must confirm the outcome before verification' using errcode = '55000';
    end if;
    update public.deal_outcomes set verified_at = now(), verified_by = actor, confirmed_at = now(), updated_at = now()
    where id = p_outcome_id;
  else
    update public.deal_outcomes set verified_at = null, verified_by = null, confirmed_at = null, updated_at = now()
    where id = p_outcome_id;
  end if;

  insert into public.admin_actions (admin_user_id, action, target_type, target_id, reason, metadata)
  values (actor, case when p_verified then 'outcome_verified' else 'outcome_rejected' end, 'deal_outcome', p_outcome_id,
    nullif(trim(p_reason), ''), '{}'::jsonb);
end;
$$;
revoke all on function public.admin_verify_deal_outcome(uuid, boolean, text) from public, anon;
grant execute on function public.admin_verify_deal_outcome(uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- BMV-038: publication consent. A verified saving is required, each party
-- consents separately with their own display name, and only an admin publishes.
-- -----------------------------------------------------------------------------
create or replace function public.consent_public_win(p_introduction_id uuid, p_display_name text, p_consent boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  intro public.introductions;
  outcome_row public.deal_outcomes;
  duel_spend numeric;
  is_buyer boolean;
  is_vendor boolean;
  win_id uuid;
  new_slug text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into intro from public.introductions where id = p_introduction_id;
  if not found then raise exception 'Introduction not found' using errcode = 'P0002'; end if;
  is_buyer := public.is_organization_member(intro.buyer_organization_id);
  is_vendor := public.is_organization_member(intro.vendor_organization_id);
  if not (is_buyer or is_vendor) then
    raise exception 'Only an introduced party can consent to publication' using errcode = '42501';
  end if;

  select * into outcome_row from public.deal_outcomes where introduction_id = p_introduction_id;
  if not found or outcome_row.confirmed_at is null then
    raise exception 'The outcome must be verified before it can be published' using errcode = '55000';
  end if;
  select d.annual_spend into duel_spend
  from public.selections s join public.duels d on d.id = s.duel_id
  where s.id = intro.selection_id;
  if outcome_row.final_annual_price is null or outcome_row.final_annual_price >= duel_spend then
    raise exception 'Only a confirmed saving can become a public win' using errcode = '23514';
  end if;

  if p_consent and length(trim(coalesce(p_display_name, ''))) < 2 then
    raise exception 'A display name is required to consent to publication' using errcode = '23514';
  end if;

  if is_buyer then
    if p_consent then
      new_slug := left(regexp_replace(lower(trim(p_display_name)), '[^a-z0-9]+', '-', 'g'), 40);
      new_slug := trim(both '-' from new_slug);
      new_slug := coalesce(nullif(new_slug, ''), 'win') || '-' || substr(replace(outcome_row.id::text, '-', ''), 1, 8);
      insert into public.public_wins (deal_outcome_id, slug, buyer_display_name, buyer_consented_at)
      values (outcome_row.id, new_slug, trim(p_display_name), now())
      on conflict (deal_outcome_id) do update set
        buyer_display_name = excluded.buyer_display_name, buyer_consented_at = now(), revoked_at = null
      returning id into win_id;
    else
      update public.public_wins set revoked_at = now(), published_at = null where deal_outcome_id = outcome_row.id
      returning id into win_id;
    end if;
  else
    if p_consent then
      update public.public_wins set vendor_display_name = trim(p_display_name), vendor_consented_at = now()
      where deal_outcome_id = outcome_row.id returning id into win_id;
      if win_id is null then raise exception 'The buyer must consent to publication first' using errcode = '55000'; end if;
    else
      update public.public_wins set vendor_display_name = null, vendor_consented_at = null
      where deal_outcome_id = outcome_row.id returning id into win_id;
    end if;
  end if;
  return win_id;
end;
$$;
revoke all on function public.consent_public_win(uuid, text, boolean) from public, anon;
grant execute on function public.consent_public_win(uuid, text, boolean) to authenticated;

create or replace function public.admin_publish_win(p_win_id uuid, p_publish boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.assert_admin();
  win_row public.public_wins;
  outcome_confirmed timestamptz;
begin
  select * into win_row from public.public_wins where id = p_win_id for update;
  if not found then raise exception 'Win not found' using errcode = 'P0002'; end if;
  if p_publish then
    select confirmed_at into outcome_confirmed from public.deal_outcomes where id = win_row.deal_outcome_id;
    if outcome_confirmed is null or win_row.buyer_consented_at is null or win_row.revoked_at is not null then
      raise exception 'A win needs a verified outcome and current buyer consent to publish' using errcode = '55000';
    end if;
    update public.public_wins set published_at = now() where id = p_win_id;
  else
    update public.public_wins set published_at = null where id = p_win_id;
  end if;
  insert into public.admin_actions (admin_user_id, action, target_type, target_id, reason, metadata)
  values (actor, case when p_publish then 'win_published' else 'win_unpublished' end, 'public_win', p_win_id,
    nullif(trim(p_reason), ''), '{}'::jsonb);
end;
$$;
revoke all on function public.admin_publish_win(uuid, boolean, text) from public, anon;
grant execute on function public.admin_publish_win(uuid, boolean, text) to authenticated;

-- Published wins must still be backed by current buyer consent (not revoked).
drop policy if exists wins_public_read on public.public_wins;
create policy wins_public_read on public.public_wins for select to anon, authenticated using (
  (published_at is not null and revoked_at is null) or public.current_user_is_admin()
);

-- Introduced parties can read their own win row (including drafts) to manage consent.
drop policy if exists wins_party_read on public.public_wins;
create policy wins_party_read on public.public_wins for select to authenticated using (
  exists (
    select 1 from public.deal_outcomes o
    join public.introductions i on i.id = o.introduction_id
    where o.id = deal_outcome_id
      and (public.is_organization_member(i.buyer_organization_id) or public.is_organization_member(i.vendor_organization_id))
  )
);

commit;
