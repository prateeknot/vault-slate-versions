# VCardz — Virtual Cards

Temporary virtual card management web app. Admin lists virtual cards in tier pools (Free/Spark/Orbit/Nova/Galaxy/Cosmos/Infinity), users sign up and claim cards with USD balances, and top up via INR packs.

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS v3
- **Auth + DB**: Supabase (Auth, Postgres, RLS + code-gated RPCs)
- **Hosting**: Vercel (GitHub auto-deploy)

## Features

- Sign up / sign in → get a virtual card with a USD balance
- Card tier pools with random USD balances (Free $0 → Infinity $82)
- Top-Up Packs (INR price → USD card balance) with UPI-mock + Telegram Stars checkout
- iOS-inspired liquid-glass UI with 5 color themes: **Mist, Lavender, Sage, Sand, Graphite** (switchable in Account)
- Animated flip cards, shimmer, bottom-nav, card detail modal with one-tap copy
- Full admin panel: overview stats, card CRUD + bulk add, user management + free-card assignment, plan limits, admin codes

## Run Locally

```bash
npm install
npm run dev
# http://localhost:5173
```

## Env Vars

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Project Structure

```
src/
├── main.jsx              # Entry
├── App.jsx               # All pages + components (single-file)
├── index.css             # Theme system + iOS glass surface system
└── lib/supabase.js       # Supabase client
supabase/migrations/      # SQL migrations (schema, RLS, RPCs)
```

## Git / Deploy

- Main branch: `main`, remote: `https://github.com/prateeknot/vault-slate-versions`
- Deploy: push to `main` → Vercel auto-deploys
