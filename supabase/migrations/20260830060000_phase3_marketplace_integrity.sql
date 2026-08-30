begin;

-- =============================================================================
-- Phase 3 - Marketplace integrity, verification, matching, and administration
-- Findings: BMV-008 (admin evidence review), BMV-014 (rate limiting),
--           BMV-017 (capability matching), BMV-022 (server pagination),
--           BMV-023 (admin evidence/reconciliation tooling).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BMV-014: Postgres-backed fixed-window rate limiter. Called server-side via the
-- service role; returns true when the request is within the limit.
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limit_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
create index if not exists rate_limit_hits_window_idx on public.rate_limit_hits(window_start);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;
comment on table public.rate_limit_hits is 'Fixed-window request counters for server-side abuse controls; not client-readable.';

create or replace function public.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz;
  current_hits integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 or p_bucket is null then return true; end if;
  win := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_hits (bucket, window_start, hits)
  values (p_bucket, win, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limit_hits.hits + 1
  returning hits into current_hits;
  -- Opportunistic cleanup so the table cannot grow unbounded.
  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  end if;
  return current_hits <= p_limit;
end;
$$;
revoke all on function public.check_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text,integer,integer) to service_role;
comment on function public.check_rate_limit(text,integer,integer)
  is 'Atomic fixed-window rate limiter. Returns false once the bucket exceeds the limit within the window.';

-- -----------------------------------------------------------------------------
-- BMV-017 / BMV-022: capability-aware, indexed, keyset-paginated matching that
-- applies the vendor''s declared geography, currency, and customer-size envelope,
-- and returns the matched product as the match reason.
-- -----------------------------------------------------------------------------
create type public.vendor_opportunity_match as (
  duel_id uuid,
  public_id bigint,
  slug text,
  category_name text,
  current_software text,
  annual_spend numeric,
  currency text,
  seats integer,
  country_code text,
  company_size text,
  renewal_date date,
  buyer_intent public.buyer_intent,
  submission_deadline timestamptz,
  verification_badge text,
  matched_product_id uuid,
  matched_product_name text
);

create or replace function public.match_vendor_opportunities(
  p_vendor_organization_id uuid,
  p_software text default null,
  p_country text default null,
  p_intent text default null,
  p_verified boolean default false,
  p_min_spend numeric default null,
  p_after_deadline timestamptz default null,
  p_after_duel_id uuid default null,
  p_limit integer default 24
)
returns setof public.vendor_opportunity_match
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  vprofile public.vendor_profiles;
  eff_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.is_approved_vendor_member(p_vendor_organization_id) then
    raise exception 'Approved vendor access required' using errcode = '42501';
  end if;
  select * into vprofile from public.vendor_profiles where organization_id = p_vendor_organization_id;

  return query
  select d.id, d.public_id, d.slug, c.name, sp.name, d.annual_spend, d.currency,
    d.seats, d.country_code, d.company_size, d.renewal_date, d.buyer_intent, d.submission_deadline,
    case
      when exists (select 1 from public.duel_verifications v where v.duel_id = d.id and v.verification_type = 'spend' and v.status = 'verified') then 'verified_spend'
      when exists (select 1 from public.duel_verifications v where v.duel_id = d.id and v.verification_type = 'business_email' and v.status = 'verified') then 'business_verified'
      else null
    end,
    m.vendor_product_id, m.product_name
  from public.duels d
  join public.categories c on c.id = d.category_id
  join public.software_products sp on sp.id = d.current_software_product_id
  join lateral (
    select vp.id as vendor_product_id, vp.product_name
    from public.vendor_products vp
    join public.vendor_product_replacements vpr on vpr.vendor_product_id = vp.id
    where vp.vendor_organization_id = p_vendor_organization_id
      and vp.is_active
      and vpr.replaces_software_product_id = d.current_software_product_id
    order by vp.product_name
    limit 1
  ) m on true
  where d.status = 'open'
    and d.submission_deadline > now()
    -- Declared capability envelope (empty/null => no constraint).
    and (coalesce(array_length(vprofile.countries_served, 1), 0) = 0 or d.country_code = any (vprofile.countries_served))
    and (coalesce(array_length(vprofile.currencies, 1), 0) = 0 or d.currency = any (vprofile.currencies))
    and (vprofile.minimum_customer_size is null
         or nullif(regexp_replace(d.company_size, '[^0-9].*$', ''), '') is null
         or nullif(regexp_replace(d.company_size, '[^0-9].*$', ''), '')::integer >= vprofile.minimum_customer_size)
    and (vprofile.maximum_customer_size is null
         or nullif(regexp_replace(d.company_size, '[^0-9].*$', ''), '') is null
         or nullif(regexp_replace(d.company_size, '[^0-9].*$', ''), '')::integer <= vprofile.maximum_customer_size)
    -- Optional caller filters.
    and (p_software is null or sp.name ilike '%' || p_software || '%')
    and (p_country is null or d.country_code = upper(p_country))
    and (p_intent is null or d.buyer_intent::text = p_intent)
    and (not coalesce(p_verified, false) or exists (select 1 from public.duel_verifications v where v.duel_id = d.id and v.status = 'verified'))
    and (p_min_spend is null or d.annual_spend >= p_min_spend)
    -- Keyset pagination.
    and (p_after_deadline is null or d.submission_deadline > p_after_deadline
         or (d.submission_deadline = p_after_deadline and d.id > p_after_duel_id))
  order by d.submission_deadline, d.id
  limit eff_limit;
