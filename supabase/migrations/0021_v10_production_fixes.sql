-- ============================================================================
-- 0021_v10_production_fixes.sql  (v10 production-hardening pass)
--
-- 1. admin_payment_approve: after activating the plan, AUTO-ASSIGN a card of
--    the purchased pack's tier when one is available (one card per tier per
--    user, same rule as admin_assign_card). Returns card_assigned flag.
-- 2. admin_set_user_plan: normalize plan to lowercase and reject plans that
--    are neither a known pack tier nor 'free' (prevents garbage plan values).
-- 3. plan_limits: seed card limits for every Top-Up pack tier so my_overview
--    returns a real limit (1 card per purchased pack tier).
-- ============================================================================

-- ── 1. admin_payment_approve: plan activation + auto card assignment ─────────
create or replace function public.admin_payment_approve(p_token text, p_request_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sid           uuid;
  v_req           public.upgrade_requests%rowtype;
  v_updated       int;
  v_card_id       uuid;
  v_card_assigned boolean := false;
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  select * into v_req from public.upgrade_requests where id = p_request_id;
  if not found then
    return json_build_object('ok', false, 'error', 'REQUEST_NOT_FOUND');
  end if;
  if v_req.status <> 'pending' then
    return json_build_object('ok', false, 'error', 'REQUEST_NOT_PENDING');
  end if;

  update public.profiles
     set plan_type  = v_req.pack_id,
         updated_at = now()
   where lower(email) = lower(v_req.email)
     and is_active = true;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return json_build_object('ok', false, 'error', 'NO_ACTIVE_PROFILE');
  end if;

  update public.upgrade_requests
     set status = 'approved',
         reviewed_at = now()
   where id = p_request_id;

  -- Auto-assign one card of the purchased pack tier (if any is free in the pool).
  -- Mirrors the admin_assign_card rule: one card per tier per user, FIFO order.
  select c.id into v_card_id
    from public.cards c
   where c.is_active
     and c.tier = v_req.pack_id
     and not exists (select 1 from public.user_cards uc where uc.card_id = c.id)
   order by c.created_at asc, c.id asc
   limit 1;

  if v_card_id is not null and not exists (
    select 1 from public.user_cards uc
    join public.cards c on c.id = uc.card_id
    where uc.user_id = v_req.user_id and c.tier = v_req.pack_id
  ) then
    insert into public.user_cards (user_id, card_id, pack_id)
    values (v_req.user_id, v_card_id, v_req.pack_id);
    v_card_assigned := true;
  end if;

  return json_build_object(
    'ok', true,
    'profiles_updated', v_updated,
    'plan', v_req.pack_id,
    'amount_inr', v_req.amount_inr,
    'card_assigned', v_card_assigned,
    'card_id', v_card_id
  );
end;
$function$;

-- ── 2. admin_set_user_plan: normalize + validate ──────────────────────────────
create or replace function public.admin_set_user_plan(p_token text, p_user_id uuid, p_plan text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sid   uuid;
  v_plan  text := lower(btrim(p_plan));
begin
  select id into v_sid
    from public.code_sessions
   where session_token = p_token and is_active and expires_at > now();
  if v_sid is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;

  -- Only allow known pack tiers or the free plan. Anything else = typo/abuse.
  if v_plan <> 'free' and not exists (select 1 from public.packs where id = v_plan) then
    return json_build_object('ok', false, 'error', 'INVALID_PLAN', 'plan', v_plan);
  end if;

  insert into public.profiles (id, email, plan_type, display_name)
  values (p_user_id, '', v_plan, '')
  on conflict (id) do update set plan_type = excluded.plan_type, updated_at = now();

  return json_build_object('ok', true, 'plan', v_plan);
end;
$function$;

-- ── 3. plan_limits: seed limits for every Top-Up pack tier (1 card per pack) ─
insert into public.plan_limits (plan_type, card_limit, price_label, sort_order)
values
  ('spark',     1, '₹299',   1),
  ('orbit',     1, '₹499',   2),
  ('nova',      1, '₹799',   3),
  ('galaxy',    1, '₹999',   4),
  ('cosmos',    1, '₹1299',  5),
  ('infinity',  1, '₹1599',  6)
on conflict (plan_type) do update
  set card_limit = excluded.card_limit,
      price_label = excluded.price_label,
      sort_order = excluded.sort_order;
