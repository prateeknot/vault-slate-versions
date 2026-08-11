# Virtual Cards — Base

Responsive web platform where an admin lists temporary virtual cards, and users (Free/Pro/Max plans) can view and copy card details.

## Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Auth + DB**: Supabase (Auth, Postgres, RLS + RPC)
- **Bot protection**: Cloudflare Turnstile (to be wired)
- **Hosting**: Vercel (to be connected)

## Project Structure
```
virtual-cards/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js      # Design tokens (accent teal, neutral palette)
├── postcss.config.js
├── .env.example            # Env var template
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql   # Tables, RLS, masked view
└── src/
    ├── main.jsx
    ├── App.jsx             # Routing
    ├── index.css           # Global styles + component classes
    ├── lib/
    │   └── supabase.js     # Supabase client
    ├── components/
    │   ├── Logo.jsx
    │   ├── CardItem.jsx    # Card display (masked/unmasked)
    │   └── CopyButton.jsx
    └── pages/
        ├── LandingPage.jsx
        ├── AuthPage.jsx    # Login/signup + Turnstile placeholder
        ├── CardListingPage.jsx
        ├── AdminPanelPage.jsx  # 6-digit code + card mgmt + plan limits
        └── PricingPage.jsx
```

## Design System
- **Colors**: White/neutral base + single accent (teal `#0D9488`)
- **Fonts**: Inter (sans) + JetBrains Mono (mono for card numbers)
- **Style**: Restrained spacing, subtle borders/shadows, understated UI
- **Mobile-first**: `container-mobile` (max-w-md) for phone-first, centered on desktop

## Pages
| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/auth` | Login/signup + Turnstile |
| `/cards` | Card listing (masked/unmasked by plan) |
| `/admin` | Admin panel (6-digit code gate) |
| `/pricing` | Free/Pro/Max plans display |

## Database (Supabase)
- `plans` — Free/Pro/Max with admin-adjustable card limits
- `user_plans` — maps auth users to plans (auto-created on signup via trigger)
- `cards` — full card details; **no direct table access from the API**
- `user_cards` — claims (unique per user + card), created only via validated RPC
- `admin_codes` — 6-digit codes; gate for admin RPCs
- `code_sessions` — reserved for future session lock

### Security model (migration `0003_security_fixes.sql`)
- `masked_cards` view — the ONLY frontend-readable projection of cards (last4 + metadata, **never CVV**)
- User RPCs: `get_my_plan`, `get_available_cards` (masked), `get_claimed_card_details` (full details only for the caller's claimed cards), `claim_card` (server-side validated: active card + matching plan tier + plan limit)
- Admin RPCs: every call is gated by a 6-digit code (`admin_verify_code`, `admin_list_cards`, `admin_add_card`, …)
- ⚠️ No `VITE_SUPABASE_SERVICE_KEY` in the frontend — the old service-role client was removed

## Next Steps
1. Apply `0003_security_fixes.sql`: `SUPABASE_ACCESS_TOKEN=xxx SUPABASE_PROJECT_REF=yyy node apply-sql.js supabase/migrations/0003_security_fixes.sql`
2. **Revoke the old `sbp_v0_...` access token** leaked in earlier commits (Supabase → Account → Access Tokens)
3. Add env vars to `.env` (anon key only) and to your shell for the local scripts
4. Wire up Cloudflare Turnstile (client widget + server-side verify)
5. Wire up payment gateway for Pro/Max upgrades
6. Connect private GitHub repo → Vercel auto-deploy