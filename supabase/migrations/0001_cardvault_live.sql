-- ============================================
-- card-vault (zqckifdofenqmgjfuydj) — Live hardening
--
-- Applied directly to the active card-vault project.
--  1. Reset admin codes: delete ALL existing, seed 137809 (hashed)
--  2. Brute-force guard: 10s cooldown + escalating lockout per client IP
--  3. Auto-create profiles row on signup (so user data persists server-side)
--  4. Realtime: publish `cards` so admin adds show live to users
--  5. Retention: purge accounts inactive > 365 days (daily via pg_cron)
-- ============================================

-- ------------------------------------------------------------
-- 1. RESET ADMIN CODES
--    Wipes any/all codes and 2-hour sessions, seeds 137809.
-- ------------------------------------------------------------
delete from public.code_sessions;
delete from public.admin_codes;

insert into public.admin_codes (code_hash, label, is_active)
values (public.vs_hash_code('137809'), 'Primary Admin', true);

-- ------------------------------------------------------------
-- 2. BRUTE-FORCE GUARD
--    login_guard tracks failures + lockout window PER IP.
-- ------------------------------------------------------------
create table if not exists public.login_guard (
  ip_hash      text primary key,
  fail_count   integer not null default 0,
  last_fail    timestamptz,
  locked_until timestamptz
);

alter table public.login_guard enable row level security;
drop policy if exists "login_guard_no_access" on public.login_guard;
create policy "login_guard_no_access" on public.login_guard for all to anon, authenticated using (false) with check (false);
revoke all on public.login_guard from anon, authenticated;

-- Client IP from PostgREST forwarded headers (fallback 'unknown')
create or replace function public.vs_client_ip()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1
    ), ''),
    'unknown'
  );
$$;

-- Record a failure, lock that IP for 10s. Escalates after repeated fails.
create or replace function public.vs_register_fail(p_ip_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.login_guard (ip_hash, fail_count, last_fail, locked_until)
  values (p_ip_hash, 1, now(), now() + interval '10 seconds')
  on conflict (ip_hash) do update set
    fail_count   = public.login_guard.fail_count + 1,
    last_fail    = now(),
    locked_until = now() + interval '10 seconds' * public.login_guard.fail_count;
end;
$$;

-- ------------------------------------------------------------
-- ADMIN LOGIN (rewritten) — with cooldown enforcement
-- Returns JSON instead of raising so the guard write persists.
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

  select count(*) into v_open
    from public.code_sessions s
   where s.code_id = v_code.id and s.is_active and s.expires_at > now();

  if v_open > 0 then
    if not p_force then
      return json_build_object('ok', false, 'error', 'SESSION_ACTIVE');
    end if;
    update public.code_sessions set is_active = false
     where code_id = v_code.id and is_active;
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
    'expires_at', v_expires
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. AUTO-CREATE PROFILE ON SIGNUP
--    extends handle_new_user to persist the user server-side
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_plans (user_id, plan_id)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  insert into public.profiles (id, email, plan_type, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    'Free',
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Ensure the trigger fires on new auth users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 4. REALTIME — publish cards
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.cards;

-- ------------------------------------------------------------
-- 5. RETENTION — purge accounts inactive > 365 days
-- ------------------------------------------------------------
create or replace function public.purge_inactive_users()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
  r record;
begin
  for r in
    select id from auth.users
    where coalesce(last_sign_in_at, created_at) < now() - interval '365 days'
  loop
    delete from public.profiles      where id = r.id;
    delete from public.user_plans    where user_id = r.id;
    delete from auth.users           where id = r.id;
    v_deleted := v_deleted + 1;
  end loop;
  return v_deleted;
end;
$$;

-- Daily 03:00 run
do $$
begin
  begin
    set local search_path to extensions, public;
    perform cron.schedule('purge-inactive-users', '0 3 * * *', 'select public.purge_inactive_users();');
  exception when others then
    null; -- pg_cron may not be enabled on some tiers; function still callable manually
  end;
end;
$$;