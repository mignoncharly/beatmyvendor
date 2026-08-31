-- Committed marketplace seed for the authenticated E2E journey (Phase 3).
-- Mirrors the fixed-UUID fixtures in marketplace_security.sql but COMMITS, so the
-- running app (over the REST/auth API) can read it. Auth users are created via the
-- GoTrue admin API by the Playwright global-setup and passed in as :vars; the
-- on-auth-user trigger populates public.users, so we only set the admin role here.
--
-- Re-runnable: fixed-UUID rows are deleted first in FK-safe order.
--   psql "<conn>" -v admin_uid=… -v buyer_uid=… -v vendor_uid=… -f journey_seed.sql

\set ON_ERROR_STOP on
begin;

-- Teardown with triggers/FK checks disabled so protective triggers (owner
-- retention, state-transition guards) don't block idempotent re-seeding. Restored
-- to default before the inserts so insert-side triggers (selection→introduction,
-- offer snapshot) still fire.
set session_replication_role = replica;

-- Cleanup (children → parents), including any payment/introduction rows a prior
-- run created off the seeded selection.
delete from public.payments      where selection_id = '50000000-0000-4000-8000-0000000000a1';
delete from public.introductions where selection_id = '50000000-0000-4000-8000-0000000000a1';
delete from public.selections    where id = '50000000-0000-4000-8000-0000000000a1';
delete from public.offers        where id = '40000000-0000-4000-8000-0000000000a1';
delete from public.duel_verifications where duel_id = '30000000-0000-4000-8000-0000000000a1';
delete from public.duels         where id = '30000000-0000-4000-8000-0000000000a1';
delete from public.vendor_product_replacements where vendor_product_id = '20000000-0000-4000-8000-0000000000a4';
delete from public.vendor_products where id = '20000000-0000-4000-8000-0000000000a4';
delete from public.software_products where id in ('20000000-0000-4000-8000-0000000000a2','20000000-0000-4000-8000-0000000000a3');
delete from public.categories    where id = '20000000-0000-4000-8000-0000000000a1';
delete from public.buyer_profiles  where organization_id = '10000000-0000-4000-8000-0000000000a1';
delete from public.vendor_profiles where organization_id = '10000000-0000-4000-8000-0000000000a3';
delete from public.organization_members where organization_id in ('10000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a3');
delete from public.organizations where id in ('10000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a3');

set session_replication_role = default;

update public.users set system_role = 'admin' where id = :'admin_uid';

-- Act as the admin so SECURITY DEFINER triggers (e.g. vendor-approval, spend
-- verification) that read auth.uid() accept these writes. Superuser still
-- bypasses RLS; the claim only feeds the triggers. Transaction-local (resets at
-- commit). Switched to the vendor/buyer actor before their respective writes.
select set_config('request.jwt.claim.sub', :'admin_uid', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.organizations (id,kind,name,slug,created_by) values
  ('10000000-0000-4000-8000-0000000000a1','buyer','Journey Buyer','journey-buyer',:'buyer_uid'),
  ('10000000-0000-4000-8000-0000000000a3','vendor','Journey Vendor','journey-vendor',:'vendor_uid');
insert into public.organization_members (organization_id,user_id,role) values
  ('10000000-0000-4000-8000-0000000000a1',:'buyer_uid','owner'),
  ('10000000-0000-4000-8000-0000000000a3',:'vendor_uid','owner');
insert into public.buyer_profiles (organization_id,business_email_status,contact_name,contact_email) values
  ('10000000-0000-4000-8000-0000000000a1','verified','Journey Buyer Contact','journey-buyer-contact@beatmyvendor.invalid');
insert into public.vendor_profiles (organization_id,approval_status,approved_at,approved_by,contact_name,contact_email) values
  ('10000000-0000-4000-8000-0000000000a3','approved',now(),:'admin_uid','Journey Vendor Contact','journey-vendor-contact@beatmyvendor.invalid');

insert into public.categories (id,name,slug) values
  ('20000000-0000-4000-8000-0000000000a1','Journey Category','journey-category');
insert into public.software_products (id,category_id,name,slug) values
  ('20000000-0000-4000-8000-0000000000a2','20000000-0000-4000-8000-0000000000a1','Journey Current','journey-current'),
  ('20000000-0000-4000-8000-0000000000a3','20000000-0000-4000-8000-0000000000a1','Journey Challenger','journey-challenger');
insert into public.vendor_products (id,vendor_organization_id,software_product_id,product_name) values
  ('20000000-0000-4000-8000-0000000000a4','10000000-0000-4000-8000-0000000000a3','20000000-0000-4000-8000-0000000000a3','Journey Challenger');
insert into public.vendor_product_replacements (vendor_product_id,replaces_software_product_id) values
  ('20000000-0000-4000-8000-0000000000a4','20000000-0000-4000-8000-0000000000a2');

insert into public.duels (
  id,slug,buyer_organization_id,created_by,category_id,current_software_product_id,
  current_price,billing_frequency,currency,seats,country_code,company_size,buyer_intent,
  status,submission_deadline,published_at
) values (
  '30000000-0000-4000-8000-0000000000a1','journey-duel',
  '10000000-0000-4000-8000-0000000000a1',:'buyer_uid',
  '20000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-0000000000a2',
  12000,'annual','EUR',20,'FR','11-50','actively_looking','draft',now()+interval '7 days',now()
);
insert into public.duel_verifications (duel_id,verification_type,status,reviewed_by,reviewed_at) values
  ('30000000-0000-4000-8000-0000000000a1','spend','verified',:'admin_uid',now());
update public.duels set status='pending_verification' where id='30000000-0000-4000-8000-0000000000a1';
update public.duels set status='open' where id='30000000-0000-4000-8000-0000000000a1';

-- Vendor submits the offer.
select set_config('request.jwt.claim.sub', :'vendor_uid', true);
insert into public.offers (
  id,duel_id,vendor_organization_id,vendor_product_id,created_by,plan_name,annual_price,currency,
  seats_included,contract_months,price_lock_months,valid_until,migration_included,onboarding_included,
  support_included,accuracy_confirmed_at
) values (
  '40000000-0000-4000-8000-0000000000a1','30000000-0000-4000-8000-0000000000a1',
  '10000000-0000-4000-8000-0000000000a3','20000000-0000-4000-8000-0000000000a4',
  :'vendor_uid','Journey Plan',9000,'EUR',20,12,12,
  now()+interval '30 days',true,true,'Email support',now()
);
update public.offers set status='submitted' where id='40000000-0000-4000-8000-0000000000a1';
update public.duels set status='reviewing' where id='30000000-0000-4000-8000-0000000000a1';

-- Buyer selects the winning offer.
select set_config('request.jwt.claim.sub', :'buyer_uid', true);
insert into public.selections (id,duel_id,offer_id,selected_by) values (
  '50000000-0000-4000-8000-0000000000a1','30000000-0000-4000-8000-0000000000a1',
  '40000000-0000-4000-8000-0000000000a1',:'buyer_uid'
);

commit;
