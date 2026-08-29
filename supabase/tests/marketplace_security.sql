begin;

-- Rollback-only fixtures. Fixed IDs make every assertion explicit.
insert into auth.users (id,email,raw_app_meta_data,raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001','admin.integration@vendorduel.invalid','{}','{}'),
  ('00000000-0000-4000-8000-000000000002','buyer-a.integration@vendorduel.invalid','{}','{}'),
  ('00000000-0000-4000-8000-000000000003','buyer-b.integration@vendorduel.invalid','{}','{}'),
  ('00000000-0000-4000-8000-000000000004','vendor.integration@vendorduel.invalid','{}','{}');

update public.users set system_role='admin' where id='00000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.headers','{}',true);

insert into public.organizations (id,kind,name,slug,created_by) values
  ('10000000-0000-4000-8000-000000000001','buyer','Integration Buyer A','integration-buyer-a','00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000002','buyer','Integration Buyer B','integration-buyer-b','00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000003','vendor','Integration Vendor','integration-vendor','00000000-0000-4000-8000-000000000004');
insert into public.organization_members (organization_id,user_id,role) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','owner'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','owner'),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','owner');
insert into public.buyer_profiles (organization_id,business_email_status,contact_name,contact_email) values
  ('10000000-0000-4000-8000-000000000001','verified','Buyer A Contact','buyer-a.integration@vendorduel.invalid'),
  ('10000000-0000-4000-8000-000000000002','verified','Buyer B Contact','buyer-b.integration@vendorduel.invalid');
insert into public.vendor_profiles (organization_id,approval_status,approved_at,approved_by,contact_name,contact_email)
values ('10000000-0000-4000-8000-000000000003','approved',now(),'00000000-0000-4000-8000-000000000001','Vendor Contact','vendor.integration@vendorduel.invalid');

insert into public.categories (id,name,slug) values ('20000000-0000-4000-8000-000000000001','Integration Category','integration-category');
insert into public.software_products (id,category_id,name,slug) values
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Integration Current','integration-current'),
  ('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Integration Challenger','integration-challenger');
insert into public.vendor_products (id,vendor_organization_id,software_product_id,product_name)
values ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','Integration Challenger');
insert into public.vendor_product_replacements (vendor_product_id,replaces_software_product_id)
values ('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002');

