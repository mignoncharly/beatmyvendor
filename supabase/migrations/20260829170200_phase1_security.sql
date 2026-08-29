begin;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.system_role = 'admin'
      and u.suspended_at is null
  );
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members om
    join public.users u on u.id = om.user_id
    where om.organization_id = target_organization_id
      and om.user_id = (select auth.uid())
      and u.suspended_at is null
  );
$$;

create or replace function public.has_organization_role(
  target_organization_id uuid,
  accepted_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members om
    join public.users u on u.id = om.user_id
    where om.organization_id = target_organization_id
      and om.user_id = (select auth.uid())
      and om.role = any(accepted_roles)
      and u.suspended_at is null
  );
$$;

create or replace function public.is_approved_vendor_member(target_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.vendor_profiles vp on vp.organization_id = om.organization_id
    join public.users u on u.id = om.user_id
    where om.user_id = (select auth.uid())
      and (target_organization_id is null or om.organization_id = target_organization_id)
      and vp.approval_status = 'approved'
      and u.suspended_at is null
  );
$$;

revoke all on function public.current_user_is_admin() from public;
revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.has_organization_role(uuid, public.membership_role[]) from public;
revoke all on function public.is_approved_vendor_member(uuid) from public;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, public.membership_role[]) to authenticated;
grant execute on function public.is_approved_vendor_member(uuid) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, display_name, locale)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    case when new.raw_user_meta_data ->> 'locale' in ('en', 'fr', 'de')
      then new.raw_user_meta_data ->> 'locale' else 'en' end
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users', 'organizations', 'buyer_profiles', 'vendor_profiles', 'software_products',
    'duels', 'duel_verifications', 'offers', 'payments', 'introductions', 'deal_outcomes'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

create or replace function public.validate_profile_organization_kind()
returns trigger language plpgsql set search_path = '' as $$
declare expected_kind public.organization_kind;
begin
  expected_kind := case tg_table_name
    when 'buyer_profiles' then 'buyer'::public.organization_kind
    else 'vendor'::public.organization_kind
  end;
  if not exists (
    select 1 from public.organizations o
    where o.id = new.organization_id and o.kind = expected_kind and o.deleted_at is null
  ) then
    raise exception '% requires a % organization', tg_table_name, expected_kind using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_buyer_profile_kind before insert or update on public.buyer_profiles
for each row execute function public.validate_profile_organization_kind();
create trigger validate_vendor_profile_kind before insert or update on public.vendor_profiles
for each row execute function public.validate_profile_organization_kind();

create or replace function public.validate_duel_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if not (
    (old.status = 'draft' and new.status in ('pending_verification', 'rejected')) or
    (old.status = 'pending_verification' and new.status in ('open', 'rejected', 'draft')) or
    (old.status = 'open' and new.status in ('reviewing', 'expired', 'closed', 'rejected')) or
    (old.status = 'reviewing' and new.status in ('selected', 'closed', 'expired')) or
    (old.status = 'selected' and new.status in ('introduced', 'closed')) or
    (old.status = 'introduced' and new.status in ('converted', 'closed')) or
    (old.status = 'converted' and new.status = 'closed')
  ) then
    raise exception 'Invalid duel transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_duel_transition before update of status on public.duels
for each row execute function public.validate_duel_transition();

create or replace function public.validate_offer()
returns trigger language plpgsql set search_path = '' as $$
declare duel_row public.duels;
begin
  select * into duel_row from public.duels where id = new.duel_id;
  if not found then raise exception 'Duel does not exist' using errcode = '23503'; end if;
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
  if tg_op = 'UPDATE' and old.locked_at is not null and (
    new.plan_name is distinct from old.plan_name or
    new.annual_price is distinct from old.annual_price or
    new.seats_included is distinct from old.seats_included or
    new.implementation_fee is distinct from old.implementation_fee or
    new.migration_fee is distinct from old.migration_fee or
    new.contract_months is distinct from old.contract_months or
    new.price_lock_months is distinct from old.price_lock_months or
    new.valid_until is distinct from old.valid_until or
    new.included_features is distinct from old.included_features or
    new.uncovered_features is distinct from old.uncovered_features or
    new.limitations is distinct from old.limitations
  ) then
    raise exception 'A locked offer cannot be changed' using errcode = '55000';
  end if;
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    if duel_row.status <> 'open' or duel_row.submission_deadline <= now() then
      raise exception 'This duel is not accepting offers' using errcode = '55000';
    end if;
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
create trigger validate_offer_before_write before insert or update on public.offers
for each row execute function public.validate_offer();

