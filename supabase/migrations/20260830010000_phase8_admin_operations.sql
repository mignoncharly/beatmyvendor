begin;

create or replace function public.assert_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null or not public.current_user_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function public.admin_review_vendor(p_organization_id uuid, p_decision public.vendor_approval_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.assert_admin();
begin
  if p_decision not in ('approved','rejected','suspended') then raise exception 'Invalid vendor decision' using errcode='22023'; end if;
  update public.vendor_profiles set approval_status=p_decision,
    approved_at=case when p_decision='approved' then now() else null end,
    approved_by=case when p_decision='approved' then actor else null end
  where organization_id=p_organization_id;
  if not found then raise exception 'Vendor not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_user_id,action,target_type,target_id,reason,metadata)
  values(actor,'vendor_'||p_decision::text,'vendor_organization',p_organization_id,nullif(trim(p_reason),''),jsonb_build_object('decision',p_decision));
end;
$$;

create or replace function public.admin_review_verification(p_verification_id uuid, p_decision public.verification_status, p_verified_fields text[] default '{}', p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.assert_admin(); target_duel uuid;
begin
  if p_decision not in ('verified','rejected') then raise exception 'Invalid verification decision' using errcode='22023'; end if;
  update public.duel_verifications set status=p_decision, verified_fields=case when p_decision='verified' then p_verified_fields else '{}' end,
    reviewed_by=actor, reviewed_at=now(), rejection_reason=case when p_decision='rejected' then nullif(trim(p_reason),'') end
  where id=p_verification_id and status='pending' returning duel_id into target_duel;
  if target_duel is null then raise exception 'Pending verification not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_user_id,action,target_type,target_id,reason,metadata)
  values(actor,'verification_'||p_decision::text,'duel_verification',p_verification_id,nullif(trim(p_reason),''),jsonb_build_object('duel_id',target_duel,'verified_fields',p_verified_fields));
end;
$$;

create or replace function public.admin_moderate_duel(p_duel_id uuid, p_decision text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.assert_admin(); product_slug text;
begin
  if p_decision not in ('open','rejected') then raise exception 'Invalid moderation decision' using errcode='22023'; end if;
  if p_decision='open' then
    select sp.slug into product_slug from public.duels d join public.software_products sp on sp.id=d.current_software_product_id where d.id=p_duel_id;
    update public.duels set status='open', slug=coalesce(slug,product_slug||'-duel-'||public_id::text), published_at=coalesce(published_at,now())
    where id=p_duel_id and status='pending_verification';
  else
    update public.duels set status='rejected', closed_at=now() where id=p_duel_id and status in ('draft','pending_verification','open');
  end if;
  if not found then raise exception 'Duel cannot be moderated from its current state' using errcode='55000'; end if;
  insert into public.admin_actions(admin_user_id,action,target_type,target_id,reason,metadata)
  values(actor,'duel_'||p_decision,'duel',p_duel_id,nullif(trim(p_reason),''),'{}');
end;
$$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_status public.report_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.assert_admin();
begin
  if p_status not in ('investigating','resolved','dismissed') then raise exception 'Invalid report status' using errcode='22023'; end if;
  update public.reports set status=p_status, assigned_to=actor,
    resolved_at=case when p_status in ('resolved','dismissed') then now() else null end where id=p_report_id;
  if not found then raise exception 'Report not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_user_id,action,target_type,target_id,reason,metadata)
  values(actor,'report_'||p_status::text,'report',p_report_id,nullif(trim(p_reason),''),'{}');
end;
$$;

create or replace function public.admin_set_user_suspension(p_user_id uuid, p_suspended boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.assert_admin();
begin
  if p_user_id=actor then raise exception 'Administrators cannot suspend themselves' using errcode='22023'; end if;
  if p_suspended and nullif(trim(p_reason),'') is null then raise exception 'A suspension reason is required' using errcode='22023'; end if;
  update public.users set suspended_at=case when p_suspended then now() else null end where id=p_user_id and system_role='user';
  if not found then raise exception 'Eligible user not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_user_id,action,target_type,target_id,reason,metadata)
  values(actor,case when p_suspended then 'user_suspended' else 'user_restored' end,'user',p_user_id,nullif(trim(p_reason),''),'{}');
end;
$$;

create or replace function public.admin_record_refund(p_payment_id uuid, p_provider_refund_id text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.assert_admin();
begin
  update public.payments set status='refunded', refunded_at=now() where id=p_payment_id and status='paid';
  if not found then raise exception 'Paid payment not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_user_id,action,target_type,target_id,reason,metadata)
  values(actor,'payment_refunded','payment',p_payment_id,nullif(trim(p_reason),''),jsonb_build_object('provider_refund_id',p_provider_refund_id));
end;
$$;

create or replace function public.admin_dashboard_metrics()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.current_user_is_admin() then jsonb_build_object(
    'users',(select count(*) from public.users),
    'qualified_duels',(select count(*) from public.duels where status not in ('draft','pending_verification','rejected')),
    'open_duels',(select count(*) from public.duels where status='open'),
    'submitted_offers',(select count(*) from public.offers where status in ('submitted','selected','not_selected')),
    'introductions',(select count(*) from public.introductions where status in ('paid','introduced')),
    'revenue_cents',(select coalesce(sum(amount),0) from public.payments where status='paid'),
    'confirmed_savings',(select coalesce(sum(d.annual_spend-o.final_annual_price),0) from public.deal_outcomes o join public.introductions i on i.id=o.introduction_id join public.selections s on s.id=i.selection_id join public.duels d on d.id=s.duel_id where o.confirmed_at is not null and o.final_annual_price<d.annual_spend),
    'pending_vendors',(select count(*) from public.vendor_profiles where approval_status='pending'),
    'pending_verifications',(select count(*) from public.duel_verifications where status='pending'),
    'open_reports',(select count(*) from public.reports where status in ('open','investigating'))
  ) else null end;
$$;

revoke all on function public.assert_admin() from public, anon, authenticated;
revoke all on function public.admin_review_vendor(uuid,public.vendor_approval_status,text) from public, anon;
revoke all on function public.admin_review_verification(uuid,public.verification_status,text[],text) from public, anon;
revoke all on function public.admin_moderate_duel(uuid,text,text) from public, anon;
revoke all on function public.admin_resolve_report(uuid,public.report_status,text) from public, anon;
revoke all on function public.admin_set_user_suspension(uuid,boolean,text) from public, anon;
revoke all on function public.admin_record_refund(uuid,text,text) from public, anon;
revoke all on function public.admin_dashboard_metrics() from public, anon;
grant execute on function public.admin_review_vendor(uuid,public.vendor_approval_status,text), public.admin_review_verification(uuid,public.verification_status,text[],text), public.admin_moderate_duel(uuid,text,text), public.admin_resolve_report(uuid,public.report_status,text), public.admin_set_user_suspension(uuid,boolean,text), public.admin_record_refund(uuid,text,text), public.admin_dashboard_metrics() to authenticated;

commit;
