begin;

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
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.buyer_profiles bp
    join public.organizations o on o.id = bp.organization_id
    where bp.organization_id = p_buyer_organization_id
      and o.kind = 'buyer'
      and o.deleted_at is null
      and public.is_organization_member(bp.organization_id)
  ) then
    raise exception 'Buyer workspace access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.software_products sp
    where sp.id = p_current_software_product_id
      and sp.category_id = p_category_id
      and sp.is_active
  ) then
    raise exception 'Current software does not belong to the selected category' using errcode = '23514';
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
  ) then
    raise exception 'Invalid duel requirement' using errcode = '23514';
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
    where d.id = p_duel_id
      and d.buyer_organization_id = p_buyer_organization_id
      and public.is_organization_member(d.buyer_organization_id)
    for update;

    if saved_duel_id is null then
      raise exception 'Duel not found' using errcode = 'P0002';
    end if;
    if saved_status not in ('draft', 'pending_verification') then
      raise exception 'This duel can no longer be edited' using errcode = '55000';
    end if;

    update public.duels set
      category_id = p_category_id,
      current_software_product_id = p_current_software_product_id,
      current_plan = nullif(trim(p_current_plan), ''),
      current_price = p_current_price,
      billing_frequency = p_billing_frequency,
      currency = upper(p_currency),
      seats = p_seats,
      approximate_ticket_volume = p_approximate_ticket_volume,
      current_fees = coalesce(p_current_fees, 0),
      renewal_date = p_renewal_date,
      contract_months = p_contract_months,
      country_code = upper(p_country_code),
      company_size = trim(p_company_size),
      switching_timeline = nullif(trim(p_switching_timeline), ''),
      buyer_intent = p_buyer_intent,
      private_comment = nullif(trim(p_private_comment), ''),
      submission_deadline = p_submission_deadline
    where id = saved_duel_id;

    delete from public.duel_requirements where duel_id = saved_duel_id;
  end if;

  insert into public.duel_requirements (duel_id, kind, label, is_required)
  select
    saved_duel_id,
    (item->>'kind')::public.requirement_kind,
    trim(item->>'label'),
    coalesce((item->>'is_required')::boolean, true)
  from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) item
  on conflict (duel_id, kind, label) do update set is_required = excluded.is_required;

  if p_submit then
    if exists (
      select 1 from public.buyer_profiles bp
      where bp.organization_id = p_buyer_organization_id
        and bp.business_email_status = 'verified'
    ) then
      insert into public.duel_verifications (
        duel_id, verification_type, status, verified_fields, reviewed_at
      ) values (
        saved_duel_id, 'business_email', 'verified', array['business_email'], now()
      )
      on conflict (duel_id, verification_type) do update set
        status = 'verified',
        verified_fields = array['business_email'],
        rejection_reason = null,
        reviewed_at = now();
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
) from public;
grant execute on function public.save_buyer_duel(
  uuid, uuid, uuid, uuid, text, numeric, public.billing_frequency, text,
  integer, integer, numeric, date, integer, text, text, text,
  public.buyer_intent, text, timestamptz, jsonb, boolean
) to authenticated;

comment on function public.save_buyer_duel(
  uuid, uuid, uuid, uuid, text, numeric, public.billing_frequency, text,
  integer, integer, numeric, date, integer, text, text, text,
  public.buyer_intent, text, timestamptz, jsonb, boolean
) is 'Atomically creates or edits a buyer duel and its requirements, with optional submission for verification.';

commit;