create or replace function public.validate_offer_feature()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.offers o
    join public.duel_requirements dr on dr.duel_id = o.duel_id
    where o.id = new.offer_id and dr.id = new.duel_requirement_id
  ) then
    raise exception 'Offer feature must reference a requirement from the same duel' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_offer_feature_before_write before insert or update on public.offer_features
for each row execute function public.validate_offer_feature();

create or replace function public.snapshot_submitted_offer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare next_version integer;
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    select coalesce(max(version_number), 0) + 1 into next_version
    from public.offer_versions where offer_id = new.id;
    insert into public.offer_versions (offer_id, version_number, snapshot, created_by)
    values (new.id, next_version, to_jsonb(new), (select auth.uid()));
  end if;
  return new;
end;
$$;
create trigger snapshot_offer_after_submit after update of status on public.offers
for each row execute function public.snapshot_submitted_offer();

create or replace function public.validate_selection()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.offers o
    join public.duels d on d.id = o.duel_id
    where o.id = new.offer_id
      and o.duel_id = new.duel_id
      and o.status = 'submitted'
      and d.status = 'reviewing'
  ) then
    raise exception 'Only a submitted offer for a reviewing duel can be selected' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_selection_before_insert before insert on public.selections
for each row execute function public.validate_selection();

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare old_row jsonb; new_row jsonb; row_data jsonb; org_id uuid; rec_id uuid;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  row_data := coalesce(new_row, old_row);
  rec_id := nullif(row_data ->> 'id', '')::uuid;
  org_id := coalesce(
    nullif(row_data ->> 'organization_id', '')::uuid,
    nullif(row_data ->> 'buyer_organization_id', '')::uuid,
    nullif(row_data ->> 'vendor_organization_id', '')::uuid
  );
  insert into public.audit_logs (
    actor_user_id, action, table_name, record_id, organization_id,
    old_data, new_data, request_id, ip_address, user_agent
  ) values (
    (select auth.uid()), lower(tg_op), tg_table_name, rec_id, org_id,
    old_row, new_row,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', ''),
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', '')::inet,
    current_setting('request.headers', true)::jsonb ->> 'user-agent'
  );
  return coalesce(new, old);
exception when invalid_text_representation then
  insert into public.audit_logs (actor_user_id, action, table_name, record_id, organization_id, old_data, new_data)
  values ((select auth.uid()), lower(tg_op), tg_table_name, rec_id, org_id, old_row, new_row);
  return coalesce(new, old);
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations', 'organization_members', 'buyer_profiles', 'vendor_profiles',
    'vendor_products', 'vendor_product_replacements', 'duels', 'duel_requirements',
    'duel_verifications', 'duel_documents', 'offers', 'offer_features', 'selections',
    'payments', 'introductions', 'deal_outcomes', 'public_wins', 'reports', 'admin_actions'
  ] loop
    execute format(
      'create trigger audit_changes after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      table_name
    );
  end loop;
end $$;

create type public.vendor_opportunity as (
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
  verification_badge text
);

create or replace function public.list_vendor_opportunities()
returns setof public.vendor_opportunity
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id, d.public_id, d.slug, c.name, sp.name, d.annual_spend, d.currency,
    d.seats, d.country_code, d.company_size, d.renewal_date, d.buyer_intent,
    d.submission_deadline,
    case
      when exists (select 1 from public.duel_verifications v where v.duel_id = d.id and v.verification_type = 'spend' and v.status = 'verified')
        then 'verified_spend'
      when exists (select 1 from public.duel_verifications v where v.duel_id = d.id and v.verification_type = 'business_email' and v.status = 'verified')
        then 'business_verified'
      else null
    end
  from public.duels d
  join public.categories c on c.id = d.category_id
  join public.software_products sp on sp.id = d.current_software_product_id
  where d.status = 'open'
    and d.submission_deadline > now()
    and (public.current_user_is_admin() or exists (
      select 1
      from public.organization_members om
      join public.vendor_profiles vp on vp.organization_id = om.organization_id
      where om.user_id = (select auth.uid()) and vp.approval_status = 'approved'
    ));
