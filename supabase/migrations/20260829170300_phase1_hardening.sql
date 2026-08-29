begin;

create or replace function public.protect_vendor_approval()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.approval_status <> 'pending' and not public.current_user_is_admin() then
    raise exception 'Only an admin can approve a vendor' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
    new.approval_status is distinct from old.approval_status or
    new.approved_at is distinct from old.approved_at or
    new.approved_by is distinct from old.approved_by
  ) and not public.current_user_is_admin() then
    raise exception 'Only an admin can change vendor approval' using errcode = '42501';
  end if;
  if new.approval_status = 'approved' and (new.approved_at is null or new.approved_by is null) then
    raise exception 'Approved vendors require approver and timestamp' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger protect_vendor_approval before insert or update on public.vendor_profiles
for each row execute function public.protect_vendor_approval();

drop policy duels_buyer_insert on public.duels;
create policy duels_buyer_insert on public.duels for insert to authenticated with check (
  created_by = (select auth.uid()) and public.is_organization_member(buyer_organization_id) and status = 'draft'
);
drop policy duels_buyer_update on public.duels;
create policy duels_buyer_update on public.duels for update to authenticated using (
  (public.is_organization_member(buyer_organization_id) and status in ('draft','pending_verification')) or public.current_user_is_admin()
) with check (
  (public.is_organization_member(buyer_organization_id) and status in ('draft','pending_verification')) or public.current_user_is_admin()
);

drop policy offers_vendor_insert on public.offers;
create policy offers_vendor_insert on public.offers for insert to authenticated with check (
  created_by = (select auth.uid()) and public.is_approved_vendor_member(vendor_organization_id) and status = 'draft'
);
drop policy offers_vendor_update on public.offers;
create policy offers_vendor_update on public.offers for update to authenticated using (
  (public.is_organization_member(vendor_organization_id) and status in ('draft','submitted')) or public.current_user_is_admin()
) with check (
  (public.is_organization_member(vendor_organization_id) and status in ('draft','submitted','withdrawn')) or public.current_user_is_admin()
);

revoke all on all tables in schema public from anon, authenticated;
grant select on public.categories, public.software_products, public.software_competitors,
  public.vendor_products, public.vendor_product_replacements, public.public_wins to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_logs, public.offer_versions from authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

comment on table public.duel_documents is 'Private verification document metadata. Objects live in the private duel-verifications bucket and are never vendor-readable.';
comment on function public.list_vendor_opportunities() is 'Approved-vendor marketplace projection. Deliberately omits buyer organization and identity fields.';
comment on table public.audit_logs is 'Append-only security and business audit trail; direct client writes are revoked.';
comment on table public.offer_versions is 'Immutable snapshots created by the submission trigger; direct client writes are revoked.';

commit;
