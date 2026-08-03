-- ============================================
-- Card Pool System + User Claims
-- ============================================

-- 1. Add plan_tier to cards (free/pro/max pool)
alter table public.cards add column if not exists plan_tier text default 'free';

-- 2. User claimed cards — permanent save per account
create table if not exists public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  plan_tier text not null default 'free',
  claimed_at timestamptz not null default now(),
  unique (user_id, card_id)
);

create index if not exists user_cards_user_idx on public.user_cards (user_id);
create index if not exists user_cards_card_idx on public.user_cards (card_id);

-- 3. RLS on user_cards
alter table public.user_cards enable row level security;

drop policy if exists "user_cards_read_own" on public.user_cards;
create policy "user_cards_read_own"
  on public.user_cards for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_cards_insert_own" on public.user_cards;
create policy "user_cards_insert_own"
  on public.user_cards for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_cards_delete_own" on public.user_cards;
create policy "user_cards_delete_own"
  on public.user_cards for delete
  to authenticated
  using (auth.uid() = user_id);

-- 4. Update plans — add min/max constraints
update public.plans set card_limit = 3 where id = 'free';
update public.plans set card_limit = 5 where id = 'pro';
update public.plans set card_limit = 10 where id = 'max';

-- 5. Enable real-time on user_cards
alter publication supabase_realtime add table public.user_cards;

-- 6. Function: get available (unclaimed) cards for a user's plan tier
create or replace function public.get_available_cards(p_plan text)
returns table (
  id uuid,
  card_number text,
  name text,
  expiry text,
  cvv text,
  bank text,
  provider text,
  category text,
  plan_tier text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.card_number, c.name, c.expiry, c.cvv, c.bank, c.provider, c.category, c.plan_tier, c.created_at
  from public.cards c
  where c.is_active = true
    and c.plan_tier = p_plan
    and c.id not in (
      select uc.card_id from public.user_cards uc where uc.user_id = auth.uid()
    )
  order by c.created_at desc;
$$;

-- 7. Function: get user's claimed cards
create or replace function public.get_claimed_cards()
returns table (
  id uuid,
  card_number text,
  name text,
  expiry text,
  cvv text,
  bank text,
  provider text,
  category text,
  plan_tier text,
  claimed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.card_number, c.name, c.expiry, c.cvv, c.bank, c.provider, c.category, c.plan_tier, uc.claimed_at
  from public.user_cards uc
  join public.cards c on c.id = uc.card_id
  where uc.user_id = auth.uid()
  order by uc.claimed_at desc;
$$;

-- 8. Function: count available cards for a plan tier
create or replace function public.count_available_cards(p_plan text)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.cards c
  where c.is_active = true
    and c.plan_tier = p_plan
    and c.id not in (
      select uc.card_id from public.user_cards uc where uc.user_id = auth.uid()
    );
$$;

-- 9. Update seed cards with plan_tier
update public.cards set plan_tier = 'free' where plan_tier is null or plan_tier = '';