-- ============================================
-- Virtual Cards — Security Hardening
--
-- Fixes:
--  1. No client-side service role key (admin ops now run through
--     code-gated Postgres RPC functions)
--  2. Full card data (number + CVV) is NEVER readable via direct
--     table access — the old `cards_read_authenticated` policy
--     leaked everything to any logged-in user
--  3. A `masked_cards` view (last4 only) is the only
--     frontend-readable projection of cards
--  4. Claims are validated server-side (active card + matching
--     plan tier + plan limit) via `claim_card()`
--  5. Old helper functions that returned full details for
--     arbitrary plan tiers are removed/replaced
-- ============================================

-- ------------------------------------------------------------
-- 1. REMOVE LEAKING POLICIES
--    (authenticated users could select('*') on cards and read
--    full numbers + CVVs; realtime also streamed them)
-- ------------------------------------------------------------
drop policy if exists "cards_read_authenticated" on public.cards;
drop policy if exists "cards_realtime_select" on public.cards;

-- Block direct API access to sensitive tables (defense in depth)
revoke all on public.cards from anon, authenticated;
revoke all on public.admin_codes from anon, authenticated;
revoke all on public.code_sessions from anon, authenticated;

-- ------------------------------------------------------------
-- 2. MASKED CARDS VIEW
--    The ONLY safe, frontend-readable projection of cards.
--    Runs as the view owner (postgres) so it can read cards,
--    but only ever exposes last4 + metadata — never CVV.
-- ------------------------------------------------------------
create or replace view public.masked_cards as
  select
    c.id,
    right(c.card_number, 4) as last4,
    c.bank,
    c.provider,
    c.category,
    c.plan_tier,
    c.is_active,
    c.created_at
  from public.cards c
  where c.is_active = true;

alter table public.masked_cards enable row level security;

drop policy if exists "masked_cards_read_all" on public.masked_cards;
create policy "masked_cards_read_all"
  on public.masked_cards for select
  to anon, authenticated
  using (true);

grant select on public.masked_cards to anon, authenticated;

-- ------------------------------------------------------------
-- 3. CLAIMS
--    Drop direct insert on user_cards — users can no longer
--    forge a claim for an arbitrary card_id. All claims go
--    through public.claim_card() which validates server-side.
-- ------------------------------------------------------------
drop policy if exists "user_cards_insert_own" on public.user_cards;

-- ------------------------------------------------------------
-- 4. SAFE USER RPCs (security definer)
--    Full details are returned ONLY for cards the caller has
--    actually claimed.
-- ------------------------------------------------------------

-- Drop old unsafe helpers (returned full details by plan tier)
drop function if exists public.get_available_cards(text);
drop function if exists public.get_claimed_cards();
drop function if exists public.count_available_cards(text);

