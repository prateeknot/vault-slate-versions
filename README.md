# VCardz — Virtual Cards

Temporary virtual card management web app. Admin lists virtual cards in tier pools (Spark/Orbit/Nova/Galaxy/Cosmos/Infinity), and users get cards ONLY by buying a Top-Up Pack (pay in-app via UPI QR → owner verifies → plan activates → admin assigns the card). Free card claiming was removed in v9 — no cards without a paid plan.

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS v3
- **Auth + DB**: Supabase (Auth, Postgres, RLS + code-gated RPCs)
- **Hosting**: Vercel (GitHub auto-deploy)

## Features

- Sign up / sign in → **no cards until you buy a Top-Up Pack** (admin-only plan upgrades; live plan sync via realtime)
- Card tier pools (Spark $15 → Infinity $82) — cards are assigned by the admin after plan activation
- Top-Up Packs (INR price → USD card balance) — pay in-app via **UPI QR** (user taps a pack, pays, writes their email in the UPI note → owner verifies in the admin **Payments** tab → plan upgrades instantly; no gateway/commission)
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