end;
$$;
revoke all on function public.match_vendor_opportunities(uuid,text,text,text,boolean,numeric,timestamptz,uuid,integer) from public, anon;
grant execute on function public.match_vendor_opportunities(uuid,text,text,text,boolean,numeric,timestamptz,uuid,integer) to authenticated;
comment on function public.match_vendor_opportunities(uuid,text,text,text,boolean,numeric,timestamptz,uuid,integer)
  is 'Capability-aware, keyset-paginated opportunity matching for an approved vendor. Buyer identity is never projected.';

-- Idempotent opportunity notifications when a duel opens to the marketplace.
create or replace function public.notify_matching_vendors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open' and old.status is distinct from 'open' then
    insert into public.notifications (organization_id, channel, template_key, payload)
    select distinct vp.organization_id, 'in_app', 'new_opportunity', jsonb_build_object('duel_id', new.id)
    from public.vendor_products vprod
    join public.vendor_product_replacements vpr on vpr.vendor_product_id = vprod.id
    join public.vendor_profiles vp on vp.organization_id = vprod.vendor_organization_id
    where vpr.replaces_software_product_id = new.current_software_product_id
      and vprod.is_active
      and vp.approval_status = 'approved'
      and not exists (
        select 1 from public.notifications n
        where n.organization_id = vprod.vendor_organization_id
          and n.template_key = 'new_opportunity'
          and n.payload->>'duel_id' = new.id::text
      );
  end if;
  return new;
end;
$$;
drop trigger if exists notify_matching_vendors_after_open on public.duels;
create trigger notify_matching_vendors_after_open
after update of status on public.duels
for each row execute function public.notify_matching_vendors();

-- -----------------------------------------------------------------------------
-- BMV-008 / BMV-023: admin-authorized read of the evidence attached to a
-- verification. Short-lived signed URLs are minted in the server action.
-- -----------------------------------------------------------------------------
create or replace function public.admin_verification_documents(p_verification_id uuid)
returns table (
  id uuid,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  created_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
  select dd.id, dd.original_filename, dd.mime_type, dd.size_bytes, dd.storage_path, dd.created_at, dd.deleted_at
  from public.duel_documents dd
  join public.duel_verifications v on v.duel_id = dd.duel_id
  where v.id = p_verification_id
  order by dd.created_at desc;
end;
$$;
revoke all on function public.admin_verification_documents(uuid) from public, anon;
grant execute on function public.admin_verification_documents(uuid) to authenticated;
comment on function public.admin_verification_documents(uuid)
  is 'Admin-only listing of the spend-evidence documents attached to a verification for review.';

commit;
