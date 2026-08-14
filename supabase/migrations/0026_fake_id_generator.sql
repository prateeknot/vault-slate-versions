-- 0026_fake_id_generator.sql — Fake ID pool (v13)
--
-- Admin pastes full fake identities (one block per ID, separated by blank
-- lines) into a single box — stored here as raw `content`. When a user taps
-- the FakeID (+) button, a random UNASSIGNED row is picked (shuffled so
-- everyone gets a different one) and locked to that user. One ID per user.
--
-- Security follows the cards/iban pattern: RLS enabled, NO policies, direct
-- DML revoked — all access via security-definer RPCs.

-- 1) table ----------------------------------------------------------------
create table if not exists public.fake_ids (
  id               uuid primary key default gen_random_uuid(),
  content          text not null,
  name             text not null default '',
  iban             text not null default '',
  email            text not null default '',
  country          text not null default '',
  label            text default 'Other',
  is_active        boolean not null default true,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_at      timestamptz,
  seq              bigserial,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists fake_ids_active_idx on public.fake_ids (is_active);
create index if not exists fake_ids_assigned_idx on public.fake_ids (assigned_user_id);

-- 2) RLS: locked down ------------------------------------------------------
alter table public.fake_ids enable row level security;
revoke all on table public.fake_ids from anon, authenticated;
grant all on table public.fake_ids to service_role;

-- 3) admin RPCs (token-gated) ---------------------------------------------

-- bulk add — one row per content block
create or replace function public.admin_fake_id_add(
  p_token text,
  p_content text,
  p_name text default '',
  p_iban text default '',
  p_email text default '',
  p_country text default '',
  p_label text default 'Other',
  p_is_active boolean default true
)
returns public.fake_ids
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.fake_ids%rowtype;
begin
  perform public.vs_admin_code_id(p_token);
  if coalesce(p_content, '') = '' then
    raise exception 'CONTENT_REQUIRED' using errcode = '22000';
  end if;
  insert into public.fake_ids (content, name, iban, email, country, label, is_active)
  values (p_content, coalesce(p_name, ''), coalesce(p_iban, ''), coalesce(p_email, ''), coalesce(p_country, ''), coalesce(nullif(p_label, ''), 'Other'), coalesce(p_is_active, true))
  returning * into v_row;
  return v_row;
end;
$$;

-- delete
create or replace function public.admin_fake_id_delete(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.vs_admin_code_id(p_token);
  delete from public.fake_ids where id = p_id;
  return found;
end;
$$;

-- toggle active
create or replace function public.admin_fake_id_toggle(p_token text, p_id uuid)
returns public.fake_ids
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.fake_ids%rowtype;
begin
  perform public.vs_admin_code_id(p_token);
  update public.fake_ids set is_active = not is_active, updated_at = now()
  where id = p_id returning * into v_row;
  if v_row.id is null then raise exception 'FAKE_ID_NOT_FOUND' using errcode = '22000'; end if;
  return v_row;
end;
$$;

-- reset an assignment (return to pool)
create or replace function public.admin_fake_id_reset(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.vs_admin_code_id(p_token);
  update public.fake_ids set assigned_user_id = null, assigned_at = null, updated_at = now()
  where id = p_id;
  return found;
end;
$$;

-- admin list
create or replace function public.admin_fake_ids(p_token text)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_result json;
begin
  perform public.vs_admin_code_id(p_token);
  select coalesce(json_agg(json_build_object(
    'id', f.id,
    'content', f.content,
    'name', f.name,
    'iban', f.iban,
    'email', f.email,
    'country', f.country,
    'label', f.label,
    'is_active', f.is_active,
    'assigned_user_id', f.assigned_user_id,
    'assigned_at', f.assigned_at,
    'created_at', f.created_at
  ) order by f.created_at desc), '[]'::json) into v_result
  from public.fake_ids f;
  return v_result;
end;
$$;

-- 4) user RPCs --------------------------------------------------------------

-- generate: pick a random unassigned active ID and lock it to the caller.
-- If the user already has one, return it (idempotent — 1 per user).
create or replace function public.fake_id_generate()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.fake_ids%rowtype;
  v_picked uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- already have one? return it
  select * into v_existing from public.fake_ids
  where assigned_user_id = v_uid and is_active
  limit 1;
  if v_existing.id is not null then
    return json_build_object('ok', true, 'id', v_existing.id, 'content', v_existing.content,
      'name', v_existing.name, 'iban', v_existing.iban, 'email', v_existing.email,
      'country', v_existing.country, 'existing', true);
  end if;

  -- pick a random unassigned active row, with a race-safe claim (up to 3
  -- tries — if two users pick the same row at once, the loser retries)
  for i in 1..3 loop
    select id into v_picked from public.fake_ids
    where is_active and assigned_user_id is null
    order by random()
    limit 1;

    if v_picked is null then
      return json_build_object('ok', false, 'error', 'NO_FAKE_IDS_AVAILABLE');
    end if;

    update public.fake_ids
    set assigned_user_id = v_uid, assigned_at = now(), updated_at = now()
    where id = v_picked and assigned_user_id is null
    returning * into v_existing;

    if v_existing.id is not null then
      exit;
    end if;
  end loop;

  if v_existing.id is null then
    return json_build_object('ok', false, 'error', 'NO_FAKE_IDS_AVAILABLE');
  end if;

  return json_build_object('ok', true, 'id', v_existing.id, 'content', v_existing.content,
    'name', v_existing.name, 'iban', v_existing.iban, 'email', v_existing.email,
    'country', v_existing.country, 'existing', false);
end;
$$;

-- my assigned ID
create or replace function public.fake_id_mine()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_row public.fake_ids%rowtype;
begin
  select * into v_row from public.fake_ids
  where assigned_user_id = auth.uid() and is_active
  order by assigned_at desc
  limit 1;
  if v_row.id is null then
    return json_build_object('ok', false, 'error', 'NO_FAKE_ID');
  end if;
  return json_build_object('ok', true, 'id', v_row.id, 'content', v_row.content,
    'name', v_row.name, 'iban', v_row.iban, 'email', v_row.email,
    'country', v_row.country);
end;
$$;

-- pool stats (for admin overview / user availability)
create or replace function public.fake_id_pool()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return json_build_object(
    'total', (select count(*) from public.fake_ids),
    'available', (select count(*) from public.fake_ids where is_active and assigned_user_id is null),
    'assigned', (select count(*) from public.fake_ids where assigned_user_id is not null)
  );
end;
$$;

-- 5) grants ----------------------------------------------------------------
grant execute on function public.admin_fake_id_add(text, text, text, text, text, text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.admin_fake_id_delete(text, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_fake_id_toggle(text, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_fake_id_reset(text, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_fake_ids(text) to anon, authenticated, service_role;
grant execute on function public.fake_id_generate() to anon, authenticated, service_role;
grant execute on function public.fake_id_mine() to anon, authenticated, service_role;
grant execute on function public.fake_id_pool() to anon, authenticated, service_role;