$$;
revoke all on function public.list_vendor_opportunities() from public;
grant execute on function public.list_vendor_opportunities() to authenticated;

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.buyer_profiles enable row level security;
alter table public.vendor_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.software_products enable row level security;
alter table public.software_competitors enable row level security;
alter table public.vendor_products enable row level security;
alter table public.vendor_product_replacements enable row level security;
alter table public.duels enable row level security;
alter table public.duel_requirements enable row level security;
alter table public.duel_verifications enable row level security;
alter table public.duel_documents enable row level security;
alter table public.offers enable row level security;
alter table public.offer_features enable row level security;
alter table public.offer_versions enable row level security;
alter table public.selections enable row level security;
alter table public.payments enable row level security;
alter table public.introductions enable row level security;
alter table public.deal_outcomes enable row level security;
alter table public.public_wins enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.reports enable row level security;
alter table public.admin_actions enable row level security;

create policy users_self_read on public.users for select to authenticated using (id = (select auth.uid()) or public.current_user_is_admin());
create policy users_self_update on public.users for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()) and system_role = 'user');

create policy organizations_member_read on public.organizations for select to authenticated using (
  public.is_organization_member(id) or public.current_user_is_admin() or exists (
    select 1 from public.introductions i
    where i.status in ('paid', 'introduced')
      and ((i.buyer_organization_id = id and public.is_organization_member(i.vendor_organization_id))
        or (i.vendor_organization_id = id and public.is_organization_member(i.buyer_organization_id)))
  )
);
create policy organizations_create on public.organizations for insert to authenticated with check (created_by = (select auth.uid()));
create policy organizations_admin_update on public.organizations for update to authenticated using (
  public.has_organization_role(id, array['owner','admin']::public.membership_role[]) or public.current_user_is_admin()
);

create policy memberships_member_read on public.organization_members for select to authenticated using (public.is_organization_member(organization_id) or public.current_user_is_admin());
create policy memberships_owner_manage on public.organization_members for all to authenticated using (
  public.has_organization_role(organization_id, array['owner','admin']::public.membership_role[]) or public.current_user_is_admin()
) with check (
  public.has_organization_role(organization_id, array['owner','admin']::public.membership_role[]) or
  public.current_user_is_admin() or
  (user_id = (select auth.uid()) and exists (select 1 from public.organizations o where o.id = organization_id and o.created_by = (select auth.uid())))
);

create policy buyer_profiles_party_read on public.buyer_profiles for select to authenticated using (
  public.is_organization_member(organization_id) or public.current_user_is_admin() or exists (
    select 1 from public.introductions i where i.buyer_organization_id = organization_id
      and i.status in ('paid','introduced') and public.is_organization_member(i.vendor_organization_id)
  )
);
create policy buyer_profiles_owner_write on public.buyer_profiles for all to authenticated using (
  public.has_organization_role(organization_id, array['owner','admin']::public.membership_role[]) or public.current_user_is_admin()
) with check (public.is_organization_member(organization_id) or public.current_user_is_admin());

create policy vendor_profiles_party_read on public.vendor_profiles for select to authenticated using (
  public.is_organization_member(organization_id) or public.current_user_is_admin() or approval_status = 'approved'
);
create policy vendor_profiles_owner_insert on public.vendor_profiles for insert to authenticated with check (
  public.is_organization_member(organization_id) and approval_status = 'pending'
);
create policy vendor_profiles_owner_update on public.vendor_profiles for update to authenticated using (
  public.has_organization_role(organization_id, array['owner','admin']::public.membership_role[]) or public.current_user_is_admin()
);

create policy catalog_categories_read on public.categories for select to anon, authenticated using (is_active or public.current_user_is_admin());
create policy catalog_software_read on public.software_products for select to anon, authenticated using (is_active or public.current_user_is_admin());
create policy catalog_competitors_read on public.software_competitors for select to anon, authenticated using (true);
create policy catalog_admin_categories on public.categories for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy catalog_admin_software on public.software_products for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy catalog_admin_competitors on public.software_competitors for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

