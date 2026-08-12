-- ============================================================
-- 0018 — Telegram QR-payment upgrade requests (bot flow)
--
-- Design (agreed with owner):
--   User pays a plan-specific QR (unique paise amount, e.g. ₹599.37)
--   -> user sends website-linked email to the Telegram bot
--   -> bot creates an `upgrade_requests` row (status = pending)
--   -> owner verifies the credit in PhonePe (exact amount match)
--   -> owner approves/rejects via Telegram admin commands
--   -> approve  = plan upgraded server-side, request marked approved
--   -> reject   = request marked rejected
--   Website: while a request is PENDING, the user's Cards page is
--   locked (my_pending_requests RPC) until admin resolves it.
--
-- Security:
--   * clients (anon/authenticated) can SELECT only their own rows
--   * NO client inserts/updates/deletes — the bot writes via the
--     service_role key (server-side only)
--   * plan changes happen ONLY through security-definer RPCs whose
--     execute is granted to service_role exclusively (no client can
--     escalate their own plan)
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------------
create table if not exists public.upgrade_requests (
  id                uuid primary key default extensions.gen_random_uuid(),
  telegram_user_id  bigint,
  telegram_username text,
  email             text not null,
  pack_id           text not null,
  pack_name         text,
  amount_inr        numeric(10,2) not null,
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'refunded')),
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,
  review_note       text
);

-- ------------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------------
alter table public.upgrade_requests enable row level security;

-- Owner (website account) can see only their own requests.
create policy "upgrade_requests owner select"
on public.upgrade_requests
for select
using (
  lower(email) = lower((select email from public.profiles where id = auth.uid()))
);

-- No insert/update/delete policies for clients -> default deny.

-- ------------------------------------------------------------------
-- 3. Grants (explicit, defense-in-depth)
-- ------------------------------------------------------------------
revoke all on public.upgrade_requests from anon, authenticated;
grant select on public.upgrade_requests to authenticated;
grant all on public.upgrade_requests to service_role;

-- ------------------------------------------------------------------
-- 4. RPC: my_pending_requests() — user-side Cards-page lock
--    Returns only PENDING requests belonging to the logged-in user.
-- ------------------------------------------------------------------
create or replace function public.my_pending_requests()
returns table (
  id          uuid,
  pack_id     text,
  pack_name   text,
  amount_inr  numeric,
  status      text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.pack_id, r.pack_name, r.amount_inr, r.status, r.created_at
  from public.upgrade_requests r
  where r.status = 'pending'
    and lower(r.email) = lower((select email from public.profiles where id = auth.uid()))
  order by r.created_at desc;
$$;

revoke all on function public.my_pending_requests() from public, anon;
grant execute on function public.my_pending_requests() to authenticated;

-- ------------------------------------------------------------------
-- 5. RPC: bot_lookup_email(p_email) — bot checks the email belongs to
--    a real website account before creating a request.
--    service_role ONLY (never callable by clients).
-- ------------------------------------------------------------------
create or replace function public.bot_lookup_email(p_email text)
returns table (
  id           uuid,
  email        text,
  plan_type    text,
  display_name text,
  is_active    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.plan_type, p.display_name, p.is_active
  from public.profiles p
  where lower(p.email) = lower(p_email)
  order by p.created_at desc
  limit 1;
$$;

revoke all on function public.bot_lookup_email(text) from public, anon, authenticated;
grant execute on function public.bot_lookup_email(text) to service_role;

-- ------------------------------------------------------------------
-- 6. RPC: bot_approve_upgrade(p_request_id) — validates the request,
--    upgrades the user's plan (profiles.plan_type = pack_id) and marks
--    the request approved. service_role ONLY.
-- ------------------------------------------------------------------
create or replace function public.bot_approve_upgrade(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.upgrade_requests%rowtype;
  v_updated int;
begin
  select * into v_req from public.upgrade_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'REQUEST_NOT_FOUND');
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'REQUEST_NOT_PENDING');
  end if;

  -- Upgrade every ACTIVE profile matching the request email (handles duplicate
  -- accounts created via email + Google with the same address). Banned/inactive
  -- accounts are skipped — if none are active, refuse the approval.
  update public.profiles
     set plan_type   = v_req.pack_id,
         updated_at  = now()
   where lower(email) = lower(v_req.email)
     and is_active = true;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'NO_ACTIVE_PROFILE');
  end if;

  update public.upgrade_requests
     set status = 'approved',
         reviewed_at = now()
   where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'profiles_updated', v_updated,
    'plan', v_req.pack_id,
    'amount_inr', v_req.amount_inr
  );
end;
$$;

revoke all on function public.bot_approve_upgrade(uuid) from public, anon, authenticated;
grant execute on function public.bot_approve_upgrade(uuid) to service_role;

-- ------------------------------------------------------------------
-- 7. RPC: bot_reject_upgrade(p_request_id, p_note) — marks rejected
--    (the user's Cards page lock clears). service_role ONLY.
-- ------------------------------------------------------------------
create or replace function public.bot_reject_upgrade(p_request_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.upgrade_requests%rowtype;
begin
  select * into v_req from public.upgrade_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'REQUEST_NOT_FOUND');
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'REQUEST_NOT_PENDING');
  end if;

  update public.upgrade_requests
     set status = 'rejected',
         reviewed_at = now(),
         review_note = p_note
   where id = p_request_id;

  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$$;

revoke all on function public.bot_reject_upgrade(uuid, text) from public, anon, authenticated;
grant execute on function public.bot_reject_upgrade(uuid, text) to service_role;

-- ------------------------------------------------------------------
-- 8. Realtime — the Cards page watches upgrade_requests so the lock
--    clears the moment the owner approves/rejects (RLS-scoped push).
-- ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'upgrade_requests'
  ) then
    alter publication supabase_realtime add table public.upgrade_requests;
  end if;
end $$;
