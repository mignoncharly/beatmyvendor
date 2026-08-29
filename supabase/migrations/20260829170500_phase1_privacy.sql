begin;

drop policy vendor_profiles_party_read on public.vendor_profiles;
create policy vendor_profiles_party_read on public.vendor_profiles for select to authenticated using (
  public.is_organization_member(organization_id) or
  public.current_user_is_admin() or
  exists (
    select 1 from public.introductions i
    where i.vendor_organization_id = organization_id
      and i.status in ('paid','introduced')
      and public.is_organization_member(i.buyer_organization_id)
  )
);

create type public.vendor_directory_entry as (
  organization_id uuid,
  name text,
  slug text,
  website_url text,
  description text,
  logo_path text,
  countries_served text[],
  currencies text[],
  migration_support boolean
);

create or replace function public.list_vendor_directory()
returns setof public.vendor_directory_entry
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id, o.name, o.slug, o.website_url, vp.description, vp.logo_path,
    vp.countries_served, vp.currencies, vp.migration_support
  from public.organizations o
  join public.vendor_profiles vp on vp.organization_id = o.id
  where o.deleted_at is null and vp.approval_status = 'approved'
  order by o.name;
$$;

revoke all on function public.list_vendor_directory() from public;
grant execute on function public.list_vendor_directory() to anon, authenticated;
comment on function public.list_vendor_directory() is 'Safe public vendor projection. Contact names and email addresses are deliberately excluded.';

commit;
