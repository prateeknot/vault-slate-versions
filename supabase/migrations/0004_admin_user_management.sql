-- ============================================
-- Virtual Cards — Admin user management RPCs
--
-- Adds the three admin RPCs the frontend Admin
-- Panel expects but that were not created yet:
--  1. admin_list_users         → list auth users + plan
--  2. admin_update_user_plan   → change a user's plan
--  3. admin_toggle_user_status → suspend / unsuspend a user
--
-- All remain gated by the active 6-digit admin code.
-- ============================================

-- ------------------------------------------------------------
-- 1. LIST USERS
--    Returns each auth user with their current plan tier.
-- ------------------------------------------------------------
create or replace function public.admin_list_users(p_code text)
returns table (
  id uuid,
  email text,
  name text,
  plan text,
  created_at timestamptz
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
    select u.id,
           u.email,
           (u.raw_user_meta_data ->> 'name') as name,
           coalesce(up.plan_id, 'free') as plan,
           u.created_at
    from auth.users u
    left join public.user_plans up on up.user_id = u.id
    order by u.created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- 2. UPDATE USER PLAN
--    Ensures a matching user_plans row exists, then sets the
--    plan. Also updates the user's default_plan metadata.
-- ------------------------------------------------------------
create or replace function public.admin_update_user_plan(p_code text, p_user_id uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;

  -- Plan must exist
  if not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'unknown plan';
  end if;

  -- Make sure the user has a plan row
  insert into public.user_plans (user_id, plan_id)
  values (p_user_id, p_plan)
  on conflict (user_id) do nothing;

  update public.user_plans set plan_id = p_plan where user_id = p_user_id;

  -- Mirror into auth metadata so get_my_plan() stays consistent
  update auth.users
  set raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{default_plan}',
        to_jsonb(p_plan)
      )
  where id = p_user_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. TOGGLE USER STATUS (suspend / unsuspend)
--    Uses a `suspended` key in auth metadata. Suspended users
--    are rejected at sign-in by the trigger in 0002.
-- ------------------------------------------------------------
create or replace function public.admin_toggle_user_status(p_code text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suspended boolean;
begin
  if not public.admin_is_valid(p_code) then
    raise exception 'unauthorized';
  end if;

  select coalesce((raw_user_meta_data ->> 'suspended')::boolean, false)
    into v_suspended
    from auth.users
   where id = p_user_id;

  update auth.users
  set raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{suspended}',
        to_jsonb(not v_suspended)
      )
  where id = p_user_id;
end;
$$;

-- Restrict execution (consistent with 0003)
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;

-- Refresh the PostgREST schema cache
NOTIFY pgrst, 'reload schema';
