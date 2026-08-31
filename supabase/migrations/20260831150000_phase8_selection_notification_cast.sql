begin;

-- PostgreSQL does not implicitly coerce a bare text literal to an enum in an
-- INSERT ... SELECT. The VALUES notification rows worked, but the fan-out rows
-- made both review and selection fail atomically once those paths were reached.
create or replace function public.start_buyer_review(p_duel_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  submitted_count integer;
  buyer_organization_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select d.buyer_organization_id into buyer_organization_id
  from public.duels d
  where d.id = p_duel_id
    and d.status = 'open'
    and d.submission_deadline <= now()
    and public.is_organization_member(d.buyer_organization_id)
  for update;
  if buyer_organization_id is null then
    raise exception 'The duel is not ready for review' using errcode = '55000';
  end if;

  update public.duels set status = 'reviewing' where id = p_duel_id;
  select count(*) into submitted_count
  from public.offers where duel_id = p_duel_id and status = 'submitted';

  insert into public.notifications (organization_id, channel, template_key, payload)
  values (buyer_organization_id, 'in_app', 'offers_ready', jsonb_build_object('duel_id', p_duel_id, 'offer_count', submitted_count));
  insert into public.notifications (organization_id, channel, template_key, payload)
  select distinct o.vendor_organization_id, 'in_app'::public.notification_channel,
    'duel_closed', jsonb_build_object('duel_id', p_duel_id)
  from public.offers o where o.duel_id = p_duel_id;

  return submitted_count;
end;
$$;

create or replace function public.select_buyer_offer(p_duel_id uuid, p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  buyer_organization_id uuid;
  selected_vendor_organization_id uuid;
  saved_selection_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select d.buyer_organization_id, o.vendor_organization_id
    into buyer_organization_id, selected_vendor_organization_id
  from public.duels d
  join public.offers o on o.duel_id = d.id
  where d.id = p_duel_id
    and o.id = p_offer_id
    and d.status = 'reviewing'
    and o.status = 'submitted'
    and o.valid_until > now()
    and public.is_organization_member(d.buyer_organization_id)
  for update of d, o;
  if buyer_organization_id is null then
    if exists (
      select 1 from public.offers o
      where o.id = p_offer_id and o.duel_id = p_duel_id
        and o.status = 'submitted' and o.valid_until <= now()
    ) then
      raise exception 'This offer has expired. Ask the vendor for a refreshed offer before selecting.' using errcode = '55000';
    end if;
    raise exception 'This offer cannot be selected' using errcode = '23514';
  end if;

  insert into public.selections (duel_id, offer_id, selected_by)
  values (p_duel_id, p_offer_id, actor_id)
  returning id into saved_selection_id;

  insert into public.notifications (organization_id, channel, template_key, payload)
  values
    (buyer_organization_id, 'in_app', 'selection_confirmed', jsonb_build_object('duel_id', p_duel_id, 'offer_id', p_offer_id)),
    (selected_vendor_organization_id, 'in_app', 'challenge_selected', jsonb_build_object('duel_id', p_duel_id, 'offer_id', p_offer_id));
  insert into public.notifications (organization_id, channel, template_key, payload)
  select distinct o.vendor_organization_id, 'in_app'::public.notification_channel,
    'challenge_not_selected', jsonb_build_object('duel_id', p_duel_id, 'offer_id', o.id)
  from public.offers o
  where o.duel_id = p_duel_id and o.id <> p_offer_id and o.status = 'not_selected';

  return saved_selection_id;
end;
$$;

comment on function public.select_buyer_offer(uuid,uuid)
is 'Atomically locks a buyer selection, finalizes offer statuses, creates the pending introduction, and notifies all participants.';

commit;
