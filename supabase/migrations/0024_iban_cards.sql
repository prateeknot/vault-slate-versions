-- 0024_iban_cards.sql — IBAN (European bank account) pool
--
-- Phase 2 / v12: admins add European IBAN accounts; every user sees ALL
-- active IBANs (latest first) — no per-user assignment, no 1-card limit.
--
-- Security follows the cards-table pattern: RLS enabled with NO policies and
-- direct DML revoked — all access goes through security-definer RPCs.

-- 1) table ----------------------------------------------------------------
create table if not exists public.iban_cards (
  id          uuid primary key default gen_random_uuid(),
  iban        text not null unique,
  bank_name   text not null default '',
  holder_name text not null default '',
  country     text not null default 'DE',
  bic         text not null default '',
  label       text default 'Other',
  notes       text,
  is_active   boolean not null default true,
  seq         bigserial,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists iban_cards_active_idx on public.iban_cards (is_active);
create index if not exists iban_cards_created_idx on public.iban_cards (created_at desc);

-- 2) RLS: locked down — no policies, no direct access ----------------------
alter table public.iban_cards enable row level security;
revoke all on table public.iban_cards from anon, authenticated;
grant all on table public.iban_cards to service_role;

-- 3) realtime (admin adds an IBAN → users see it instantly) ---------------
alter publication supabase_realtime add table public.iban_cards;

-- 4) admin RPCs (token-gated) ---------------------------------------------

-- upsert an IBAN row
create or replace function public.admin_iban_save(
  p_token text,
  p_id uuid,
  p_iban text,
  p_bank_name text default '',
  p_holder_name text default '',
  p_country text default 'DE',
  p_bic text default '',
  p_label text default 'Other',
  p_is_active boolean default true
)
returns public.iban_cards
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.iban_cards%rowtype;
begin
  perform public.vs_admin_code_id(p_token);

  if coalesce(p_iban, '') = '' then
    raise exception 'IBAN_REQUIRED' using errcode = '22000';
  end if;

  if p_id is null then
    insert into public.iban_cards (iban, bank_name, holder_name, country, bic, label, is_active)
    values (
      upper(regexp_replace(p_iban, '\s', '', 'g')),
      coalesce(p_bank_name, ''),
      coalesce(p_holder_name, ''),
      coalesce(upper(p_country), 'DE'),
      upper(coalesce(regexp_replace(p_bic, '\s', '', 'g'), '')),
      coalesce(nullif(p_label, ''), 'Other'),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.iban_cards set
      iban        = upper(regexp_replace(p_iban, '\s', '', 'g')),
      bank_name   = coalesce(p_bank_name, ''),
      holder_name = coalesce(p_holder_name, ''),
      country     = coalesce(upper(p_country), 'DE'),
      bic         = upper(coalesce(regexp_replace(p_bic, '\s', '', 'g'), '')),
      label       = coalesce(nullif(p_label, ''), 'Other'),
      is_active   = coalesce(p_is_active, true),
      updated_at  = now()
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'IBAN_NOT_FOUND' using errcode = '22000';
    end if;
  end if;

  return v_row;
end;
$$;

-- delete an IBAN row
create or replace function public.admin_iban_delete(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.vs_admin_code_id(p_token);
  delete from public.iban_cards where id = p_id;
  return found;
end;
$$;

-- flip active status
create or replace function public.admin_iban_toggle(p_token text, p_id uuid)
returns public.iban_cards
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.iban_cards%rowtype;
begin
  perform public.vs_admin_code_id(p_token);
  update public.iban_cards set is_active = not is_active, updated_at = now()
  where id = p_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'IBAN_NOT_FOUND' using errcode = '22000';
  end if;
  return v_row;
end;
$$;

-- admin: list all IBANs (latest first)
create or replace function public.admin_ibans(p_token text)
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
    'id', i.id,
    'iban', i.iban,
    'bank_name', i.bank_name,
    'holder_name', i.holder_name,
    'country', i.country,
    'bic', i.bic,
    'label', i.label,
    'is_active', i.is_active,
    'created_at', i.created_at
  ) order by i.created_at desc), '[]'::json) into v_result
  from public.iban_cards i;
  return v_result;
end;
$$;

-- 5) user RPC: EVERY active IBAN, latest first (no assignment, no limit) ---
create or replace function public.ibans_for_me()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_result json;
begin
  select coalesce(json_agg(json_build_object(
    'id', i.id,
    'iban', i.iban,
    'bank_name', i.bank_name,
    'holder_name', i.holder_name,
    'country', i.country,
    'bic', i.bic,
    'label', i.label,
    'created_at', i.created_at
  ) order by i.created_at desc), '[]'::json) into v_result
  from public.iban_cards i
  where i.is_active = true;
  return v_result;
end;
$$;

-- stock count for display purposes (active IBANs)
create or replace function public.iban_stock()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_count int;
begin
  select count(*) into v_count from public.iban_cards where is_active = true;
  return json_build_object('available', v_count, 'total', (select count(*) from public.iban_cards));
end;
$$;

-- 6) grants ----------------------------------------------------------------
grant execute on function public.admin_iban_save(text, uuid, text, text, text, text, text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.admin_iban_delete(text, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_iban_toggle(text, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_ibans(text) to anon, authenticated, service_role;
grant execute on function public.ibans_for_me() to anon, authenticated, service_role;
grant execute on function public.iban_stock() to anon, authenticated, service_role;
