-- ============================================
-- Migration 0009: Admin Panel feature RPCs
--
-- Adds the backend functions the new admin features need:
--   1. admin_orders_list            → full order list (with user + pack info)
--   2. admin_order_set_status       → mark order paid/failed/refunded/pending
--   3. admin_user_cards             → every card a user owns
--   4. admin_remove_user_card       → revoke a card from a user
--   5. admin_assign_card            → assign a card of a chosen tier to a user
--   6. admin_toggle_user_status     → suspend / activate a user (login block)
--   7. admin_set_user_plan          → set profiles.plan_type to a pack tier
--   8. admin_pack_set               → create/update a pack (price, balance…)
--   9. admin_inventory              → per-tier stock: total/active/assigned/available
--
-- All functions are gated by the SAME active admin session token that
-- public.admin_login() issues (stored in public.code_sessions).
-- To apply: Supabase → SQL Editor → paste & run (project: card-vault).
-- ============================================

-- ------------------------------------------------------------
-- 1. ORDERS LIST — money trail
-- ------------------------------------------------------------
drop function if exists public.admin_orders_list(text);

create or replace function public.admin_orders_list(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  return (
    select coalesce(json_agg(
      json_build_object(
        'id', o.id,
        'user_id', o.user_id,
        'user_email', coalesce(p.email, ''),
        'display_name', coalesce(p.display_name, ''),
        'pack_id', o.pack_id,
        'pack_name', coalesce(pk.name, o.pack_id),
        'amount_inr', o.amount_inr,
        'status', o.status,
        'gateway', o.gateway,
        'gateway_ref', o.gateway_ref,
        'created_at', o.created_at,
        'paid_at', o.paid_at
      ) order by o.created_at desc
    ), '[]'::json)
    from public.orders o
    left join public.profiles p on p.id = o.user_id
    left join public.packs pk on pk.id = o.pack_id
  );
end;
$$;

-- ------------------------------------------------------------
-- 2. ORDER STATUS — mark paid / failed / refunded / pending
-- ------------------------------------------------------------
drop function if exists public.admin_order_set_status(text, uuid, text);

create or replace function public.admin_order_set_status(p_token text, p_order_id uuid, p_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  if p_status not in ('pending', 'paid', 'failed', 'refunded') then
    raise exception 'INVALID_STATUS' using errcode = '22000';
  end if;

  update public.orders set
    status = p_status,
    paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end
  where id = p_order_id;

  return json_build_object('ok', true, 'status', p_status);
end;
$$;

-- ------------------------------------------------------------
-- 3. USER CARDS — what cards does a user own
-- ------------------------------------------------------------
drop function if exists public.admin_user_cards(text, uuid);

create or replace function public.admin_user_cards(p_token text, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  return (
    select coalesce(json_agg(
      json_build_object(
        'user_card_id', uc.id,
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
        'pack_name', coalesce(pk.name, initcap(c.tier)),
        'created_at', c.created_at
      ) order by uc.created_at desc
    ), '[]'::json)
    from public.user_cards uc
    join public.cards c on c.id = uc.card_id
    left join public.packs pk on pk.id = uc.pack_id
    where uc.user_id = p_user_id
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. REMOVE USER CARD — revoke a card
-- ------------------------------------------------------------
drop function if exists public.admin_remove_user_card(text, uuid);

create or replace function public.admin_remove_user_card(p_token text, p_user_card_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  delete from public.user_cards where id = p_user_card_id;
  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- 5. ASSIGN CARD (any tier) — gift/support a user a specific tier card
-- ------------------------------------------------------------
drop function if exists public.admin_assign_card(text, uuid, text);

create or replace function public.admin_assign_card(p_token text, p_user_id uuid, p_tier text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid    uuid;
  v_card   uuid;
  v_tier   text := lower(p_tier);
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  -- one card per tier per user (consistent with confirm_order)
  if exists (
    select 1 from public.user_cards uc
    join public.cards c on c.id = uc.card_id
    where uc.user_id = p_user_id and c.tier = v_tier
  ) then
    raise exception 'USER_ALREADY_HAS_TIER' using errcode = '22000';
  end if;

  select c.id into v_card
    from public.cards c
   where c.is_active
     and c.tier = v_tier
     and not exists (select 1 from public.user_cards uc where uc.card_id = c.id)
   order by c.created_at asc, c.id asc
   limit 1;

  if v_card is null then
    raise exception 'NO_CARD_AVAILABLE' using errcode = '22000';
  end if;

  insert into public.user_cards (user_id, card_id, pack_id)
  values (p_user_id, v_card, v_tier);

  return json_build_object('ok', true, 'card_id', v_card);
end;
$$;

-- ------------------------------------------------------------
-- 6. SUSPEND / ACTIVATE USER
--    Suspending sets auth.users.banned_until (blocks login) and
--    flips profiles.is_active (used for display). Unsuspending clears both.
-- ------------------------------------------------------------
alter table public.profiles add column if not exists is_active boolean not null default true;

drop function if exists public.admin_toggle_user_status(text, uuid);

create or replace function public.admin_toggle_user_status(p_token text, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid    uuid;
  v_banned timestamptz;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  select banned_until into v_banned from auth.users where id = p_user_id;

  if v_banned is null or v_banned < now() then
    -- suspend
    update auth.users set banned_until = now() + interval '100 years' where id = p_user_id;
    update public.profiles set is_active = false where id = p_user_id;
    return json_build_object('ok', true, 'active', false);
  else
    -- activate
    update auth.users set banned_until = null where id = p_user_id;
    update public.profiles set is_active = true where id = p_user_id;
    return json_build_object('ok', true, 'active', true);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 7. SET USER PLAN (pack tier) — updates profiles.plan_type
-- ------------------------------------------------------------
drop function if exists public.admin_set_user_plan(text, uuid, text);

create or replace function public.admin_set_user_plan(p_token text, p_user_id uuid, p_plan text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  insert into public.profiles (id, email, plan_type, display_name)
  values (p_user_id, '', p_plan, '')
  on conflict (id) do update set plan_type = excluded.plan_type;

  return json_build_object('ok', true, 'plan', p_plan);
end;
$$;

-- ------------------------------------------------------------
-- 8. PACK SET — create or update a pack
-- ------------------------------------------------------------
drop function if exists public.admin_pack_set(text, text, integer, numeric, boolean, integer);

create or replace function public.admin_pack_set(
  p_token text,
  p_id text,
  p_price_inr integer default 0,
  p_balance_usd numeric default 0,
  p_is_active boolean default true,
  p_sort_order integer default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  if p_id is null or p_id = '' then
    raise exception 'INVALID_PACK_ID' using errcode = '22000';
  end if;

  insert into public.packs (id, name, price_inr, balance_usd, sort_order, is_active, updated_at)
  values (p_id, initcap(p_id), p_price_inr, p_balance_usd, p_sort_order, p_is_active, now())
  on conflict (id) do update set
    price_inr = excluded.price_inr,
    balance_usd = excluded.balance_usd,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

  return json_build_object('ok', true, 'id', p_id);
end;
$$;

-- ------------------------------------------------------------
-- 9. INVENTORY — per-tier stock levels
-- ------------------------------------------------------------
drop function if exists public.admin_inventory(text);

create or replace function public.admin_inventory(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  return (
    select coalesce(json_agg(
      json_build_object(
        'tier', t.tier,
        'total', t.total,
        'active', t.active,
        'assigned', t.assigned,
        'available', t.active - t.assigned
      ) order by t.tier
    ), '[]'::json)
    from (
      select
        c.tier as tier,
        count(*) as total,
        count(*) filter (where c.is_active) as active,
        (select count(*) from public.user_cards uc
          join public.cards cc on cc.id = uc.card_id
         where cc.tier = c.tier) as assigned
      from public.cards c
      group by c.tier
    ) t
  );
end;
$$;

-- ------------------------------------------------------------
-- 10. UPGRADE admin_users — also return is_active (suspended flag)
--     Replaces the live function with the SAME signature; the
--     frontend users tab needs is_active to show suspensions.
-- ------------------------------------------------------------
drop function if exists public.admin_users(text);

create or replace function public.admin_users(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  return (
    select coalesce(json_agg(
      json_build_object(
        'id', u.id,
        'email', u.email,
        'display_name', coalesce(p.display_name, u.raw_user_meta_data->>'name', ''),
        'plan_type', coalesce(p.plan_type, 'Free'),
        'created_at', u.created_at,
        'is_active', coalesce(p.is_active, true)
      ) order by u.created_at desc
    ), '[]'::json)
    from auth.users u
    left join public.profiles p on p.id = u.id
  );
end;
$$;
