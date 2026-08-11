-- ============================================================================
-- 0011_fifo_seq.sql
-- Deterministic FIFO card pool order.
-- A bigserial `seq` preserves the exact order cards were added by the admin,
-- even for bulk inserts that share the same created_at timestamp.
-- claim_free_card / confirm_order / admin_assign_free_card now pick the
-- lowest seq first, so "100 cards added -> 100 users get them one-by-one ->
-- user #101 gets NO_FREE_CARDS and must upgrade".
-- ============================================================================

alter table public.cards add column if not exists seq bigserial;

create index if not exists cards_pool_order_idx on public.cards (tier, seq);

-- ----------------------------------------------------------------------------
-- claim_free_card: FIFO by seq
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

  -- FIFO: lowest seq (insertion order) first
  select array_agg(id order by c.seq asc, c.created_at asc, c.id asc) into v_cards
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
-- admin_assign_free_card: FIFO by seq
-- ----------------------------------------------------------------------------
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
  perform public.vs_admin_code_id(p_token);

  if exists (
    select 1 from public.user_cards uc
    join public.cards c on c.id = uc.card_id
    where uc.user_id = p_user_id and c.tier = 'free'
  ) then
    raise exception 'USER_ALREADY_HAS_FREE_CARD' using errcode = '22000';
  end if;

  select c.id into v_card_id
  from public.cards c
  where c.tier = 'free'
    and c.is_active
    and not exists (select 1 from public.user_cards uc where uc.card_id = c.id)
  order by c.seq asc, c.created_at asc, c.id asc
  limit 1;

  if v_card_id is null then
    raise exception 'NO_FREE_CARDS' using errcode = '22000';
  end if;

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
-- confirm_order: FIFO by seq for paid tiers
-- ----------------------------------------------------------------------------
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
    return (select public.my_card());
  end if;

  select * into v_pack from public.packs where id = v_order.pack_id;
  if v_pack.id is null then
    raise exception 'UNKNOWN_PACK' using errcode = '22000';
  end if;

  -- FIFO: lowest seq (insertion order) first
  select array_agg(c.id order by c.seq asc, c.created_at asc, c.id asc) into v_cards
    from public.cards c
   where c.is_active
     and c.tier = v_pack.id
     and not exists (select 1 from public.user_cards uc where uc.card_id = c.id);

  if v_cards is null or cardinality(v_cards) = 0 then
    raise exception 'NO_CARD_AVAILABLE' using errcode = '22000';
  end if;

  v_card := (select * from public.cards where id = v_cards[1]);

  delete from public.user_cards where user_id = auth.uid();

  insert into public.user_cards (user_id, card_id, pack_id)
  values (auth.uid(), v_card.id, v_pack.id);

  update public.orders set
    status = 'paid',
    gateway = coalesce(p_gateway, gateway),
    gateway_ref = coalesce(p_gateway_ref, gateway_ref),
    paid_at = now()
  where id = p_order_id;

  update public.profiles set plan_type = v_pack.name where id = auth.uid();

  return (select public.my_card());
end;
$$;
