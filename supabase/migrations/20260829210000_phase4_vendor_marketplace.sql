begin;

create or replace function public.get_vendor_opportunity(p_duel_id uuid)
returns setof public.vendor_opportunity
language sql
stable
security definer
set search_path = ''
as $$
  select opportunity.*
  from public.list_vendor_opportunities() opportunity
  where opportunity.duel_id = p_duel_id;
$$;

create or replace function public.get_matching_vendor_products(
  p_duel_id uuid,
  p_vendor_organization_id uuid
)
returns table (id uuid, product_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select vp.id, vp.product_name
  from public.duels d
  join public.vendor_product_replacements vpr
    on vpr.replaces_software_product_id = d.current_software_product_id
  join public.vendor_products vp on vp.id = vpr.vendor_product_id
  where d.id = p_duel_id
    and d.status = 'open'
    and d.submission_deadline > now()
    and vp.vendor_organization_id = p_vendor_organization_id
    and vp.is_active
    and public.is_approved_vendor_member(p_vendor_organization_id);
$$;

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
    contact_name = nullif(trim(p_contact_name), '')
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

create or replace function public.save_vendor_offer(
  p_offer_id uuid,
  p_duel_id uuid,
  p_vendor_organization_id uuid,
  p_vendor_product_id uuid,
  p_plan_name text,
  p_annual_price numeric,
  p_currency text,
  p_seats_included integer,
  p_implementation_fee numeric,
  p_migration_fee numeric,
  p_contract_months integer,
  p_price_lock_months integer,
  p_valid_until timestamptz,
  p_migration_included boolean,
  p_onboarding_included boolean,
  p_support_included text,
  p_limitations text,
  p_commercial_comment text,
  p_feature_coverage jsonb,
  p_accuracy_confirmed boolean,
  p_submit boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_offer_id uuid;
  saved_status public.offer_status;
  requirement_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_approved_vendor_member(p_vendor_organization_id) then
    raise exception 'Approved vendor access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.duels d
    join public.vendor_products vp on vp.id = p_vendor_product_id
    join public.vendor_product_replacements vpr on vpr.vendor_product_id = vp.id
    where d.id = p_duel_id
      and d.status = 'open'
      and d.submission_deadline > now()
      and vp.vendor_organization_id = p_vendor_organization_id
      and vp.is_active
      and vpr.replaces_software_product_id = d.current_software_product_id
  ) then
    raise exception 'This product is not eligible to challenge the duel' using errcode = '23514';
  end if;
  if p_valid_until is null or p_valid_until <= now() then
    raise exception 'Offer validity must end in the future' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_feature_coverage, '[]'::jsonb)) <> 'array' then
    raise exception 'Feature coverage must be an array' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_feature_coverage, '[]'::jsonb)) item
    where coalesce(item->>'coverage', '') not in ('included', 'partial', 'not_included')
      or nullif(item->>'requirement_id', '') is null
  ) then
    raise exception 'Invalid feature coverage' using errcode = '23514';
  end if;

  if p_offer_id is null then
    insert into public.offers (
      duel_id, vendor_organization_id, vendor_product_id, created_by, plan_name,
      annual_price, currency, seats_included, implementation_fee, migration_fee,
      contract_months, price_lock_months, valid_until, migration_included,
      onboarding_included, support_included, limitations, commercial_comment,
      included_features, uncovered_features, status
    ) values (
      p_duel_id, p_vendor_organization_id, p_vendor_product_id, actor_id, trim(p_plan_name),
      p_annual_price, upper(p_currency), p_seats_included, coalesce(p_implementation_fee, 0), coalesce(p_migration_fee, 0),
      p_contract_months, p_price_lock_months, p_valid_until, p_migration_included,
      p_onboarding_included, trim(p_support_included), nullif(trim(p_limitations), ''), nullif(trim(p_commercial_comment), ''),
      '{}'::text[], '{}'::text[], 'draft'
    ) returning id, status into saved_offer_id, saved_status;
  else
    select o.id, o.status into saved_offer_id, saved_status
    from public.offers o
    where o.id = p_offer_id
      and o.duel_id = p_duel_id
      and o.vendor_organization_id = p_vendor_organization_id
      and public.is_organization_member(o.vendor_organization_id)
    for update;
    if saved_offer_id is null then
      raise exception 'Offer not found' using errcode = 'P0002';
    end if;
    if saved_status <> 'draft' then
      raise exception 'A submitted challenge cannot be edited' using errcode = '55000';
    end if;
    update public.offers set
      vendor_product_id = p_vendor_product_id,
      plan_name = trim(p_plan_name),
      annual_price = p_annual_price,
      currency = upper(p_currency),
      seats_included = p_seats_included,
      implementation_fee = coalesce(p_implementation_fee, 0),
      migration_fee = coalesce(p_migration_fee, 0),
      contract_months = p_contract_months,
      price_lock_months = p_price_lock_months,
      valid_until = p_valid_until,
      migration_included = p_migration_included,
      onboarding_included = p_onboarding_included,
      support_included = trim(p_support_included),
      limitations = nullif(trim(p_limitations), ''),
      commercial_comment = nullif(trim(p_commercial_comment), '')
    where id = saved_offer_id;
    delete from public.offer_features where offer_id = saved_offer_id;
  end if;

  insert into public.offer_features (offer_id, duel_requirement_id, coverage, note)
  select saved_offer_id, (item->>'requirement_id')::uuid,
    (item->>'coverage')::public.requirement_coverage, nullif(trim(item->>'note'), '')
  from jsonb_array_elements(coalesce(p_feature_coverage, '[]'::jsonb)) item;

  update public.offers o set
    included_features = coalesce((
      select array_agg(dr.label order by dr.label)
      from public.offer_features ofe
      join public.duel_requirements dr on dr.id = ofe.duel_requirement_id
      where ofe.offer_id = saved_offer_id and ofe.coverage in ('included','partial')
    ), '{}'::text[]),
    uncovered_features = coalesce((
      select array_agg(dr.label order by dr.label)
      from public.offer_features ofe
      join public.duel_requirements dr on dr.id = ofe.duel_requirement_id
      where ofe.offer_id = saved_offer_id and ofe.coverage = 'not_included'
    ), '{}'::text[])
  where o.id = saved_offer_id;

  if p_submit then
    select count(*) into requirement_count from public.duel_requirements where duel_id = p_duel_id;
    if (select count(*) from public.offer_features where offer_id = saved_offer_id) <> requirement_count then
      raise exception 'Every requirement needs a coverage answer' using errcode = '23514';
    end if;
    if not coalesce(p_accuracy_confirmed, false) then
      raise exception 'Offer accuracy confirmation is required' using errcode = '23514';
    end if;
    update public.offers set accuracy_confirmed_at = now(), status = 'submitted'
    where id = saved_offer_id;

    insert into public.notifications (organization_id, channel, template_key, payload)
    select d.buyer_organization_id, 'in_app', 'new_challenge_received',
      jsonb_build_object('duel_id', d.id, 'offer_id', saved_offer_id)
    from public.duels d where d.id = p_duel_id;
    insert into public.notifications (organization_id, channel, template_key, payload)
    values (p_vendor_organization_id, 'in_app', 'challenge_submitted', jsonb_build_object('duel_id', p_duel_id, 'offer_id', saved_offer_id));
  end if;

  return saved_offer_id;