create policy vendor_products_read on public.vendor_products for select to anon, authenticated using (is_active or public.is_organization_member(vendor_organization_id) or public.current_user_is_admin());
create policy vendor_products_manage on public.vendor_products for all to authenticated using (
  public.has_organization_role(vendor_organization_id, array['owner','admin']::public.membership_role[]) or public.current_user_is_admin()
) with check (public.is_organization_member(vendor_organization_id) or public.current_user_is_admin());
create policy replacements_read on public.vendor_product_replacements for select to anon, authenticated using (true);
create policy replacements_manage on public.vendor_product_replacements for all to authenticated using (
  exists (select 1 from public.vendor_products vp where vp.id = vendor_product_id and public.has_organization_role(vp.vendor_organization_id, array['owner','admin']::public.membership_role[]))
  or public.current_user_is_admin()
);

create policy duels_buyer_read on public.duels for select to authenticated using (public.is_organization_member(buyer_organization_id) or public.current_user_is_admin());
create policy duels_buyer_insert on public.duels for insert to authenticated with check (created_by = (select auth.uid()) and public.is_organization_member(buyer_organization_id));
create policy duels_buyer_update on public.duels for update to authenticated using (
  (public.is_organization_member(buyer_organization_id) and status in ('draft','pending_verification')) or public.current_user_is_admin()
);

create policy requirements_party_read on public.duel_requirements for select to authenticated using (
  exists (select 1 from public.duels d where d.id = duel_id and (public.is_organization_member(d.buyer_organization_id) or (d.status = 'open' and public.is_approved_vendor_member()) or public.current_user_is_admin()))
);
create policy requirements_buyer_manage on public.duel_requirements for all to authenticated using (
  exists (select 1 from public.duels d where d.id = duel_id and ((public.is_organization_member(d.buyer_organization_id) and d.status in ('draft','pending_verification')) or public.current_user_is_admin()))
);

create policy verifications_buyer_read on public.duel_verifications for select to authenticated using (
  exists (select 1 from public.duels d where d.id = duel_id and (public.is_organization_member(d.buyer_organization_id) or public.current_user_is_admin()))
);
create policy verifications_buyer_submit on public.duel_verifications for insert to authenticated with check (
  status = 'pending' and exists (select 1 from public.duels d where d.id = duel_id and public.is_organization_member(d.buyer_organization_id))
);
create policy verifications_admin_review on public.duel_verifications for update to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

create policy documents_buyer_read on public.duel_documents for select to authenticated using (
  exists (select 1 from public.duels d where d.id = duel_id and (public.is_organization_member(d.buyer_organization_id) or public.current_user_is_admin()))
);
create policy documents_buyer_insert on public.duel_documents for insert to authenticated with check (
  uploaded_by = (select auth.uid()) and exists (select 1 from public.duels d where d.id = duel_id and public.is_organization_member(d.buyer_organization_id))
);
create policy documents_admin_update on public.duel_documents for update to authenticated using (public.current_user_is_admin());

create policy offers_vendor_read on public.offers for select to authenticated using (public.is_organization_member(vendor_organization_id) or public.current_user_is_admin());
create policy offers_buyer_after_close_read on public.offers for select to authenticated using (
  status in ('submitted','selected','not_selected','expired') and exists (
    select 1 from public.duels d where d.id = duel_id
      and public.is_organization_member(d.buyer_organization_id)
      and (d.status <> 'open' or d.submission_deadline <= now())
  )
);
create policy offers_vendor_insert on public.offers for insert to authenticated with check (
  created_by = (select auth.uid()) and public.is_approved_vendor_member(vendor_organization_id)
);
create policy offers_vendor_update on public.offers for update to authenticated using (
  (public.is_organization_member(vendor_organization_id) and status in ('draft','submitted')) or public.current_user_is_admin()
);
create policy offer_features_party on public.offer_features for select to authenticated using (
  exists (select 1 from public.offers o where o.id = offer_id and (
    public.is_organization_member(o.vendor_organization_id) or public.current_user_is_admin() or
    exists (select 1 from public.duels d where d.id = o.duel_id and public.is_organization_member(d.buyer_organization_id) and (d.status <> 'open' or d.submission_deadline <= now()))
  ))
);
create policy offer_features_vendor_manage on public.offer_features for all to authenticated using (
  exists (select 1 from public.offers o where o.id = offer_id and o.status = 'draft' and public.is_organization_member(o.vendor_organization_id)) or public.current_user_is_admin()
);
create policy offer_versions_party_read on public.offer_versions for select to authenticated using (
  exists (select 1 from public.offers o where o.id = offer_id and (public.is_organization_member(o.vendor_organization_id) or public.current_user_is_admin() or exists (
    select 1 from public.duels d where d.id = o.duel_id and public.is_organization_member(d.buyer_organization_id) and (d.status <> 'open' or d.submission_deadline <= now())
  )))
);

