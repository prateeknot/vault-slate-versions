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
VITE_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET=...   # runtime-only, lives in the edge function env (never in the bundle)
```

## Project Structure

```
src/
├── main.jsx              # Entry
├── App.jsx               # All pages + components (single-file)
├── index.css             # Theme system + iOS glass surface system
└── lib/supabase.js       # Supabase client
functions/api/           # Cloudflare Pages Functions (edge) — Turnstile verify
api/                     # Legacy Vercel serverless function (same endpoint, kept for rollback)
supabase/migrations/      # SQL migrations (schema, RLS, RPCs)
wrangler.toml            # Cloudflare Pages config
_redirects / _headers    # Cloudflare Pages SPA fallback + security headers
```

## Deploy on Cloudflare Pages (v9.0.2 — current)

**Option A — Git integration (easiest, auto-deploys on push like Vercel):**
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick `prateeknot/vault-slate-versions`
2. Build command: `npm run build` · Build output directory: `dist`
3. **Environment variables** (Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` (build-time, inlined) and `TURNSTILE_SECRET` (runtime, for the function)
4. Deploy → every push to `main` auto-deploys. Custom domain: Pages → Custom domains → add `paid.cc.cd` (CNAME to `<project>.pages.dev` — automatic if the domain is on Cloudflare DNS)

**Option B — CLI (wrangler, already installed as devDependency):**
```bash
npx wrangler login                                      # browser auth once
npx wrangler pages project create virtual-cards --production-branch=main
npm run build                                           # VITE_* vars inlined from .env
npx wrangler pages deploy dist --project-name=virtual-cards
printf '%s' "$TURNSTILE_SECRET" | npx wrangler pages secret put TURNSTILE_SECRET --project-name=virtual-cards
```

Local test: `npx wrangler pages dev dist` (reads `.env`, runs the edge function at `/api/verify-turnstile`).

## Git / Deploy

- Main branch: `main`, remote: `https://github.com/prateeknot/vault-slate-versions`
- Cloudflare Pages: auto-deploys from `main` (v9.0.2)
- Vercel (legacy): the old `api/` function is kept so the site keeps working there until the domain is fully moved — remove it once Cloudflare is live