end;
$$;

revoke execute on function public.list_vendor_opportunities() from anon;
revoke all on function public.get_vendor_opportunity(uuid) from public, anon;
revoke all on function public.get_matching_vendor_products(uuid,uuid) from public, anon;
revoke all on function public.configure_vendor_marketplace(uuid,text,text,text,text,integer,integer,text[],text[],boolean,text,uuid,text,text,uuid[]) from public, anon;
revoke all on function public.save_vendor_offer(uuid,uuid,uuid,uuid,text,numeric,text,integer,numeric,numeric,integer,integer,timestamptz,boolean,boolean,text,text,text,jsonb,boolean,boolean) from public, anon;
grant execute on function public.get_vendor_opportunity(uuid) to authenticated;
grant execute on function public.get_matching_vendor_products(uuid,uuid) to authenticated;
grant execute on function public.configure_vendor_marketplace(uuid,text,text,text,text,integer,integer,text[],text[],boolean,text,uuid,text,text,uuid[]) to authenticated;
grant execute on function public.save_vendor_offer(uuid,uuid,uuid,uuid,text,numeric,text,integer,numeric,numeric,integer,integer,timestamptz,boolean,boolean,text,text,text,jsonb,boolean,boolean) to authenticated;

comment on function public.save_vendor_offer(uuid,uuid,uuid,uuid,text,numeric,text,integer,numeric,numeric,integer,integer,timestamptz,boolean,boolean,text,text,text,jsonb,boolean,boolean)
is 'Atomically saves a vendor challenge, coverage matrix, immutable submission snapshot, and notifications.';

commit;
