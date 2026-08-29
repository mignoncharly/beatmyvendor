begin;

create type public.public_duel_listing as (
  public_id bigint, slug text, category_name text, current_software_name text,
  annual_spend numeric, currency text, seats integer, country_code text,
  company_size text, buyer_intent public.buyer_intent, submission_deadline timestamptz,
  verification_badge text
);

create or replace function public.list_public_duels()
returns setof public.public_duel_listing language sql stable security definer set search_path = '' as $$
  select d.public_id, d.slug, c.name, sp.name, d.annual_spend, d.currency, d.seats,
    d.country_code, d.company_size, d.buyer_intent, d.submission_deadline,
    case when exists (select 1 from public.duel_verifications v where v.duel_id=d.id and v.verification_type='spend' and v.status='verified') then 'verified_spend'
         when exists (select 1 from public.duel_verifications v where v.duel_id=d.id and v.verification_type='business_email' and v.status='verified') then 'business_verified' end
  from public.duels d
  join public.categories c on c.id=d.category_id
  join public.software_products sp on sp.id=d.current_software_product_id
  where d.status='open' and d.published_at is not null and d.submission_deadline > now() and d.slug is not null
  order by d.published_at desc;
$$;

create type public.public_win_listing as (
  slug text, buyer_display_name text, vendor_display_name text,
  current_software_name text, challenger_software_name text,
  current_annual_price numeric, final_annual_price numeric, currency text,
  seats integer, country_code text, confirmed_at timestamptz
);

create or replace function public.list_public_wins()
returns setof public.public_win_listing language sql stable security definer set search_path = '' as $$
  select pw.slug, pw.buyer_display_name,
    case when pw.vendor_consented_at is not null then pw.vendor_display_name end,
    current_product.name, challenger_product.name, d.annual_spend, outcome.final_annual_price,
    outcome.currency, d.seats, d.country_code, outcome.confirmed_at
  from public.public_wins pw
  join public.deal_outcomes outcome on outcome.id=pw.deal_outcome_id
  join public.introductions intro on intro.id=outcome.introduction_id
  join public.selections selection on selection.id=intro.selection_id
  join public.duels d on d.id=selection.duel_id
  join public.software_products current_product on current_product.id=d.current_software_product_id
  join public.offers offer on offer.id=selection.offer_id
  join public.vendor_products vendor_product on vendor_product.id=offer.vendor_product_id
  join public.software_products challenger_product on challenger_product.id=vendor_product.software_product_id
  where pw.published_at is not null and outcome.confirmed_at is not null
    and outcome.final_annual_price is not null and outcome.final_annual_price < d.annual_spend
  order by pw.published_at desc;
$$;

revoke all on function public.list_public_duels() from public;
revoke all on function public.list_public_wins() from public;
grant execute on function public.list_public_duels() to anon, authenticated;
grant execute on function public.list_public_wins() to anon, authenticated;

comment on function public.list_public_duels() is 'Anonymous public projection; deliberately excludes buyer identity, comments, requirements, and verification documents.';
comment on function public.list_public_wins() is 'Consent-gated confirmed savings projection. Vendor identity is returned only after explicit vendor consent.';

commit;
