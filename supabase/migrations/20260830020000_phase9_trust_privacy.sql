begin;

create type public.data_request_kind as enum ('access','deletion');
create type public.data_request_status as enum ('pending','processing','completed','rejected');

create table public.data_subject_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind public.data_request_kind not null,
  status public.data_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  rejection_reason text
);

create table public.consent_records (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  purpose text not null check (purpose in ('public_win_buyer','public_win_vendor','marketing_email')),
  policy_version text not null,
  granted boolean not null,
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  check (user_id is not null or organization_id is not null)
);

create index data_requests_queue_idx on public.data_subject_requests(status,requested_at) where status in ('pending','processing');
create unique index data_requests_one_active_idx on public.data_subject_requests(user_id,kind) where status in ('pending','processing');
create index consent_records_subject_idx on public.consent_records(user_id,organization_id,purpose,recorded_at desc);

alter table public.data_subject_requests enable row level security;
alter table public.consent_records enable row level security;
create policy data_requests_owner_read on public.data_subject_requests for select to authenticated using (user_id=(select auth.uid()) or public.current_user_is_admin());
create policy consent_owner_read on public.consent_records for select to authenticated using (user_id=(select auth.uid()) or (organization_id is not null and public.is_organization_member(organization_id)) or public.current_user_is_admin());
create policy consent_owner_insert on public.consent_records for insert to authenticated with check (user_id=(select auth.uid()) and (organization_id is null or public.is_organization_member(organization_id)));

create or replace function public.request_personal_data_action(p_kind public.data_request_kind)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); request_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into request_id from public.data_subject_requests where user_id=actor and kind=p_kind and status in ('pending','processing') limit 1;
  if request_id is not null then return request_id; end if;
  insert into public.data_subject_requests(user_id,kind) values(actor,p_kind) returning id into request_id;
  insert into public.notifications(user_id,channel,template_key,payload) values(actor,'in_app','data_request_received',jsonb_build_object('request_id',request_id,'kind',p_kind));
  return request_id;
end;
$$;

create or replace function public.record_user_consent(p_organization_id uuid,p_purpose text,p_policy_version text,p_granted boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); consent_id uuid;
begin
  if actor is null or (p_organization_id is not null and not public.is_organization_member(p_organization_id)) then raise exception 'Not permitted' using errcode='42501'; end if;
  if p_purpose not in ('public_win_buyer','public_win_vendor','marketing_email') then raise exception 'Invalid consent purpose' using errcode='22023'; end if;
  insert into public.consent_records(user_id,organization_id,purpose,policy_version,granted,withdrawn_at)
  values(actor,p_organization_id,p_purpose,p_policy_version,p_granted,case when p_granted then null else now() end) returning id into consent_id;
  return consent_id;
end;
$$;

revoke all on function public.request_personal_data_action(public.data_request_kind) from public,anon;
revoke all on function public.record_user_consent(uuid,text,text,boolean) from public,anon;
grant execute on function public.request_personal_data_action(public.data_request_kind), public.record_user_consent(uuid,text,text,boolean) to authenticated;

revoke insert,update,delete on public.data_subject_requests from authenticated;
revoke update,delete on public.consent_records from authenticated;
grant select on public.data_subject_requests,public.consent_records to authenticated;

comment on table public.data_subject_requests is 'Auditable workflow for personal-data access and deletion requests; completion remains a reviewed service-role operation.';
comment on table public.consent_records is 'Append-only consent receipts. Withdrawal creates a new negative record rather than rewriting history.';

commit;
