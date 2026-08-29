begin;

revoke execute on function public.save_buyer_duel(
  uuid, uuid, uuid, uuid, text, numeric, public.billing_frequency, text,
  integer, integer, numeric, date, integer, text, text, text,
  public.buyer_intent, text, timestamptz, jsonb, boolean
) from anon;

commit;
