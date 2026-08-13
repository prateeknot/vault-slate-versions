-- ============================================================================
-- 0023_admin_session_ai_robustness.sql  (v11.1 fixes)
--
-- 1. Admin sessions: 2 hours → 7 days (panel stays logged in until the user
--    explicitly exits; a frontend heartbeat also keeps it alive while open).
-- 2. admin_ping: extend by 7 days (was 2 hours) so the heartbeat keeps the
--    session alive instead of just barely extending it.
-- 3. AI provider: add 'groq' (OpenAI-compatible, api.groq.com/openai/v1).
-- ============================================================================

-- ── 1+2. Admin session duration 2h → 7 days ──────────────────────────────────
create or replace function public.admin_login(p_code text, p_force boolean DEFAULT false)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_expires := now() + interval '7 days';

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
$function$;

-- admin_ping heartbeat: keep the session alive for another 7 days
create or replace function public.admin_ping(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sid uuid;
  v_expires timestamptz;
begin
  perform public.vs_admin_code_id(p_token);
  update public.code_sessions
     set expires_at = now() + interval '7 days', last_seen_at = now()
   where session_token = p_token and is_active
   returning expires_at into v_expires;
  if v_expires is null then
    raise exception 'SESSION_INVALID' using errcode = '28000';
  end if;
  return json_build_object('ok', true, 'expires_at', v_expires);
end;
$function$;

-- ── 3. AI provider: add Groq ─────────────────────────────────────────────────
create or replace function public.admin_ai_config_set(
  p_token      text,
  p_provider   text,
  p_base_url   text,
  p_api_key    text,
  p_model      text,
  p_enabled    boolean
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prev public.ai_config%rowtype;
  v_url  text;
begin
  perform public.vs_admin_code_id(p_token);
  select * into v_prev from public.ai_config where id = true;

  -- Provider whitelist + default base URLs
  if lower(btrim(p_provider)) = 'google' then
    v_url := 'https://generativelanguage.googleapis.com';
  elsif lower(btrim(p_provider)) = 'groq' then
    v_url := 'https://api.groq.com/openai/v1';
  elsif lower(btrim(p_provider)) = 'custom' then
    v_url := nullif(btrim(p_base_url), '');
  else
    p_provider := 'openai';
    v_url := 'https://api.openai.com/v1';
  end if;
  if v_url is null then
    return json_build_object('ok', false, 'error', 'BASE_URL_REQUIRED');
  end if;

  update public.ai_config
     set provider   = p_provider,
         base_url   = v_url,
         api_key    = case when nullif(btrim(p_api_key), '') is null then coalesce(v_prev.api_key, '') else btrim(p_api_key) end,
         model      = coalesce(nullif(btrim(p_model), ''), ''),
         enabled    = coalesce(p_enabled, false),
         updated_at = now()
   where id = true;

  return json_build_object('ok', true, 'configured', v_url, 'enabled', coalesce(p_enabled, false));
end;
$function$;
