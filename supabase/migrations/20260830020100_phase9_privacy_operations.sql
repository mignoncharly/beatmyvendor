begin;

create or replace function public.admin_review_data_request(p_request_id uuid,p_status public.data_request_status,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := public.assert_admin();
begin
  if p_status not in ('processing','completed','rejected') then raise exception 'Invalid request state' using errcode='22023'; end if;
  update public.data_subject_requests set status=p_status,
    acknowledged_at=coalesce(acknowledged_at,now()),
    completed_at=case when p_status in ('completed','rejected') then now() else null end,
    rejection_reason=case when p_status='rejected' then nullif(trim(p_reason),'') else null end
  where id=p_request_id and status in ('pending','processing');
  if not found then raise exception 'Active data request not found' using errcode='P0002'; end if;
  insert into public.admin_actions(admin_user_id,action,target_type,target_id,reason,metadata)
  values(actor,'data_request_'||p_status::text,'data_subject_request',p_request_id,nullif(trim(p_reason),''),'{}');
end;
$$;

revoke all on function public.admin_review_data_request(uuid,public.data_request_status,text) from public,anon;
grant execute on function public.admin_review_data_request(uuid,public.data_request_status,text) to authenticated;

commit;
