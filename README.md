# VCardz — Virtual Cards

Temporary virtual card management web app. Admin lists virtual cards in tier pools (Spark/Orbit/Nova/Galaxy/Cosmos/Infinity), and users get cards ONLY by buying a Top-Up Pack (pay in-app via UPI QR → owner verifies → plan activates → admin assigns the card). Free card claiming was removed in v9 — no cards without a paid plan.

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS v3
- **Auth + DB**: Supabase (Auth, Postgres, RLS + code-gated RPCs)
- **Hosting**: Cloudflare Pages (GitHub auto-deploy) — live at https://paid.cc.cd

## Features

- Sign up / sign in → **no cards until you buy a Top-Up Pack** (admin-only plan upgrades; live plan sync via realtime)
- Card tier pools (Spark $15 → Infinity $82) — cards are assigned by the admin after plan activation
- Top-Up Packs (INR price → USD card balance) — pay in-app via **UPI QR** (user taps a pack, pays, writes their email in the UPI note → owner verifies in the admin **Payments** tab → plan upgrades instantly; no gateway/commission)
- iOS-inspired liquid-glass UI with 5 color themes: **Mist, Lavender, Sage, Sand, Graphite** (switchable in Account)
- Animated flip cards, shimmer, bottom-nav, card detail modal with one-tap copy
- Full admin panel: overview stats, card CRUD + bulk add, user management + card assignment, Payments tab (UPI QR requests: **Activate auto-assigns the purchased tier's card**), plan limits, admin codes
- **IBAN Accounts (v12):** admin adds European IBAN accounts (with linked card number/expiry/CVV) in Manage Cards → 🏦 IBAN sub-tab; every user sees ALL active IBANs (latest first, no per-user limit) on the IBAN page — reachable from its own **IBAN tab in the bottom nav** or via Cards/Settings links. Plans moved out of the bottom nav — buy via "Add a card" on Cards or "Upgrade Plan" in Settings.
- **Fake ID Generator (v13/v13.1):** the center **+ button in the bottom nav is now the FakeID page** — every Generate pulls a NEW random full identity (personal details + bank + IBAN + credit card) from the admin pool in ~1s and saves it to the user's collection; each saved ID can be **deleted** anytime (returns to the pool). Admin adds IDs by pasting complete formatted blocks into a single textarea in the new **Fake IDs** admin tab.
- **Payments tab (v13.1):** admin Orders + Upgrade Requests merged into one **Payments** page with a sub-tab switch. IBAN cards now use the same list style as the Cards page; IBAN + Fake ID pages have no back button (they are separate nav pages).

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

**Cloudflare gotcha:** keep `VITE_*` vars as **plain_text** (not secret_text) in the Pages project — functions read them at runtime. `TURNSTILE_SECRET` is secret_text and must be re-put with `wrangler pages secret put` after the git source is connected, then a fresh git deployment picks it up. Ad-hoc API-triggered deployments may not bind secrets — always deploy via git push.

## Project Structure

```
src/
├── main.jsx              # Entry
├── App.jsx               # All pages + components (single-file)
├── index.css             # Theme system + iOS glass surface system
└── lib/supabase.js       # Supabase client
functions/api/           # Cloudflare Pages Functions (edge) — Turnstile verify
supabase/migrations/      # SQL migrations (schema, RLS, RPCs)
wrangler.toml            # Cloudflare Pages config
_redirects / _headers    # Cloudflare Pages SPA fallback + security headers
```

## Deploy on Cloudflare Pages (v11 — current)

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
- **Cloudflare Pages** (`virtual-cards` project): auto-deploys from `main` on every push
- Live: **https://paid.cc.cd** (apex + www, both on Cloudflare)
- Vercel: completely removed (project deleted, `api/` + `.vercel` cleaned from repo)