-- Masked available cards for a plan tier
create or replace function public.get_available_cards(p_plan text)
returns table (
  id uuid,
  last4 text,
  bank text,
  provider text,
  category text,
  plan_tier text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.id, right(c.card_number, 4)::text, c.bank, c.provider, c.category, c.plan_tier, c.created_at
  from public.cards c
  where c.is_active = true
    and c.plan_tier = p_plan
    and c.id not in (
      select uc.card_id from public.user_cards uc where uc.user_id = auth.uid()
    )
  order by c.created_at desc;
$$;

-- Full details ONLY for the caller's claimed cards
create or replace function public.get_claimed_card_details()
returns table (
  id uuid,
  card_number text,
  name text,
  expiry text,
  cvv text,
  bank text,
  provider text,
  category text,
  plan_tier text,
  claimed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.card_number, c.name, c.expiry, c.cvv, c.bank, c.provider, c.category, c.plan_tier, uc.claimed_at
  from public.user_cards uc
  join public.cards c on c.id = uc.card_id
  where uc.user_id = auth.uid()
  order by uc.claimed_at desc;
$$;

-- Current user's plan + card limit
create or replace function public.get_my_plan()
returns table (plan_id text, card_limit integer)
language sql
security definer
set search_path = public
as $$
  select p.id, p.card_limit
  from public.user_plans up
  join public.plans p on p.id = up.plan_id
  where up.user_id = auth.uid();
$$;

-- Server-side validated claim
create or replace function public.claim_card(p_card_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit integer;
  v_claimed integer;
begin
  select up.plan_id, p.card_limit into v_plan, v_limit
  from public.user_plans up
  join public.plans p on p.id = up.plan_id
  where up.user_id = auth.uid();

  -- No plan row for this user (shouldn't happen — trigger creates one)
  if v_plan is null then
    return false;
  end if;

  -- Card must exist, be active, and match the user's plan tier
  if not exists (
    select 1 from public.cards c
    where c.id = p_card_id and c.is_active = true and c.plan_tier = v_plan
  ) then
    return false;
  end if;

  -- Already claimed → idempotent success
  if exists (
    select 1 from public.user_cards where user_id = auth.uid() and card_id = p_card_id
  ) then
    return true;
  end if;

  -- Enforce plan limit
  select count(*) into v_claimed from public.user_cards where user_id = auth.uid();
  if v_claimed >= v_limit then
    return false;
  end if;

  insert into public.user_cards (user_id, card_id, plan_tier)
  values (auth.uid(), p_card_id, v_plan);

  return true;
end;
$$;

-- ------------------------------------------------------------
-- 5. ADMIN RPCs — every call is gated by the 6-digit code.
--    Replaces the service-role client that used to be bundled
--    into the frontend JS.
-- ------------------------------------------------------------

-- Internal helper: is this an active admin code?
create or replace function public.admin_is_valid(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_codes
    where code = p_code and is_active = true
  );
$$;

create or replace function public.admin_verify_code(p_code text)
returns table (code text, label text, is_active boolean)
language sql
security definer
set search_path = public
as $$
  select a.code, a.label, a.is_active
  from public.admin_codes a
  where a.code = p_code
  limit 1;
$$;

create or replace function public.admin_list_cards(p_code text)
returns table (
  id uuid, card_number text, name text, expiry text, cvv text, bank text,
  provider text, category text, plan_tier text, is_active boolean, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  return query
    select c.id, c.card_number, c.name, c.expiry, c.cvv, c.bank, c.provider,
           c.category, c.plan_tier, c.is_active, c.created_at
    from public.cards c
    order by c.created_at desc;
end;
$$;

create or replace function public.admin_add_card(
  p_code text,
  p_number text, p_name text, p_expiry text, p_cvv text,
  p_bank text, p_provider text, p_category text default 'Other',
  p_plan text default 'free', p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  insert into public.cards (card_number, name, expiry, cvv, bank, provider, category, plan_tier, is_active)
  values (p_number, p_name, p_expiry, p_cvv, p_bank, p_provider, p_category, p_plan, p_active)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_update_card(
  p_code text, p_id uuid,
  p_number text, p_name text, p_expiry text, p_cvv text,
  p_bank text, p_provider text, p_category text default 'Other',
  p_plan text default 'free', p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  update public.cards
  set card_number = p_number, name = p_name, expiry = p_expiry, cvv = p_cvv,
      bank = p_bank, provider = p_provider, category = p_category,
      plan_tier = p_plan, is_active = p_active, updated_at = now()
  where id = p_id;
end;
$$;

create or replace function public.admin_delete_card(p_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  delete from public.cards where id = p_id;
end;
$$;

create or replace function public.admin_toggle_card(p_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  update public.cards set is_active = not is_active, updated_at = now() where id = p_id;
end;
$$;

create or replace function public.admin_list_plans(p_code text)
returns table (id text, name text, card_limit integer, price_display text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  return query
    select p.id, p.name, p.card_limit, p.price_display
    from public.plans p
    order by p.id;
end;
$$;

create or replace function public.admin_update_plan(p_code text, p_plan text, p_limit integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  update public.plans set card_limit = greatest(0, p_limit) where id = p_plan;
end;
$$;

create or replace function public.admin_list_codes(p_code text)
returns table (id uuid, code text, label text, is_active boolean, last_used timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  return query
    select a.id, a.code, a.label, a.is_active, a.last_used, a.created_at
    from public.admin_codes a
    order by a.created_at desc;
end;
$$;

create or replace function public.admin_add_code(p_code text, p_new_code text, p_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  insert into public.admin_codes (code_hash, code, label, is_active)
  values ('hash_' || p_new_code, p_new_code, p_label, true);
end;
$$;

create or replace function public.admin_toggle_code(p_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  update public.admin_codes set is_active = not is_active where id = p_id;
end;
$$;

create or replace function public.admin_delete_code(p_code text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  delete from public.admin_codes where id = p_id;
end;
$$;

create or replace function public.admin_count_users(p_code text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;
  return (select count(*)::integer from auth.users);
end;
$$;

-- ------------------------------------------------------------
-- 6. Restrict function execution
--    Anonymous users only get the masked view; all RPCs require
--    an authenticated session.
-- ------------------------------------------------------------
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;

-- Refresh the PostgREST schema cache so the new objects are visible
NOTIFY pgrst, 'reload schema';
