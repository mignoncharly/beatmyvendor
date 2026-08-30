begin;

create or replace function public.claim_email_notifications(p_limit integer default 25)
returns table (
  notification_id uuid,
  template_key text,
  payload jsonb,
  recipient_email text,
  recipient_name text,
  organization_name text,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n
  set
    status = case
      when n.attempts >= 5 then 'failed'::public.notification_status
      else 'pending'::public.notification_status
    end,
    processing_started_at = null,
    last_error = case
      when n.attempts >= 5 then coalesce(n.last_error, 'Delivery worker timed out.')
      else n.last_error
    end
  where n.channel = 'email'
    and n.status = 'processing'
    and n.processing_started_at < now() - interval '15 minutes';

  return query
  with due as (
    select n.id
    from public.notifications n
    where n.channel = 'email'
      and n.status = 'pending'
      and n.scheduled_at <= now()
      and n.attempts < 5
    order by n.scheduled_at, n.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ),
  claimed as (
    update public.notifications n
    set
      status = 'processing',
      attempts = n.attempts + 1,
      processing_started_at = now(),
      last_error = null
    from due
    where n.id = due.id
    returning n.*
  )
  select
    c.id,
    c.template_key,
    c.payload,
    coalesce(direct_user.email::text, organization_owner.email::text),
    coalesce(direct_user.display_name, organization_owner.display_name),
    organization.name,
    c.attempts
  from claimed c
  left join public.users direct_user on direct_user.id = c.user_id
  left join public.organizations organization on organization.id = c.organization_id
  left join lateral (
    select member_user.email, member_user.display_name
    from public.organization_members membership
    join public.users member_user on member_user.id = membership.user_id
    where membership.organization_id = c.organization_id
      and member_user.suspended_at is null
    order by
      case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      membership.created_at
    limit 1
  ) organization_owner on true;
end;
$$;

create or replace function public.mark_email_notification_failed(
  p_notification_id uuid,
  p_error text,
  p_retryable boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n
  set
    status = case
      when coalesce(p_retryable, false) and n.attempts < 5 then 'pending'::public.notification_status
      else 'failed'::public.notification_status
    end,
    scheduled_at = case
      when coalesce(p_retryable, false) and n.attempts < 5
        then now() + make_interval(mins => least(60, (2 ^ n.attempts)::integer))
      else n.scheduled_at
    end,
    processing_started_at = null,
    last_error = left(coalesce(nullif(trim(p_error), ''), 'Email delivery failed.'), 1000)
  where n.id = p_notification_id and n.channel = 'email' and n.status = 'processing';
  if not found then
    raise exception 'Claimed email notification not found' using errcode = 'P0002';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
