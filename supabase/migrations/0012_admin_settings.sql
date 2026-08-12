-- 0012_admin_settings.sql — global app settings + admin session management
-- Features: maintenance mode, announcement banner, free-claims toggle,
-- force theme, active admin sessions list + revoke.

-- 1) app_settings key/value table (RLS-locked; access only via RPCs)
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
drop policy if exists app_settings_no_access on public.app_settings;
create policy app_settings_no_access on public.app_settings for all using (false);

-- seed defaults
insert into public.app_settings (key, value) values
  ('maintenance', 'false'),
  ('maintenance_message', 'We are doing some maintenance right now. Please check back in a few minutes.'),
  ('announcement', ''),
  ('claims_enabled', 'true'),
  ('force_theme', '')
on conflict (key) do nothing;

-- 2) get_app_settings() — public read (only settings, no secrets)
create or replace function public.get_app_settings()
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(json_object_agg(s.key, s.value order by s.key), '{}'::json)
  from public.app_settings s;
$$;

grant execute on function public.get_app_settings() to anon, authenticated;

-- 3) admin_set_setting(p_token, p_key, p_value) — admin-gated upsert
create or replace function public.admin_set_setting(p_token text, p_key text, p_value text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_id uuid;
begin
  v_code_id := public.vs_admin_code_id(p_token);
  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return json_build_object('ok', true, 'key', p_key);
end;
$$;

grant execute on function public.admin_set_setting(text, text, text) to authenticated, anon;

-- 4) admin_sessions_list(p_token) — active admin sessions
create or replace function public.admin_sessions_list(p_token text)
returns table (id uuid, label text, is_active boolean, expires_at timestamptz, created_at timestamptz, last_seen_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.vs_admin_code_id(p_token);
  return query
    select cs.id, ac.label, cs.is_active, cs.expires_at, cs.created_at, cs.last_seen_at
    from public.code_sessions cs
    left join public.admin_codes ac on ac.id = cs.code_id
    order by cs.created_at desc
    limit 50;
end;
$$;

grant execute on function public.admin_sessions_list(text) to authenticated, anon;

-- 5) admin_session_revoke(p_token, p_session_id) — force logout a session
create or replace function public.admin_session_revoke(p_token text, p_session_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_id uuid;
begin
  v_code_id := public.vs_admin_code_id(p_token);
  update public.code_sessions
  set is_active = false
  where id = p_session_id;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_session_revoke(text, uuid) to authenticated, anon;
