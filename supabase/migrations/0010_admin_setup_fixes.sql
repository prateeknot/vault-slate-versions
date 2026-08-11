-- ============================================================================
-- 0010_admin_setup_fixes.sql
-- Fixes found in the 2026-08-11 full audit:
--   1. admin_assign_free_card was validating against the OLD admin_sessions
--      table with a uuid token while every live admin RPC uses code_sessions
--      (text token from admin_login). The admin "Assign free card" button
--      therefore always failed. Now uses code_sessions like all other RPCs.
--   2. my_overview returned card_limit = greatest(v_count, 1) i.e. the user's
--      CURRENT card count instead of the plan limit. Now reads plan_limits.
--   3. claim_free_card returned NULL when the free pool was empty; the
--      frontend showed a misleading success toast. Now raises NO_FREE_CARDS
--      so the UI can tell the user to upgrade.
--   4. plan_limits: Free tier card_limit 3 -> 1 (a free user gets exactly one
--      free card from the FIFO pool).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. admin_assign_free_card  -> code_sessions (text token) + FIFO + random balance
-- ----------------------------------------------------------------------------
drop function if exists public.admin_assign_free_card(uuid, uuid);
drop function if exists public.admin_assign_free_card(text, uuid);

create or replace function public.admin_assign_free_card(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id        uuid;
  v_random_balance numeric;
begin
  -- Auth: live admin session (code_sessions), same as every other admin RPC
  perform public.vs_admin_code_id(p_token);

  -- only one free card per user
  if exists (
    select 1 from public.user_cards uc
    join public.cards c on c.id = uc.card_id
    where uc.user_id = p_user_id and c.tier = 'free'
  ) then
    raise exception 'USER_ALREADY_HAS_FREE_CARD' using errcode = '22000';
  end if;

  -- FIFO: oldest unassigned active free card first
  select c.id into v_card_id
  from public.cards c
  where c.tier = 'free'
    and c.is_active
    and not exists (select 1 from public.user_cards uc where uc.card_id = c.id)
  order by c.created_at asc, c.id asc
  limit 1;

  if v_card_id is null then
    raise exception 'NO_FREE_CARDS' using errcode = '22000';
  end if;

  -- random balance between $1 and $15
  v_random_balance := round((random() * 14 + 1)::numeric, 2);
  update public.cards set balance_usd = v_random_balance where id = v_card_id;

  insert into public.user_cards (user_id, card_id, pack_id, created_at, updated_at)
  values (p_user_id, v_card_id, 'free', now(), now());

  return jsonb_build_object(
    'success', true,
    'card_id', v_card_id,
    'user_id', p_user_id,
    'balance_usd', v_random_balance
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. my_overview -> real card_limit from plan_limits
-- ----------------------------------------------------------------------------
create or replace function public.my_overview()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count   int;
  v_balance numeric;
  v_plan    text;
  v_limit   int;
begin
  select count(*), coalesce(sum(c.balance_usd), 0)
    into v_count, v_balance
  from public.user_cards uc
  join public.cards c on c.id = uc.card_id
  where uc.user_id = auth.uid();

  select lower(coalesce(plan_type, 'free')) into v_plan
    from public.profiles where id = auth.uid();

  select card_limit into v_limit
    from public.plan_limits
   where lower(plan_type) = v_plan
   limit 1;

  v_limit := coalesce(v_limit, greatest(v_count, 1));

  return json_build_object(
    'card_limit', v_limit,
    'card_count', v_count,
    'total_balance', v_balance
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. claim_free_card -> raise NO_FREE_CARDS when the free pool is exhausted
-- ----------------------------------------------------------------------------
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

  -- FIFO: oldest unassigned active free card first
  select array_agg(id order by created_at asc, id asc) into v_cards
    from public.cards c
   where c.is_active
     and c.tier = 'free'
     and not exists (select 1 from public.user_cards uc where uc.card_id = c.id);

  if v_cards is null or cardinality(v_cards) = 0 then
    raise exception 'NO_FREE_CARDS' using errcode = '22000';
  end if;

  select * into v_card from public.cards where id = v_cards[1];

  v_random_balance := round((random() * 14 + 1)::numeric, 2);
  update public.cards set balance_usd = v_random_balance where id = v_card.id;

  insert into public.user_cards (user_id, card_id, pack_id)
  values (auth.uid(), v_card.id, 'free');

  return (select public.my_cards());
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. plan_limits: Free tier = 1 card
-- ----------------------------------------------------------------------------
update public.plan_limits
   set card_limit = 1, updated_at = now()
 where lower(plan_type) = 'free';
