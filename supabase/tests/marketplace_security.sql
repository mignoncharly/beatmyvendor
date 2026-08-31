begin;

-- Rollback-only fixtures. Fixed IDs make every assertion explicit.
insert into auth.users (id,email,raw_app_meta_data,raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001','admin.integration@beatmyvendor.invalid','{}','{}'),
  ('00000000-0000-4000-8000-000000000002','buyer-a.integration@beatmyvendor.invalid','{}','{}'),
  ('00000000-0000-4000-8000-000000000003','buyer-b.integration@beatmyvendor.invalid','{}','{}'),
  ('00000000-0000-4000-8000-000000000004','vendor.integration@beatmyvendor.invalid','{}','{}');

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
  ('10000000-0000-4000-8000-000000000001','verified','Buyer A Contact','buyer-a.integration@beatmyvendor.invalid'),
  ('10000000-0000-4000-8000-000000000002','verified','Buyer B Contact','buyer-b.integration@beatmyvendor.invalid');
insert into public.vendor_profiles (organization_id,approval_status,approved_at,approved_by,contact_name,contact_email)
values ('10000000-0000-4000-8000-000000000003','approved',now(),'00000000-0000-4000-8000-000000000001','Vendor Contact','vendor.integration@beatmyvendor.invalid');

insert into public.categories (id,name,slug) values ('20000000-0000-4000-8000-000000000001','Integration Category','integration-category');
insert into public.software_products (id,category_id,name,slug) values
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Integration Current','integration-current'),
  ('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Integration Challenger','integration-challenger');
insert into public.vendor_products (id,vendor_organization_id,software_product_id,product_name)
values ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','Integration Challenger');
insert into public.vendor_product_replacements (vendor_product_id,replaces_software_product_id)
values ('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002');

do $$
begin
  if has_table_privilege('authenticated','public.users','UPDATE') then
    raise exception 'Authenticated users retain direct user UPDATE permission';
  end if;
  if has_table_privilege('authenticated','public.buyer_profiles','UPDATE') then
    raise exception 'Authenticated users retain direct buyer profile UPDATE permission';
  end if;
  if has_table_privilege('authenticated','public.offers','UPDATE') then
    raise exception 'Authenticated vendors retain direct offer UPDATE permission';
  end if;
  if has_table_privilege('authenticated','public.duel_requirements','INSERT') then
    raise exception 'Authenticated buyers retain direct requirement INSERT permission';
  end if;
  if public.duel_text_disclosure_reason('10000000-0000-4000-8000-000000000001','Contact buyer@example.com') <> 'email address' then
    raise exception 'Requirement disclosure detector did not reject an email address';
  end if;
  if public.duel_text_disclosure_reason('10000000-0000-4000-8000-000000000001','Configured for Integration Buyer A') <> 'buyer identity' then
    raise exception 'Requirement disclosure detector did not reject the buyer company name';
  end if;
  if has_table_privilege('authenticated','public.deal_outcomes','INSERT')
     or has_table_privilege('authenticated','public.deal_outcomes','UPDATE') then
    raise exception 'Authenticated users retain direct deal outcome write permission';
  end if;
  if has_function_privilege('authenticated','public.run_marketplace_expiry()','EXECUTE') then
    raise exception 'Authenticated users can execute marketplace expiry';
  end if;
  if has_function_privilege('authenticated','public.check_rate_limit(text,integer,integer)','EXECUTE') then
    raise exception 'Authenticated users can execute the rate limiter directly';
  end if;
  if not public.check_rate_limit('itest:'||gen_random_uuid()::text, 1, 60) then
    raise exception 'Rate limiter rejected the first request in a window';
  end if;
  if not has_function_privilege('authenticated','public.match_vendor_opportunities(uuid,text,text,text,boolean,numeric,timestamptz,uuid,integer)','EXECUTE') then
    raise exception 'Vendors cannot execute opportunity matching';
  end if;
  if not has_function_privilege('authenticated','public.admin_verification_documents(uuid)','EXECUTE') then
    raise exception 'Admin evidence listing is not executable';
  end if;
  if not public.is_supported_currency('EUR') or public.is_supported_currency('XXX') then
    raise exception 'Currency allowlist is not enforced';
  end if;
  if not public.is_iso_country('FR') or public.is_iso_country('ZZ') then
    raise exception 'Country allowlist is not enforced';
  end if;
  -- Matching is gated to approved members: the admin (not a vendor member) is refused.
  begin
    perform public.match_vendor_opportunities('10000000-0000-4000-8000-000000000003');
    raise exception 'A non-member could run vendor opportunity matching';
  exception when sqlstate '42501' then null;
  end;
end $$;

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
do $$
begin
  -- BMV-018: the submission snapshot captures the complete commercial record,
  -- including the coverage-matrix projection.
  if not exists (
    select 1 from public.offer_versions
    where offer_id='40000000-0000-4000-8000-000000000001' and (snapshot ? 'features')
  ) then
    raise exception 'Offer version snapshot omits the coverage matrix';
  end if;
end $$;
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
  begin
    update public.offers set locked_at=null where id='40000000-0000-4000-8000-000000000001';
    raise exception 'Vendor cleared a submitted offer lock';
  exception when others then
    if (select locked_at from public.offers where id='40000000-0000-4000-8000-000000000001') is null then
      raise exception 'Submitted offer lock was cleared despite rejected update';
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
  event_result := public.process_stripe_checkout_event('evt_integration_failed','checkout.session.async_payment_failed',false,payment_uuid,'cs_integration_failed','pi_integration_failed',9900,'eur',null);
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
  event_result := public.process_stripe_checkout_event('evt_integration_expired','checkout.session.expired',false,payment_uuid,'cs_integration_expired','',9900,'eur',null);
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
  first_result := public.process_stripe_checkout_event('evt_integration_success','checkout.session.completed',false,payment_uuid,'cs_integration_success','pi_integration_success',9900,'eur',null);
  duplicate_result := public.process_stripe_checkout_event('evt_integration_success','checkout.session.completed',false,payment_uuid,'cs_integration_success','pi_integration_success',9900,'eur',null);
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

-- BMV-019: a refund reconciles payment + introduction and revokes identity access.
reset role;
do $$
declare payment_uuid uuid;
begin
  select id into payment_uuid from public.payments where selection_id='50000000-0000-4000-8000-000000000001' and status='paid';
  if not public.process_stripe_refund_event('evt_integration_refund','charge.refunded',false,'pi_integration_success','re_integration_1') then
    raise exception 'Refund event was not processed';
  end if;
  if (select status from public.payments where id=payment_uuid) <> 'refunded' then raise exception 'Payment did not enter refunded state'; end if;
  if (select status from public.introductions where selection_id='50000000-0000-4000-8000-000000000001') <> 'refunded' then raise exception 'Introduction was not refunded after refund'; end if;
  if public.process_stripe_refund_event('evt_integration_refund','charge.refunded',false,'pi_integration_success','re_integration_1') is distinct from false then
    raise exception 'Refund event idempotency failed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
do $$
begin
  if (select count(*) from public.buyer_profiles where organization_id='10000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'Vendor retains buyer identity access after refund';
  end if;
end $$;

-- Phase 1 lifecycle assertions on isolated scratch fixtures (rolled back below).
reset role;
savepoint phase1_lifecycle;

-- BMV-016: recurring fees are folded into the authoritative annual-spend baseline.
insert into public.duels (
  id,slug,buyer_organization_id,created_by,category_id,current_software_product_id,
  current_price,billing_frequency,currency,seats,current_fees,country_code,company_size,buyer_intent,
  status,submission_deadline
) values (
  '30000000-0000-4000-8000-000000000009','integration-duel-2',
  '10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  1000,'monthly','EUR',20,200,'FR','11-50','actively_looking','draft',now()+interval '7 days'
);
do $$
begin
  if (select annual_spend from public.duels where id='30000000-0000-4000-8000-000000000009') <> 12200 then
    raise exception 'annual_spend did not include recurring fees';
  end if;
end $$;

-- BMV-009: a material spend change invalidates a completed spend verification.
insert into public.duel_verifications (duel_id,verification_type,status,reviewed_by,reviewed_at)
values ('30000000-0000-4000-8000-000000000009','spend','verified','00000000-0000-4000-8000-000000000001',now());
update public.duels set current_price=1100 where id='30000000-0000-4000-8000-000000000009';
do $$
begin
  if (select status from public.duel_verifications where duel_id='30000000-0000-4000-8000-000000000009' and verification_type='spend') <> 'pending' then
    raise exception 'Material spend change did not invalidate the spend verification';
  end if;
end $$;

-- BMV-012: an expired offer cannot be selected.
update public.duel_verifications set status='verified',reviewed_by='00000000-0000-4000-8000-000000000001',reviewed_at=now()
  where duel_id='30000000-0000-4000-8000-000000000009' and verification_type='spend';
update public.duels set status='pending_verification' where id='30000000-0000-4000-8000-000000000009';
update public.duels set status='open' where id='30000000-0000-4000-8000-000000000009';
insert into public.offers (
  id,duel_id,vendor_organization_id,vendor_product_id,created_by,plan_name,annual_price,currency,
  seats_included,contract_months,price_lock_months,created_at,valid_until,migration_included,onboarding_included,
  support_included,accuracy_confirmed_at
) values (
  '40000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000004','Expired Plan',9000,'EUR',20,12,12,
  now()-interval '2 days',now()-interval '1 day',true,true,'Email support',now()
);
update public.offers set status='submitted' where id='40000000-0000-4000-8000-000000000009';
update public.duels set status='reviewing' where id='30000000-0000-4000-8000-000000000009';
do $$
begin
  begin
    insert into public.selections (duel_id,offer_id,selected_by) values (
      '30000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000003'
    );
    raise exception 'Expired offer was selectable';
  exception when sqlstate '23514' then
    null; -- validate_selection rejected the expired offer as expected
  end;
end $$;

rollback to savepoint phase1_lifecycle;

-- Phase 8 live-gate regression: exercise the client-callable selection RPC.
-- A bare text channel in its INSERT ... SELECT previously raised 42804 and
-- rolled back the selection before Stripe Checkout could begin.
reset role;
savepoint phase8_selection_rpc;
insert into public.duels (
  id,slug,buyer_organization_id,created_by,category_id,current_software_product_id,
  current_price,billing_frequency,currency,seats,country_code,company_size,buyer_intent,
  status,submission_deadline,published_at
) values (
  '30000000-0000-4000-8000-000000000010','integration-selection-rpc',
  '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  12000,'annual','EUR',20,'FR','11-50','actively_looking','draft',now()+interval '7 days',now()
);
insert into public.duel_verifications (duel_id,verification_type,status,reviewed_by,reviewed_at)
values ('30000000-0000-4000-8000-000000000010','spend','verified','00000000-0000-4000-8000-000000000001',now());
update public.duels set status='pending_verification' where id='30000000-0000-4000-8000-000000000010';
update public.duels set status='open' where id='30000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
insert into public.offers (
  id,duel_id,vendor_organization_id,vendor_product_id,created_by,plan_name,annual_price,currency,
  seats_included,contract_months,price_lock_months,valid_until,migration_included,onboarding_included,
  support_included,accuracy_confirmed_at
) values (
  '40000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000004','Selection RPC Plan',9000,'EUR',20,12,12,
  now()+interval '30 days',true,true,'Email support',now()
);
update public.offers set status='submitted' where id='40000000-0000-4000-8000-000000000010';
update public.duels set status='reviewing' where id='30000000-0000-4000-8000-000000000010';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$
declare saved_selection uuid;
begin
  saved_selection := public.select_buyer_offer(
    '30000000-0000-4000-8000-000000000010',
    '40000000-0000-4000-8000-000000000010'
  );
  if saved_selection is null
     or not exists (select 1 from public.introductions where selection_id=saved_selection and status='awaiting_payment') then
    raise exception 'Buyer selection RPC did not create the awaiting-payment introduction';
  end if;
end $$;

reset role;
do $$
begin
  if not exists (
    select 1 from public.notifications
    where organization_id='10000000-0000-4000-8000-000000000003'
      and template_key='challenge_selected'
      and payload->>'offer_id'='40000000-0000-4000-8000-000000000010'
  ) then
    raise exception 'Buyer selection RPC did not notify the selected vendor';
  end if;
end $$;

rollback to savepoint phase8_selection_rpc;

reset role;
rollback;
