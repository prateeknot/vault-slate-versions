-- ============================================
-- Migration 0008: Free card random balance + pack card balance enforcement
--
-- 1. claim_free_card: assign free card with RANDOM balance ($1-$15)
-- 2. admin_assign_free_card: same random balance for admin-assigned free cards
-- 3. confirm_order: ensure card gets EXACT pack balance_usd
-- ============================================

-- ------------------------------------------------------------
-- 1. CLAIM_FREE_CARD — one free card per user, RANDOM balance
-- ------------------------------------------------------------
drop function if exists public.claim_free_card();

create or replace function public.claim_free_card()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cards  uuid[];
  v_card   public.cards%rowtype;
  v_random_balance numeric;
begin
  -- only one free card per user
  if exists (
    select 1 from public.user_cards uc
    join public.cards c on c.id = uc.card_id
    where uc.user_id = auth.uid() and c.tier = 'free'
  ) then
    return (select public.my_cards());
  end if;

  select array_agg(id order by created_at asc, id asc) into v_cards
    from public.cards c
   where c.is_active
     and c.tier = 'free'
     and not exists (select 1 from public.user_cards uc where uc.card_id = c.id);

  if v_cards is null or cardinality(v_cards) = 0 then
    return null;
  end if;

  select * into v_card from public.cards where id = v_cards[1];

  -- Generate RANDOM balance between $1 and $15 (rounded to 2 decimals)
  v_random_balance := round((random() * 14 + 1)::numeric, 2);

  -- Update the card with random balance
  update public.cards set balance_usd = v_random_balance where id = v_card.id;

  insert into public.user_cards (user_id, card_id, pack_id)
  values (auth.uid(), v_card.id, 'free');

  return (select public.my_cards());
end;
$$;

-- ------------------------------------------------------------
-- 2. ADMIN_ASSIGN_FREE_CARD — random balance for admin-assigned free cards
-- ------------------------------------------------------------
drop function if exists public.admin_assign_free_card(uuid, uuid);

create or replace function public.admin_assign_free_card(
  p_token  uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id  uuid;
  v_card_id   uuid;
  v_random_balance numeric;
begin
  -- Auth: validate admin token
  select user_id into v_admin_id
  from admin_sessions
  where session_token = p_token
    and is_active = true
    and (expires_at is null or expires_at > now());

  if v_admin_id is null then
    raise exception 'Invalid or expired admin token';
  end if;

  -- only one free card per user
  if exists (
    select 1 from public.user_cards uc
    join public.cards c on c.id = uc.card_id
    where uc.user_id = p_user_id and c.tier = 'free'
  ) then
    raise exception 'User already has a free card';
  end if;

  -- pick first unassigned free card
  select c.id into v_card_id
  from cards c
  where c.tier = 'free'
    and c.is_active = true
    and not exists (
      select 1 from user_cards uc where uc.card_id = c.id
    )
  order by c.created_at asc
  limit 1;

  if v_card_id is null then
    raise exception 'No unassigned free cards available';
  end if;

  -- Generate RANDOM balance between $1 and $15
  v_random_balance := round((random() * 14 + 1)::numeric, 2);

  -- Update the card with random balance
  update public.cards set balance_usd = v_random_balance where id = v_card_id;

  -- add a new assignment (keep existing cards)
  insert into user_cards (user_id, card_id, pack_id, created_at, updated_at)
  values (p_user_id, v_card_id, 'free', now(), now());

  return jsonb_build_object(
    'success', true,
    'card_id', v_card_id,
    'user_id', p_user_id,
    'balance_usd', v_random_balance
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. CONFIRM_ORDER — ensure card gets EXACT pack balance
-- ------------------------------------------------------------
drop function if exists public.confirm_order(uuid, text, text);

create or replace function public.confirm_order(p_order_id uuid, p_gateway text default null, p_gateway_ref text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_pack  public.packs%rowtype;
  v_card  public.cards%rowtype;
  v_cards uuid[];
begin
  select * into v_order from public.orders where id = p_order_id and user_id = auth.uid();
  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = '22000';
  end if;
  if v_order.status = 'paid' then
    return (select public.my_cards());
  end if;

  select * into v_pack from public.packs where id = v_order.pack_id;
  if v_pack.id is null then
    raise exception 'UNKNOWN_PACK' using errcode = '22000';
  end if;

  -- if user already owns this pack tier, just mark paid (no duplicate card)
  if exists (
    select 1 from public.user_cards uc
    join public.cards c on c.id = uc.card_id
    where uc.user_id = auth.uid() and c.tier = v_pack.id
  ) then
    update public.orders set
      status = 'paid',
      gateway = coalesce(p_gateway, gateway),
      gateway_ref = coalesce(p_gateway_ref, gateway_ref),
      paid_at = now()
    where id = p_order_id;
    return (select public.my_cards());
  end if;

  -- find an unassigned active card of this tier
  select array_agg(id order by created_at asc, id asc) into v_cards
    from public.cards c
   where c.is_active
     and c.tier = v_pack.id
     and not exists (select 1 from public.user_cards uc where uc.card_id = c.id);

  if v_cards is null or cardinality(v_cards) = 0 then
    raise exception 'NO_CARD_AVAILABLE' using errcode = '22000';
  end if;

  select * into v_card from public.cards where id = v_cards[1];

  -- ENSURE the card has the EXACT pack balance
  update public.cards set balance_usd = v_pack.balance_usd where id = v_card.id;

  -- ADD a new card (keep existing cards)
  insert into public.user_cards (user_id, card_id, pack_id)
  values (auth.uid(), v_card.id, v_pack.id);

  update public.orders set
    status = 'paid',
    gateway = coalesce(p_gateway, gateway),
    gateway_ref = coalesce(p_gateway_ref, gateway_ref),
    paid_at = now()
  where id = p_order_id;

  update public.profiles set plan_type = v_pack.name where id = auth.uid();

  return (select public.my_cards());
end;
$$;

-- Refresh the PostgREST schema cache
NOTIFY pgrst, 'reload schema';