begin;

-- =============================================================================
-- Phase 7 - Fixes surfaced by running the marketplace_security.sql gate against
-- a real database for the first time (BMV-034).
-- =============================================================================

-- notify_matching_vendors: a bare 'in_app' text literal in an INSERT ... SELECT
-- is not implicitly coerced to notification_channel (unlike the VALUES form),
-- so opening a duel with a matching approved vendor raised a type error. Cast it.
create or replace function public.notify_matching_vendors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open' and old.status is distinct from 'open' then
    insert into public.notifications (organization_id, channel, template_key, payload)
    select distinct vp.organization_id, 'in_app'::public.notification_channel, 'new_opportunity', jsonb_build_object('duel_id', new.id)
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

commit;