insert into public.duels (
  id,slug,buyer_organization_id,created_by,category_id,current_software_product_id,
  current_price,billing_frequency,currency,seats,country_code,company_size,buyer_intent,
  status,submission_deadline,published_at
) values (
  '30000000-0000-4000-8000-000000000001','integration-duel',
  '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  12000,'annual','EUR',20,'FR','11-50','actively_looking','draft',now()+interval '7 days',now()
);
insert into public.duel_verifications (duel_id,verification_type,status,reviewed_by,reviewed_at)
values ('30000000-0000-4000-8000-000000000001','spend','verified','00000000-0000-4000-8000-000000000001',now());
update public.duels set status='pending_verification' where id='30000000-0000-4000-8000-000000000001';
update public.duels set status='open' where id='30000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
insert into public.offers (
  id,duel_id,vendor_organization_id,vendor_product_id,created_by,plan_name,annual_price,currency,
  seats_included,contract_months,price_lock_months,valid_until,migration_included,onboarding_included,
  support_included,accuracy_confirmed_at
) values (
  '40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000004','Integration Plan',9000,'EUR',20,12,12,
  now()+interval '30 days',true,true,'Email support',now()
);
update public.offers set status='submitted' where id='40000000-0000-4000-8000-000000000001';
update public.duels set status='reviewing' where id='30000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$
begin
  if (select count(*) from public.duels where id='30000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Buyer A cannot read own duel'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$
begin
  if (select count(*) from public.duels where id='30000000-0000-4000-8000-000000000001') <> 0 then raise exception 'Buyer B can read Buyer A duel'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
do $$
begin
  if (select count(*) from public.buyer_profiles where organization_id='10000000-0000-4000-8000-000000000001') <> 0 then raise exception 'Vendor sees buyer identity before payment'; end if;
  begin
    update public.offers set annual_price=1 where id='40000000-0000-4000-8000-000000000001';
    raise exception 'Locked offer update unexpectedly succeeded';
  exception when others then
    if (select annual_price from public.offers where id='40000000-0000-4000-8000-000000000001') <> 9000 then
      raise exception 'Locked offer price changed despite rejected update';
    end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
insert into public.selections (id,duel_id,offer_id,selected_by) values (
  '50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select public.prepare_introduction_payment('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');
select public.attach_stripe_checkout(
  (select id from public.payments where selection_id='50000000-0000-4000-8000-000000000001'),
  'cs_integration_failed',now()+interval '1 hour'
);

reset role;
do $$
declare event_result boolean; payment_uuid uuid;
begin
  select id into payment_uuid from public.payments where selection_id='50000000-0000-4000-8000-000000000001';
  event_result := public.process_stripe_checkout_event('evt_integration_failed','checkout.session.async_payment_failed',false,payment_uuid,'cs_integration_failed','pi_integration_failed',9999,'eur',null);
  if event_result is distinct from true then raise exception 'Failed webhook was not processed'; end if;
  if (select status from public.payments where id=payment_uuid) <> 'failed' then raise exception 'Failed payment did not enter failed state'; end if;
  if (select status from public.introductions where selection_id='50000000-0000-4000-8000-000000000001') <> 'awaiting_payment' then raise exception 'Failed payment unlocked the introduction'; end if;
  if not exists (select 1 from public.notifications where organization_id='10000000-0000-4000-8000-000000000003' and template_key='payment_failed' and payload->>'payment_id'=payment_uuid::text) then raise exception 'Failed payment notification was not queued'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select public.prepare_introduction_payment('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');
select public.attach_stripe_checkout(
  (select id from public.payments where selection_id='50000000-0000-4000-8000-000000000001' and status='pending'),
  'cs_integration_expired',now()+interval '1 hour'
);

reset role;
do $$
declare event_result boolean; payment_uuid uuid;
begin
  select id into payment_uuid from public.payments where selection_id='50000000-0000-4000-8000-000000000001' and status='pending';
  event_result := public.process_stripe_checkout_event('evt_integration_expired','checkout.session.expired',false,payment_uuid,'cs_integration_expired','',9999,'eur',null);
  if event_result is distinct from true then raise exception 'Expired webhook was not processed'; end if;
  if (select status from public.payments where id=payment_uuid) <> 'cancelled' then raise exception 'Expired checkout did not cancel payment'; end if;
  if (select status from public.introductions where selection_id='50000000-0000-4000-8000-000000000001') <> 'awaiting_payment' then raise exception 'Expired checkout unlocked the introduction'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select public.prepare_introduction_payment('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');
select public.attach_stripe_checkout(
  (select id from public.payments where selection_id='50000000-0000-4000-8000-000000000001' and status='pending'),
  'cs_integration_success',now()+interval '1 hour'
);

reset role;
do $$
declare first_result boolean; duplicate_result boolean; payment_uuid uuid;
begin
  select id into payment_uuid from public.payments where selection_id='50000000-0000-4000-8000-000000000001' and status='pending';
  first_result := public.process_stripe_checkout_event('evt_integration_success','checkout.session.completed',false,payment_uuid,'cs_integration_success','pi_integration_success',9999,'eur',null);
  duplicate_result := public.process_stripe_checkout_event('evt_integration_success','checkout.session.completed',false,payment_uuid,'cs_integration_success','pi_integration_success',9999,'eur',null);
  if first_result is distinct from true or duplicate_result is distinct from false then raise exception 'Webhook idempotency failed'; end if;
  if (select status from public.payments where id=payment_uuid) <> 'paid' then raise exception 'Payment was not completed'; end if;
  if (select status from public.introductions where selection_id='50000000-0000-4000-8000-000000000001') <> 'introduced' then raise exception 'Introduction was not unlocked'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
do $$
begin
  if (select count(*) from public.buyer_profiles where organization_id='10000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Vendor cannot read buyer identity after payment'; end if;
end $$;

reset role;
rollback;
