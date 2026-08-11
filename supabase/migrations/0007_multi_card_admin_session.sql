-- ============================================
-- Migration 0007: Multi-Card system + Admin session sharing
--
-- 1. user_cards: allow MULTIPLE cards per user (was 1 card / user)
--    - Drop user_id PRIMARY KEY, add surrogate id PK + unique(user_id, card_id)
-- 2. claim_free_card: only one free card per user, but user can hold more
-- 3. confirm_order: ADD a new card per pack purchase (don't replace existing)
-- 4. admin_assign_free_card: assign a free card, one free card per user
-- 5. my_cards() / cards_for_me() / my_overview(): return all user's cards
-- 6. admin_login: share an existing active session instead of SESSION_ACTIVE error
-- ============================================

-- ------------------------------------------------------------
-- 1. USER_CARDS — allow multiple cards per user
-- ------------------------------------------------------------
alter table public.user_cards drop constraint if exists user_cards_pkey;

-- add surrogate id if missing
alter table public.user_cards add column if not exists id uuid;
update public.user_cards set id = extensions.gen_random_uuid() where id is null;
alter table public.user_cards alter column id set not null;
alter table public.user_cards add constraint user_cards_pkey primary key (id);

-- allow multiple cards per user (unique per user+card)
alter table public.user_cards drop constraint if exists user_cards_user_card_unique;
alter table public.user_cards add constraint user_cards_user_card_unique unique (user_id, card_id);

-- ------------------------------------------------------------
-- 2. MY_CARDS — return ALL user's cards (multi-card)
-- ------------------------------------------------------------
create or replace function public.my_cards()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select coalesce(json_agg(
    json_build_object(
      'card_id', c.id,
      'card_number', c.card_number,
      'cardholder_name', c.cardholder_name,
      'expiry', c.expiry,
      'cvv', c.cvv,
      'provider', c.provider,
      'tier', c.tier,
      'label', c.label,
      'balance_usd', c.balance_usd,
      'pack_id', uc.pack_id,
      'pack_name', coalesce(p.name, initcap(c.tier)),
      'created_at', c.created_at
    ) order by uc.created_at desc
  ), '[]'::json) into v_result
  from public.user_cards uc
  join public.cards c on c.id = uc.card_id
  left join public.packs p on p.id = uc.pack_id
  where uc.user_id = auth.uid();

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- 3. CARDS_FOR_ME — used by CardsPage; returns all user's cards
-- ------------------------------------------------------------
drop function if exists public.cards_for_me();
drop function if exists public.my_overview();
drop function if exists public.my_cards();

create or replace function public.cards_for_me()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select coalesce(json_agg(
    json_build_object(
      'id', c.id,
      'card_number', c.card_number,
      'cardholder_name', c.cardholder_name,
      'expiry', c.expiry,
      'cvv', c.cvv,
      'provider', c.provider,
      'tier', c.tier,
      'label', c.label,
      'balance_usd', c.balance_usd,
      'created_at', c.created_at,
      'unlocked', true
    ) order by uc.created_at desc
  ), '[]'::json) into v_result
  from public.user_cards uc
  join public.cards c on c.id = uc.card_id
  where uc.user_id = auth.uid();

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- 4. MY_OVERVIEW — used by CardsPage; returns card count + balance
-- ------------------------------------------------------------
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
begin
  select count(*), coalesce(sum(c.balance_usd), 0)
    into v_count, v_balance
  from public.user_cards uc
  join public.cards c on c.id = uc.card_id
  where uc.user_id = auth.uid();

  return json_build_object(
    'card_limit', greatest(v_count, 1),
    'card_count', v_count,
    'total_balance', v_balance
  );
end;
$$;

-- ------------------------------------------------------------
-- 5. CLAIM_FREE_CARD — one free card per user, keeps other cards
-- ------------------------------------------------------------
create or replace function public.claim_free_card()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cards  uuid[];
  v_card   public.cards%rowtype;
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

  insert into public.user_cards (user_id, card_id, pack_id)
  values (auth.uid(), v_card.id, 'free');

  return (select public.my_cards());
end;
$$;

-- ------------------------------------------------------------
-- 6. CONFIRM_ORDER — ADD a new card per pack (multi-card)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 7. ADMIN_ASSIGN_FREE_CARD — one free card per user (multi-card)
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

  -- add a new assignment (keep existing cards)
  insert into user_cards (user_id, card_id, pack_id, created_at, updated_at)
  values (p_user_id, v_card_id, 'free', now(), now());

  return jsonb_build_object(
    'success', true,
    'card_id', v_card_id,
    'user_id', p_user_id
  );
end;
$$;

-- ------------------------------------------------------------
-- 8. ADMIN_LOGIN — share an existing active session (multi-device)
-- ------------------------------------------------------------
create or replace function public.admin_login(p_code text, p_force boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip       text    := coalesce(public.vs_client_ip(), 'unknown');
  v_ip_hash  text    := encode(extensions.digest('ip:' || v_ip, 'sha256'), 'hex');
  v_code     public.admin_codes%rowtype;
  v_token    text;
  v_expires  timestamptz;
  v_open     int;
  v_lock     timestamptz;
begin
  -- Enforce cooldown regardless of code correctness
  select g.locked_until into v_lock
    from public.login_guard g
   where g.ip_hash = v_ip_hash
   limit 1;

  if v_lock is not null and v_lock > now() then
    return json_build_object(
      'ok', false,
      'error', 'COOLDOWN',
      'retry_after', round(extract(epoch from (v_lock - now())))::int
    );
  end if;

  if p_code is null or p_code !~ '^[0-9]{6}$' then
    perform public.vs_register_fail(v_ip_hash);
    return json_build_object('ok', false, 'error', 'INVALID_CODE');
  end if;

  perform public.vs_expire_stale_sessions();

  select * into v_code
    from public.admin_codes c
   where coalesce(c.is_active, true)
     and public.vs_code_matches(p_code, c.code_hash)
   limit 1;

  if v_code.id is null then
    perform public.vs_register_fail(v_ip_hash);
    return json_build_object('ok', false, 'error', 'INVALID_CODE');
  end if;

  -- Success: clear lockout for this IP
  delete from public.login_guard where ip_hash = v_ip_hash;

  -- Check for an existing active session
  select count(*) into v_open
    from public.code_sessions s
   where s.code_id = v_code.id and s.is_active and s.expires_at > now();

  if v_open > 0 then
    -- SHARE the existing active session across devices (no SESSION_ACTIVE error)
    select s.session_token, s.expires_at into v_token, v_expires
      from public.code_sessions s
     where s.code_id = v_code.id and s.is_active and s.expires_at > now()
     order by s.created_at desc
     limit 1;

    return json_build_object(
      'ok', true,
      'session_token', v_token,
      'code_id', v_code.id,
      'label', v_code.label,
      'expires_at', v_expires,
      'shared', true
    );
  end if;

  v_token   := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := now() + interval '2 hours';

  insert into public.code_sessions (code_id, session_token, is_active, expires_at)
  values (v_code.id, v_token, true, v_expires);

  update public.admin_codes set last_used_at = now() where id = v_code.id;

  return json_build_object(
    'ok', true,
    'session_token', v_token,
    'code_id', v_code.id,
    'label', v_code.label,
    'expires_at', v_expires,
    'shared', false
  );
end;
$$;

-- Refresh the PostgREST schema cache
NOTIFY pgrst, 'reload schema';