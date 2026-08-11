-- ============================================
-- Virtual Cards — Initial Schema
-- ============================================

-- 1. PLANS
create table if not exists public.plans (
  id text primary key,
  name text not null,
  card_limit integer not null default 0 check (card_limit >= 0),
  price_display text not null default '₹0',
  created_at timestamptz not null default now()
);

insert into public.plans (id, name, card_limit, price_display) values
  ('free', 'Free', 2, '₹0'),
  ('pro', 'Pro', 5, '₹199'),
  ('max', 'Max', 10, '₹499')
on conflict (id) do nothing;

-- 2. USER PLANS
create table if not exists public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id) default 'free',
  updated_at timestamptz not null default now()
);

-- 3. CARDS
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  card_number text not null,
  name text not null,
  expiry text not null,
  cvv text not null,
  bank text not null,
  provider text not null,
  category text default 'Other',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cards_is_active_idx on public.cards (is_active);
create index if not exists cards_created_at_idx on public.cards (created_at desc);

-- 4. ADMIN CODES
create table if not exists public.admin_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code text not null,
  label text,
  is_active boolean not null default true,
  last_used timestamptz,
  created_at timestamptz not null default now()
);

-- 5. CODE SESSIONS
create table if not exists public.code_sessions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.admin_codes(id) on delete cascade,
  session_token text not null unique,
  is_active boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 6. RLS
alter table public.plans enable row level security;
alter table public.user_plans enable row level security;
alter table public.cards enable row level security;
alter table public.admin_codes enable row level security;
alter table public.code_sessions enable row level security;

-- Plans: readable by all authenticated users
drop policy if exists "plans_read_authenticated" on public.plans;
create policy "plans_read_authenticated"
  on public.plans for select
  to authenticated
  using (true);

-- User plans: user can read own
drop policy if exists "user_plans_read_own" on public.user_plans;
create policy "user_plans_read_own"
  on public.user_plans for select
  to authenticated
  using (auth.uid() = user_id);

-- User plans: user can insert own
drop policy if exists "user_plans_insert_own" on public.user_plans;
create policy "user_plans_insert_own"
  on public.user_plans for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Cards: readable by all authenticated users
drop policy if exists "cards_read_authenticated" on public.cards;
create policy "cards_read_authenticated"
  on public.cards for select
  to authenticated
  using (true);

-- Admin codes: no direct access from frontend
drop policy if exists "admin_codes_no_access" on public.admin_codes;
create policy "admin_codes_no_access"
  on public.admin_codes for all
  to authenticated
  using (false);

-- Code sessions: no direct access from frontend
drop policy if exists "code_sessions_no_access" on public.code_sessions;
create policy "code_sessions_no_access"
  on public.code_sessions for all
  to authenticated
  using (false);

-- 7. Auto-create user_plans row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_plans (user_id, plan_id)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8. Helper: get user's plan limit
create or replace function public.get_user_plan_limit()
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(p.card_limit, 0)
  from public.user_plans up
  join public.plans p on p.id = up.plan_id
  where up.user_id = auth.uid();
$$;