create policy selections_party_read on public.selections for select to authenticated using (
  public.current_user_is_admin() or exists (select 1 from public.duels d where d.id = duel_id and public.is_organization_member(d.buyer_organization_id)) or
  exists (select 1 from public.offers o where o.id = offer_id and public.is_organization_member(o.vendor_organization_id))
);
create policy selections_buyer_insert on public.selections for insert to authenticated with check (
  selected_by = (select auth.uid()) and exists (select 1 from public.duels d where d.id = duel_id and public.is_organization_member(d.buyer_organization_id))
);

create policy payments_vendor_read on public.payments for select to authenticated using (public.is_organization_member(vendor_organization_id) or public.current_user_is_admin());
create policy payments_service_admin on public.payments for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy introductions_party_read on public.introductions for select to authenticated using (
  public.is_organization_member(buyer_organization_id) or public.is_organization_member(vendor_organization_id) or public.current_user_is_admin()
);
create policy introductions_admin_manage on public.introductions for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy outcomes_party_read on public.deal_outcomes for select to authenticated using (
  public.current_user_is_admin() or exists (select 1 from public.introductions i where i.id = introduction_id and (public.is_organization_member(i.buyer_organization_id) or public.is_organization_member(i.vendor_organization_id)))
);
create policy outcomes_buyer_insert on public.deal_outcomes for insert to authenticated with check (
  exists (select 1 from public.introductions i where i.id = introduction_id and public.is_organization_member(i.buyer_organization_id))
);
create policy outcomes_buyer_update on public.deal_outcomes for update to authenticated using (
  exists (select 1 from public.introductions i where i.id = introduction_id and public.is_organization_member(i.buyer_organization_id)) or public.current_user_is_admin()
);

create policy wins_public_read on public.public_wins for select to anon, authenticated using (published_at is not null or public.current_user_is_admin());
create policy wins_admin_manage on public.public_wins for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy notifications_owner_read on public.notifications for select to authenticated using (
  user_id = (select auth.uid()) or (organization_id is not null and public.is_organization_member(organization_id)) or public.current_user_is_admin()
);
create policy notifications_owner_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.current_user_is_admin());
create policy reports_owner_read on public.reports for select to authenticated using (reporter_user_id = (select auth.uid()) or public.current_user_is_admin());
create policy reports_submit on public.reports for insert to authenticated with check (reporter_user_id = (select auth.uid()));
create policy reports_admin_update on public.reports for update to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy admin_actions_admin on public.admin_actions for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'duel-verifications', 'duel-verifications', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy verification_files_buyer_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'duel-verifications' and exists (
    select 1 from public.duels d
    where d.id::text = (storage.foldername(name))[2]
      and d.buyer_organization_id::text = (storage.foldername(name))[1]
      and public.is_organization_member(d.buyer_organization_id)
  )
);
create policy verification_files_party_read on storage.objects for select to authenticated using (
  bucket_id = 'duel-verifications' and exists (
    select 1 from public.duels d
    where d.id::text = (storage.foldername(name))[2]
      and d.buyer_organization_id::text = (storage.foldername(name))[1]
      and (public.is_organization_member(d.buyer_organization_id) or public.current_user_is_admin())
  )
);
create policy verification_files_buyer_delete on storage.objects for delete to authenticated using (
  bucket_id = 'duel-verifications' and exists (
    select 1 from public.duels d
    where d.id::text = (storage.foldername(name))[2]
      and d.buyer_organization_id::text = (storage.foldername(name))[1]
      and (public.is_organization_member(d.buyer_organization_id) or public.current_user_is_admin())
  )
);

commit;
