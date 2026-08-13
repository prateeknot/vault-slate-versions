-- ============================================================
-- 0019 — Web-app UPI QR upgrade requests (no Telegram needed)
--
-- v8 flow (agreed with owner):
--   User taps a pack on the Plans page
--   -> web app creates an `upgrade_requests` row (status = pending)
--   -> user scans the owner's UPI QR and pays the pack amount,
--      writing their login email in the UPI payment note/message
--   -> request appears in the admin panel "Payments" section with
--      the user's name + email + requested plan + amount
--   -> owner verifies the credit in PhonePe (amount + email note)
--   -> Activate  = profiles.plan_type updated instantly + request
--                  marked approved (user's Cards lock clears via realtime)
--   -> Decline   = request marked rejected; the user can submit a
--                  NEW request only after a 24-hour cooldown
--
-- Security:
--   * create_upgrade_request / my_upgrade_requests  -> authenticated
--     only; the user's own email is forced server-side (no spoofing)
--   * admin_payments_list / admin_payment_approve / admin_payment_decline
--     -> same active admin-session token gate as every other admin RPC
--   * clients still cannot INSERT into upgrade_requests directly (RLS)
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Column: user_id (web-app requests; Telegram-bot requests stay
--    email-only, so the column is nullable)
-- ------------------------------------------------------------------
alter table public.upgrade_requests add column if not exists user_id uuid references auth.users(id) on delete set null;

-- ------------------------------------------------------------------
-- 2. RPC: create_upgrade_request(p_pack_id) — authenticated.
--    Validates the account + pack, blocks duplicate pending requests
--    and enforces the 24h cooldown after a rejection. Returns the
--    created request (or a machine-readable error).
-- ------------------------------------------------------------------
create or replace function public.create_upgrade_request(p_pack_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile  public.profiles%rowtype;
  v_pack     public.packs%rowtype;
  v_pending  int;
  v_last_rej public.upgrade_requests%rowtype;
  v_req      public.upgrade_requests%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ACCOUNT_NOT_FOUND');
  end if;
  if v_profile.is_active is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'ACCOUNT_INACTIVE');
  end if;

  select * into v_pack from public.packs where id = p_pack_id and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'PACK_NOT_FOUND');
  end if;

  -- Only one pending request at a time (per account email)
  select count(*) into v_pending
    from public.upgrade_requests r
   where r.status = 'pending'
     and lower(r.email) = lower(v_profile.email);
  if v_pending > 0 then
    return jsonb_build_object('ok', false, 'error', 'PENDING_EXISTS');
  end if;

  -- 24h cooldown after the most recent rejection
  select * into v_last_rej
    from public.upgrade_requests r
   where r.status = 'rejected'
     and lower(r.email) = lower(v_profile.email)
   order by r.reviewed_at desc nulls last
   limit 1;
  if found and v_last_rej.reviewed_at is not null
     and v_last_rej.reviewed_at + interval '24 hours' > now() then
    return jsonb_build_object(
      'ok', false,
      'error', 'COOLDOWN_ACTIVE',
      'retry_at', extract(epoch from (v_last_rej.reviewed_at + interval '24 hours'))::bigint
    );
  end if;

  insert into public.upgrade_requests (user_id, email, pack_id, pack_name, amount_inr, status)
  values (v_profile.id, v_profile.email, v_pack.id, v_pack.name, v_pack.price_inr, 'pending')
  returning * into v_req;

  return jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'id',         v_req.id,
      'pack_id',    v_req.pack_id,
      'pack_name',  v_req.pack_name,
      'amount_inr', v_req.amount_inr,
      'status',     v_req.status,
      'created_at', v_req.created_at
    )
  );
end;
$$;

revoke all on function public.create_upgrade_request(text) from public, anon;
grant execute on function public.create_upgrade_request(text) to authenticated;

-- ------------------------------------------------------------------
-- 3. RPC: my_upgrade_requests() — status history (pending / approved /
--    rejected) for the logged-in user, newest first.
-- ------------------------------------------------------------------
create or replace function public.my_upgrade_requests()
returns table (
  id           uuid,
  pack_id      text,
  pack_name    text,
  amount_inr   numeric,
  status       text,
  created_at   timestamptz,
  reviewed_at  timestamptz,
  review_note  text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.pack_id, r.pack_name, r.amount_inr, r.status, r.created_at, r.reviewed_at, r.review_note
    from public.upgrade_requests r
   where lower(r.email) = lower((select email from public.profiles where id = auth.uid()))
   order by r.created_at desc
   limit 20;
$$;

revoke all on function public.my_upgrade_requests() from public, anon;
grant execute on function public.my_upgrade_requests() to authenticated;

-- ------------------------------------------------------------------
-- 4. RPC: admin_payments_list(p_token) — every upgrade request with
--    the matching profile's name + current plan, newest first.
-- ------------------------------------------------------------------
drop function if exists public.admin_payments_list(text);

create or replace function public.admin_payments_list(p_token text)
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
        'id',            r.id,
        'user_id',       r.user_id,
        'email',         r.email,
        'display_name',  coalesce(p.display_name, ''),
        'current_plan',  coalesce(p.plan_type, ''),
        'is_active',     p.is_active,
        'pack_id',       r.pack_id,
        'pack_name',     coalesce(r.pack_name, r.pack_id),
        'amount_inr',    r.amount_inr,
        'status',        r.status,
        'created_at',    r.created_at,
        'reviewed_at',   r.reviewed_at,
        'review_note',   r.review_note
      ) order by r.created_at desc
    ), '[]'::json)
    from public.upgrade_requests r
    left join lateral (
      select display_name, plan_type, is_active
        from public.profiles
       where lower(email) = lower(r.email)
       order by created_at
       limit 1
    ) p on true
  );
end;
$$;

-- ------------------------------------------------------------------
-- 5. RPC: admin_payment_approve(p_token, p_request_id) — validates the
--    pending request, upgrades every active matching profile to the
--    requested pack and marks the request approved. Same core as the
--    Telegram bot's approve function.
-- ------------------------------------------------------------------
create or replace function public.admin_payment_approve(p_token text, p_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid      uuid;
  v_req      public.upgrade_requests%rowtype;
  v_updated  int;
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

  return json_build_object(
    'ok', true,
    'profiles_updated', v_updated,
    'plan', v_req.pack_id,
    'amount_inr', v_req.amount_inr
  );
end;
$$;

-- ------------------------------------------------------------------
-- 6. RPC: admin_payment_decline(p_token, p_request_id, p_note) —
--    marks rejected; the user's Cards lock clears and a 24h cooldown
--    starts before they can submit a new request.
-- ------------------------------------------------------------------
create or replace function public.admin_payment_decline(p_token text, p_request_id uuid, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid;
  v_req public.upgrade_requests%rowtype;
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

  update public.upgrade_requests
     set status = 'rejected',
         reviewed_at = now(),
         review_note = coalesce(p_note, 'declined by admin')
   where id = p_request_id;

  return json_build_object('ok', true, 'status', 'rejected');
end;
$$;

-- ------------------------------------------------------------------
-- 7. Realtime is already enabled on upgrade_requests (0018) — the
--    Cards page + Plans page both watch it, so approve/decline reaches
--    the user within seconds.
-- ------------------------------------------------------------------
