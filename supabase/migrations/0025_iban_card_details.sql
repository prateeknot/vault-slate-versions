-- 0025_iban_card_details.sql — IBAN accounts now carry linked card details
--
-- v12.1: an IBAN entry is not just the account number — admins also add the
-- card linked to it (card_number / expiry / cvv). Users see the IBAN + the card.

-- 1) columns ----------------------------------------------------------------
alter table public.iban_cards add column if not exists card_number text not null default '';
alter table public.iban_cards add column if not exists expiry text not null default '';
alter table public.iban_cards add column if not exists cvv text not null default '';

-- 2) admin upsert — accept card details ------------------------------------
create or replace function public.admin_iban_save(
  p_token text,
  p_id uuid,
  p_iban text,
  p_bank_name text default '',
  p_holder_name text default '',
  p_country text default 'DE',
  p_bic text default '',
  p_label text default 'Other',
  p_is_active boolean default true,
  p_card_number text default '',
  p_expiry text default '',
  p_cvv text default ''
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
    insert into public.iban_cards (iban, bank_name, holder_name, country, bic, label, is_active, card_number, expiry, cvv)
    values (
      upper(regexp_replace(p_iban, '\s', '', 'g')),
      coalesce(p_bank_name, ''),
      coalesce(p_holder_name, ''),
      coalesce(upper(p_country), 'DE'),
      upper(coalesce(regexp_replace(p_bic, '\s', '', 'g'), '')),
      coalesce(nullif(p_label, ''), 'Other'),
      coalesce(p_is_active, true),
      regexp_replace(coalesce(p_card_number, ''), '\D', '', 'g'),
      coalesce(p_expiry, ''),
      coalesce(p_cvv, '')
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
      card_number = regexp_replace(coalesce(p_card_number, ''), '\D', '', 'g'),
      expiry      = coalesce(p_expiry, ''),
      cvv         = coalesce(p_cvv, ''),
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

-- 3) admin list — include card details --------------------------------------
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
    'card_number', i.card_number,
    'expiry', i.expiry,
    'cvv', i.cvv,
    'is_active', i.is_active,
    'created_at', i.created_at
  ) order by i.created_at desc), '[]'::json) into v_result
  from public.iban_cards i;
  return v_result;
end;
$$;

-- 4) user view — include card details ---------------------------------------
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
    'card_number', i.card_number,
    'expiry', i.expiry,
    'cvv', i.cvv,
    'created_at', i.created_at
  ) order by i.created_at desc), '[]'::json) into v_result
  from public.iban_cards i
  where i.is_active = true;
  return v_result;
end;
$$;

-- 5) grants for the new signature -------------------------------------------
grant execute on function public.admin_iban_save(text, uuid, text, text, text, text, text, text, boolean, text, text, text) to anon, authenticated, service_role;
