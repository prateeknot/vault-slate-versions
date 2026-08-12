-- 0017_security_round2b.sql — round-2 follow-up hardening
--
-- 1) create_order: clients can no longer spam unlimited pending orders
--    (the mock checkout was its only consumer; the Telegram bot assigns via its
--    own /api/get-card backend). Keep at most ONE pending order per user — old
--    pending orders are replaced by the newest.
create or replace function public.create_order(p_pack_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack  public.packs%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_pack from public.packs where id = p_pack_id and is_active;
  if v_pack.id is null then
    raise exception 'UNKNOWN_PACK' using errcode = '22000';
  end if;

  delete from public.orders
   where user_id = auth.uid() and status = 'pending';

  insert into public.orders (user_id, pack_id, amount_inr, status)
  values (auth.uid(), v_pack.id, v_pack.price_inr, 'pending')
  returning * into v_order;

  return json_build_object(
    'order_id', v_order.id,
    'pack_id', v_order.pack_id,
    'amount_inr', v_order.amount_inr,
    'status', v_order.status
  );
end;
$$;

grant execute on function public.create_order(text) to authenticated;

-- 2) user_cards direct UPDATE: restrict to metadata columns only (note,
--    is_favorite) — users must NOT be able to flip card_id/pack_id on their own
--    row. my_card_update (security definer) is unaffected.
revoke update on public.user_cards from anon, authenticated;
grant update (note, is_favorite) on public.user_cards to authenticated;
