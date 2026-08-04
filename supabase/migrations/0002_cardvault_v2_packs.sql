-- ============================================
-- card-vault (zqckifdofenqmgjfuydj) — V2 PACK SYSTEM
--
-- Replaces the monthly Free/Pro/Max plan system with one-time PACKS.
--  - User holds exactly ONE card (limit/balance based).
--  - Pack = card balance/limit. Bigger pack = bigger card limit.
--  - Admin picks a TIER when adding a card (free/spark/orbit/...).
--    tier='free' cards are assignable to free users; other tiers are
--    assigned when a user buys that pack.
--  - Orders table records purchases (gateway integration comes later).
-- ============================================

-- ------------------------------------------------------------
-- 1. PACKS (replaces plan_limits / plans)
-- ------------------------------------------------------------
create table if not exists public.packs (
  id           text primary key,
  name         text not null,
  price_inr    integer not null default 0,
  balance_usd  numeric not null default 0,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.packs (id, name, price_inr, balance_usd, sort_order) values
  ('spark',    'Spark',    299,  15, 1),
  ('orbit',    'Orbit',    499,  26, 2),
  ('nova',     'Nova',     799,  32, 3),
  ('galaxy',   'Galaxy',   999,  49, 4),
  ('cosmos',   'Cosmos',   1299, 67, 5),
  ('infinity', 'Infinity', 1599, 82, 6)
on conflict (id) do update set
  name = excluded.name,
  price_inr = excluded.price_inr,
  balance_usd = excluded.balance_usd,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ------------------------------------------------------------
-- 2. CARDS — add tier + balance
-- ------------------------------------------------------------
alter table public.cards add column if not exists tier text not null default 'free';
alter table public.cards add column if not exists balance_usd numeric not null default 0;

-- ------------------------------------------------------------
-- 3. USER_CARDS — exactly one card per user
-- ------------------------------------------------------------
create table if not exists public.user_cards (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  card_id    uuid not null references public.cards(id) on delete cascade,
  pack_id    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. ORDERS — purchase tracking (payment gateways later)
-- ------------------------------------------------------------
create table if not exists public.orders (
  id            uuid primary key default extensions.gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  pack_id       text not null references public.packs(id),
  amount_inr    integer not null,
  status        text not null default 'pending', -- pending | paid | failed | refunded
  gateway       text,
  gateway_ref   text,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);

-- ------------------------------------------------------------
-- 5. RPC: available packs (public pricing)
-- ------------------------------------------------------------
create or replace function public.available_packs()
returns setof public.packs
language sql
stable
security definer
set search_path = public
as $$
  select * from public.packs where is_active order by sort_order, price_inr;
$$;

-- ------------------------------------------------------------
-- 6. RPC: my current card (single card + pack info)
-- ------------------------------------------------------------
create or replace function public.my_card()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v json;
begin
  select json_build_object(
    'card_id', c.id,
    'card_number', c.card_number,
    'cardholder_name', c.cardholder_name,
    'expiry', c.expiry,
    'cvv', c.cvv,
    'provider', c.provider,
    'tier', c.tier,
    'label', c.label,
    'balance_usd', c.balance_usd,
    'pack_id', uc.pack_id,
    'pack_name', coalesce(p.name, initcap(c.tier)),
    'created_at', c.created_at
  ) into v
  from public.user_cards uc
  join public.cards c on c.id = uc.card_id
  left join public.packs p on p.id = uc.pack_id
  where uc.user_id = auth.uid();

  return v;
end;
$$;

-- ------------------------------------------------------------
-- 7. RPC: claim a free-tier card (free users, no payment)
-- ------------------------------------------------------------
create or replace function public.claim_free_card()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cards  uuid[];
  v_card   public.cards%rowtype;
  v_me     public.user_cards%rowtype;
begin
  select * into v_me from public.user_cards where user_id = auth.uid();
  if v_me.user_id is not null then
    return (select public.my_card());
  end if;

  select array_agg(id order by created_at asc, id asc) into v_cards
    from public.cards c
   where c.is_active
     and c.tier = 'free'
     and not exists (select 1 from public.user_cards uc where uc.card_id = c.id);

  if v_cards is null or cardinality(v_cards) = 0 then
    return null;
  end if;

  v_card := (select * from public.cards where id = v_cards[1]);

  insert into public.user_cards (user_id, card_id, pack_id)
  values (auth.uid(), v_card.id, 'free');

  return (select public.my_card());
end;
$$;

-- ------------------------------------------------------------
-- 8. RPC: purchase flow — create order
-- ------------------------------------------------------------
create or replace function public.create_order(p_pack_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack  public.packs%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_pack from public.packs where id = p_pack_id and is_active;
  if v_pack.id is null then
    raise exception 'UNKNOWN_PACK' using errcode = '22000';
  end if;

  insert into public.orders (user_id, pack_id, amount_inr, status)
  values (auth.uid(), v_pack.id, v_pack.price_inr, 'pending')
  returning * into v_order;

  return json_build_object(
    'order_id', v_order.id,
    'pack_id', v_order.pack_id,
    'amount_inr', v_order.amount_inr,
    'status', v_order.status
  );
end;
$$;

-- ------------------------------------------------------------
-- 9. RPC: confirm order + assign card of that tier
--    (gateway webhook / simulated payment calls this)
-- ------------------------------------------------------------
create or replace function public.confirm_order(p_order_id uuid, p_gateway text default null, p_gateway_ref text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_pack  public.packs%rowtype;
  v_card  public.cards%rowtype;
  v_cards uuid[];
begin
  select * into v_order from public.orders where id = p_order_id and user_id = auth.uid();
  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = '22000';
  end if;
  if v_order.status = 'paid' then
    return (select public.my_card());
  end if;

  select * into v_pack from public.packs where id = v_order.pack_id;
  if v_pack.id is null then
    raise exception 'UNKNOWN_PACK' using errcode = '22000';
  end if;

  -- find an unassigned active card of this tier
  select array_agg(id order by created_at asc, id asc) into v_cards
    from public.cards c
   where c.is_active
     and c.tier = v_pack.id
     and not exists (select 1 from public.user_cards uc where uc.card_id = c.id);

  if v_cards is null or cardinality(v_cards) = 0 then
    raise exception 'NO_CARD_AVAILABLE' using errcode = '22000';
  end if;

  v_card := (select * from public.cards where id = v_cards[1]);

  -- release previous card (return to pool)
  delete from public.user_cards where user_id = auth.uid();

  insert into public.user_cards (user_id, card_id, pack_id)
  values (auth.uid(), v_card.id, v_pack.id);

  update public.orders set
    status = 'paid',
    gateway = coalesce(p_gateway, gateway),
    gateway_ref = coalesce(p_gateway_ref, gateway_ref),
    paid_at = now()
  where id = p_order_id;

  update public.profiles set plan_type = v_pack.name where id = auth.uid();

  return (select public.my_card());
end;
$$;

-- ------------------------------------------------------------
-- 10. RPC: admin — list packs
-- ------------------------------------------------------------
create or replace function public.admin_packs(p_token text)
returns setof public.packs
language sql
stable
security definer
set search_path = public
as $$
  select p.* from public.packs p
  where exists (select 1 from public.vs_admin_code_id(p_token))
  order by p.sort_order, p.price_inr;
$$;

-- ------------------------------------------------------------
-- 11. RPC: admin — update a pack
-- ------------------------------------------------------------
create or replace function public.admin_pack_set(p_token text, p_id text, p_price_inr integer, p_balance_usd numeric)
returns public.packs
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.packs%rowtype;
begin
  perform public.vs_admin_code_id(p_token);
  if not exists (select 1 from public.packs where id = p_id) then
    raise exception 'UNKNOWN_PACK' using errcode = '22000';
  end if;
  update public.packs set
    price_inr = coalesce(p_price_inr, price_inr),
    balance_usd = coalesce(p_balance_usd, balance_usd),
    updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- 12. admin_card_save — accept tier + balance
-- ------------------------------------------------------------
create or replace function public.admin_card_save(
  p_token text,
  p_id uuid,
  p_card_number text,
  p_cardholder_name text,
  p_expiry text,
  p_cvv text,
  p_provider text,
  p_is_active boolean,
  p_label text default null,
  p_tier text default 'free',
  p_balance_usd numeric default 0
)
returns cards
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.cards%rowtype;
begin
  perform public.vs_admin_code_id(p_token);

  if coalesce(regexp_replace(coalesce(p_card_number, ''), '\D', '', 'g'), '') = '' then
    raise exception 'CARD_NUMBER_REQUIRED' using errcode = '22000';
  end if;

  -- tier must be a known pack id or 'free'
  if lower(coalesce(p_tier, 'free')) not in ('free') and
     not exists (select 1 from public.packs where id = lower(coalesce(p_tier, 'free'))) then
    raise exception 'UNKNOWN_TIER' using errcode = '22000';
  end if;

  if p_id is null then
    insert into public.cards (card_number, cardholder_name, expiry, cvv, provider, is_active, label, tier, balance_usd)
    values (
      regexp_replace(p_card_number, '\D', '', 'g'),
      coalesce(p_cardholder_name, ''),
      coalesce(p_expiry, ''),
      coalesce(p_cvv, ''),
      coalesce(nullif(p_provider, ''), 'other'),
      coalesce(p_is_active, true),
      nullif(p_label, ''),
      lower(coalesce(p_tier, 'free')),
      coalesce(p_balance_usd, 0)
    )
    returning * into v_row;
  else
    update public.cards set
      card_number     = regexp_replace(p_card_number, '\D', '', 'g'),
      cardholder_name = coalesce(p_cardholder_name, ''),
      expiry          = coalesce(p_expiry, ''),
      cvv             = coalesce(p_cvv, ''),
      provider        = coalesce(nullif(p_provider, ''), 'other'),
      is_active       = coalesce(p_is_active, true),
      label           = nullif(p_label, ''),
      tier            = lower(coalesce(p_tier, 'free')),
      balance_usd     = coalesce(p_balance_usd, 0)
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'CARD_NOT_FOUND' using errcode = '22000';
    end if;
  end if;

  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- 13. admin_card_save: card rows exposed to admin show tier
--     (cards table already has tier column via alter)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 14. RLS: user_cards + orders — owner only
-- ------------------------------------------------------------
alter table public.user_cards enable row level security;
alter table public.orders enable row level security;

drop policy if exists "user_cards owner" on public.user_cards;
create policy "user_cards owner" on public.user_cards
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "orders owner" on public.orders;
create policy "orders owner" on public.orders
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- 15. Admin can read user_cards / orders (service only via RPC anyway)
-- ------------------------------------------------------------
drop policy if exists "packs public read" on public.packs;
create policy "packs public read" on public.packs
  for select to anon, authenticated using (true);

alter table public.packs enable row level security;
