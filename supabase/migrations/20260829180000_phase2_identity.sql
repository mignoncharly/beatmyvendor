begin;

create table public.blocked_email_domains (
  domain extensions.citext primary key,
  reason text not null default 'consumer_or_disposable',
  created_at timestamptz not null default now()
);

insert into public.blocked_email_domains (domain, reason) values
  ('gmail.com', 'consumer'),
  ('googlemail.com', 'consumer'),
  ('yahoo.com', 'consumer'),
  ('outlook.com', 'consumer'),
  ('hotmail.com', 'consumer'),
  ('live.com', 'consumer'),
  ('icloud.com', 'consumer'),
  ('aol.com', 'consumer'),
  ('proton.me', 'consumer'),
  ('protonmail.com', 'consumer'),
  ('mailinator.com', 'disposable'),
  ('guerrillamail.com', 'disposable'),
  ('10minutemail.com', 'disposable')
on conflict (domain) do nothing;

alter table public.blocked_email_domains enable row level security;
create policy blocked_domains_admin_read on public.blocked_email_domains
for select to authenticated using (public.current_user_is_admin());
create policy blocked_domains_admin_manage on public.blocked_email_domains
for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

create or replace function public.is_business_email(candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$'
    and not exists (
      select 1 from public.blocked_email_domains b
      where lower(b.domain::text) = lower(split_part(candidate_email, '@', 2))
    );
$$;

create or replace function public.onboard_organization(
  organization_kind public.organization_kind,
  organization_name text,
  organization_slug text,
  contact_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text;
  auth_email_confirmed_at timestamptz;
  organization_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(trim(organization_name)) not between 2 and 160 then
    raise exception 'Organization name must contain 2 to 160 characters' using errcode = '23514';
  end if;
  if organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid organization slug' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = actor_id and o.kind = organization_kind and o.deleted_at is null
  ) then
    raise exception 'User already belongs to this organization type' using errcode = '23505';
  end if;

  select au.email, au.email_confirmed_at
    into actor_email, auth_email_confirmed_at
  from auth.users au where au.id = actor_id;

  insert into public.organizations (kind, name, slug, created_by)
  values (organization_kind, trim(organization_name), organization_slug, actor_id)
  returning id into organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (organization_id, actor_id, 'owner');

  if organization_kind = 'buyer' then
    insert into public.buyer_profiles (
      organization_id, business_email_status, business_email_verified_at,
      contact_name, contact_email
    ) values (
      organization_id,
      case when auth_email_confirmed_at is not null and public.is_business_email(actor_email)
        then 'verified'::public.verification_status else 'rejected'::public.verification_status end,
      case when auth_email_confirmed_at is not null and public.is_business_email(actor_email)
        then now() else null end,
      nullif(trim(contact_name), ''), actor_email
    );
  else
    insert into public.vendor_profiles (
      organization_id, approval_status, contact_name, contact_email
    ) values (
      organization_id, 'pending', nullif(trim(contact_name), ''), actor_email
    );
  end if;

  return organization_id;
end;
$$;

revoke all on function public.is_business_email(text) from public;
revoke all on function public.onboard_organization(public.organization_kind, text, text, text) from public;
grant execute on function public.is_business_email(text) to authenticated;
grant execute on function public.onboard_organization(public.organization_kind, text, text, text) to authenticated;

create or replace function public.protect_membership_owners()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.role = 'owner' and not exists (
    select 1 from public.organization_members om
    where om.organization_id = old.organization_id
      and om.user_id <> old.user_id
      and om.role = 'owner'
  ) then
    raise exception 'Transfer ownership before removing the final owner' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' and not exists (
    select 1 from public.organization_members om
    where om.organization_id = old.organization_id
      and om.user_id <> old.user_id
      and om.role = 'owner'
  ) then
    raise exception 'An organization must retain an owner' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger protect_final_organization_owner
before update or delete on public.organization_members
for each row execute function public.protect_membership_owners();

comment on function public.onboard_organization(public.organization_kind, text, text, text)
is 'Atomically creates one buyer or vendor organization, its owner membership, and the matching profile.';
comment on table public.blocked_email_domains
is 'Conservative launch blocklist for business-email verification; expand with a maintained disposable-domain source.';

commit;
