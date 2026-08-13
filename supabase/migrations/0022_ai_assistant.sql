-- ============================================================================
-- 0022_ai_assistant.sql  (Phase 2 — AI Assistant)
--
-- Adds the AI Assistant foundation:
--   1. ai_config       — single-row settings (provider, base_url, api_key,
--                        model, enabled). RPC-only access (no RLS policy).
--   2. ai_chat_history — conversation history (role, content, tool_name).
--                        RPC-only access.
--   3. RPCs (all admin-token-gated, SECURITY DEFINER):
--      - admin_ai_config_get(p_token)   -> settings with API key masked
--      - admin_ai_config_set(...)       -> save settings (empty key keeps old)
--      - admin_ai_history_list(p_token) -> last 100 messages
--      - admin_ai_history_add(...)      -> append a message (edge fn uses this)
--      - admin_ai_history_clear(p_token)-> wipe history
-- ============================================================================

-- ── 1. ai_config ─────────────────────────────────────────────────────────────
create table if not exists public.ai_config (
  id          boolean primary key default true check (id),
  provider    text not null default 'openai',          -- 'openai' | 'google' | 'custom'
  base_url    text not null default 'https://api.openai.com/v1',
  api_key     text not null default '',
  model       text not null default '',
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);

insert into public.ai_config (id) values (true) on conflict (id) do nothing;

alter table public.ai_config enable row level security;
-- No policies: access is RPC-only (same pattern as app_settings/cards).

revoke all on table public.ai_config from anon, authenticated, service_role;
grant  all on table public.ai_config to service_role;

-- ── 2. ai_chat_history ───────────────────────────────────────────────────────
create table if not exists public.ai_chat_history (
  id          uuid primary key default gen_random_uuid(),
  role        text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content     text not null default '',
  tool_name   text,
  created_at  timestamptz not null default now()
);

alter table public.ai_chat_history enable row level security;
-- No policies: RPC-only.

revoke all on table public.ai_chat_history from anon, authenticated;
grant  all on table public.ai_chat_history to service_role;

-- ── 3. RPCs ─────────────────────────────────────────────────────────────────

-- Read settings with the API key MASKED (never echo the full key to the client).
create or replace function public.admin_ai_config_get(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.ai_config%rowtype;
begin
  perform public.vs_admin_code_id(p_token);
  select * into v_cfg from public.ai_config where id = true;
  if not found then
    return json_build_object('ok', false, 'error', 'CONFIG_NOT_FOUND');
  end if;
  return json_build_object(
    'ok', true,
    'provider', v_cfg.provider,
    'base_url', v_cfg.base_url,
    'model',    v_cfg.model,
    'enabled',  v_cfg.enabled,
    'api_key_masked', case
      when v_cfg.api_key = '' then ''
      when length(v_cfg.api_key) <= 8 then repeat('*', length(v_cfg.api_key))
      else left(v_cfg.api_key, 3) || '...' || right(v_cfg.api_key, 4)
    end
  );
end;
$function$;

-- Save settings. Empty api_key keeps the stored one (so the admin never has to
-- re-type it). Empty base_url/model fall back to provider defaults.
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
    v_url := 'https://generativelanguage.googleapis.com/v1beta/openai';
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

-- Full config including the REAL api key — for the edge function only. The
-- function receives the admin token too, so gating is identical to every other
-- admin RPC; the key is never served to the browser UI (admin_ai_config_get
-- masks it, and the frontend never calls this variant).
create or replace function public.admin_ai_config_full(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cfg public.ai_config%rowtype;
begin
  perform public.vs_admin_code_id(p_token);
  select * into v_cfg from public.ai_config where id = true;
  if not found then
    return json_build_object('ok', false, 'error', 'CONFIG_NOT_FOUND');
  end if;
  return json_build_object(
    'ok', true,
    'provider', v_cfg.provider,
    'base_url', v_cfg.base_url,
    'api_key',  v_cfg.api_key,
    'model',    v_cfg.model,
    'enabled',  v_cfg.enabled
  );
end;
$function$;

-- Conversation history (most recent 100, oldest first for the LLM context)
create or replace function public.admin_ai_history_list(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sid uuid;
begin
  perform public.vs_admin_code_id(p_token);
  return (
    select coalesce(json_agg(row_to_json(t) order by t.created_at asc), '[]'::json)
    from (
      select id, role, content, tool_name, created_at
      from public.ai_chat_history
      order by created_at desc
      limit 100
    ) t
  );
end;
$function$;

-- Append a message (the edge function saves both sides of the conversation)
create or replace function public.admin_ai_history_add(
  p_token      text,
  p_role       text,
  p_content    text,
  p_tool_name  text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  perform public.vs_admin_code_id(p_token);
  if p_role not in ('user', 'assistant', 'tool', 'system') then
    return json_build_object('ok', false, 'error', 'INVALID_ROLE');
  end if;
  insert into public.ai_chat_history (role, content, tool_name)
  values (p_role, coalesce(p_content, ''), p_tool_name)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$function$;

-- Wipe the conversation
create or replace function public.admin_ai_history_clear(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.vs_admin_code_id(p_token);
  delete from public.ai_chat_history;
  return json_build_object('ok', true);
end;
$function$;

-- ── Grants ───────────────────────────────────────────────────────────────────
grant execute on function public.admin_ai_config_get(text)      to anon, authenticated, service_role;
grant execute on function public.admin_ai_config_set(text, text, text, text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.admin_ai_config_full(text)     to anon, authenticated, service_role;
grant execute on function public.admin_ai_history_list(text)    to anon, authenticated, service_role;
grant execute on function public.admin_ai_history_add(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.admin_ai_history_clear(text)   to anon, authenticated, service_role;
