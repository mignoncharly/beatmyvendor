begin;

drop policy catalog_categories_read on public.categories;
create policy catalog_categories_read on public.categories for select to anon, authenticated using (is_active);
drop policy catalog_software_read on public.software_products;
create policy catalog_software_read on public.software_products for select to anon, authenticated using (is_active);
drop policy vendor_products_read on public.vendor_products;
create policy vendor_products_public_read on public.vendor_products for select to anon, authenticated using (is_active);
create policy vendor_products_private_read on public.vendor_products for select to authenticated using (
  public.is_organization_member(vendor_organization_id) or public.current_user_is_admin()
);
drop policy wins_public_read on public.public_wins;
create policy wins_public_read on public.public_wins for select to anon, authenticated using (published_at is not null);

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
  if new.status = 'open' then
    if new.submission_deadline is null or new.submission_deadline <= now() or new.slug is null then
      raise exception 'An open duel requires a slug and future submission deadline' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.duel_verifications v
      where v.duel_id = new.id and v.status = 'verified'
        and v.verification_type in ('business_email', 'spend')
    ) then
      raise exception 'A duel must be verified before opening' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.validate_offer()
returns trigger language plpgsql set search_path = '' as $$
declare duel_row public.duels;
begin
  select * into duel_row from public.duels where id = new.duel_id;
  if not found then raise exception 'Duel does not exist' using errcode = '23503'; end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'New offers must start as drafts' using errcode = '23514';
  end if;
  if duel_row.status <> 'open' or duel_row.submission_deadline is null or duel_row.submission_deadline <= now() then
    if not (tg_op = 'UPDATE' and old.status <> 'draft') then
      raise exception 'This duel is not accepting offers' using errcode = '55000';
    end if;
  end if;
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
  if not exists (
    select 1 from public.vendor_product_replacements vpr
    where vpr.vendor_product_id = new.vendor_product_id
      and vpr.replaces_software_product_id = duel_row.current_software_product_id
  ) then
    raise exception 'Vendor product is not registered as a replacement for the current software' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.locked_at is not null and (
    new.duel_id is distinct from old.duel_id or
    new.vendor_organization_id is distinct from old.vendor_organization_id or
    new.vendor_product_id is distinct from old.vendor_product_id or
    new.created_by is distinct from old.created_by or
    new.plan_name is distinct from old.plan_name or
    new.annual_price is distinct from old.annual_price or
    new.currency is distinct from old.currency or
    new.seats_included is distinct from old.seats_included or
    new.implementation_fee is distinct from old.implementation_fee or
    new.migration_fee is distinct from old.migration_fee or
    new.contract_months is distinct from old.contract_months or
    new.price_lock_months is distinct from old.price_lock_months or
    new.valid_until is distinct from old.valid_until or
    new.migration_included is distinct from old.migration_included or
    new.onboarding_included is distinct from old.onboarding_included or
    new.support_included is distinct from old.support_included or
    new.included_features is distinct from old.included_features or
    new.uncovered_features is distinct from old.uncovered_features or
    new.limitations is distinct from old.limitations or
    new.commercial_comment is distinct from old.commercial_comment or
    new.accuracy_confirmed_at is distinct from old.accuracy_confirmed_at
  ) then
    raise exception 'A locked offer cannot be changed' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and new.status = 'submitted' and old.status is distinct from 'submitted' then
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

  insert into public.introductions (
    selection_id, buyer_organization_id, vendor_organization_id, status
  ) values (
    new.id, selected_duel.buyer_organization_id, selected_offer.vendor_organization_id, 'awaiting_payment'
  ) on conflict (selection_id) do nothing;
  return new;
end;
$$;
create trigger finalize_selection_after_insert after insert on public.selections
for each row execute function public.finalize_selection();

create or replace function public.validate_payment_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if not (
    (old.status = 'pending' and new.status in ('paid','failed','cancelled')) or
    (old.status = 'paid' and new.status = 'refunded')
  ) then
    raise exception 'Invalid payment transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  if new.status = 'refunded' and new.refunded_at is null then new.refunded_at := now(); end if;
  return new;
end;
$$;
create trigger validate_payment_transition before update of status on public.payments
for each row execute function public.validate_payment_transition();

create or replace function public.sync_payment_to_introduction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.introductions
      set payment_id = new.id, status = 'paid'
      where selection_id = new.selection_id and status = 'awaiting_payment';
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    update public.introductions set status = 'refunded' where payment_id = new.id;
  end if;
  return new;
end;
$$;
create trigger sync_payment_after_update after update of status on public.payments
for each row execute function public.sync_payment_to_introduction();

create or replace function public.validate_introduction_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if not (
    (old.status = 'awaiting_payment' and new.status in ('paid','cancelled')) or
    (old.status = 'paid' and new.status in ('introduced','refunded','cancelled')) or
    (old.status = 'introduced' and new.status = 'refunded')
  ) then
    raise exception 'Invalid introduction transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  if new.status = 'introduced' and new.introduced_at is null then new.introduced_at := now(); end if;
  return new;
end;
$$;
create trigger validate_introduction_transition before update of status on public.introductions
for each row execute function public.validate_introduction_transition();

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare old_row jsonb; new_row jsonb; row_data jsonb; org_id uuid; rec_id uuid; request_headers jsonb;
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
  request_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  insert into public.audit_logs (
    actor_user_id, action, table_name, record_id, organization_id,
    old_data, new_data, request_id, ip_address, user_agent
  ) values (
    (select auth.uid()), lower(tg_op), tg_table_name, rec_id, org_id,
    old_row, new_row, nullif(request_headers ->> 'x-request-id', ''),
    split_part(nullif(request_headers ->> 'x-forwarded-for', ''), ',', 1)::inet,
    request_headers ->> 'user-agent'
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
exception when invalid_text_representation then
  insert into public.audit_logs (actor_user_id, action, table_name, record_id, organization_id, old_data, new_data)
  values ((select auth.uid()), lower(tg_op), tg_table_name, rec_id, org_id, old_row, new_row);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

commit;
