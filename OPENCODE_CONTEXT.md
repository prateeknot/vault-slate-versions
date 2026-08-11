# 🚀 VCardz Project — Full Context for OpenCode

## Project Location
```
C:\Users\Aorus\Documents\Cline\Workflows\virtual-cards
```

## Tech Stack
- **Frontend**: React 18 + Vite 5 + Tailwind CSS v3
- **Backend**: Supabase (Project: `card-vault`, Ref: `zqckifdofenqmgjfuydj`, Region: `ap-south-1` Mumbai)
- **Main file**: `src/App.jsx` (single-file React app, ~1800 lines)
- **Supabase client**: `src/lib/supabase.js`
- **Dev server**: `npm run dev` → http://localhost:5173

---

## What This App Does
VCardz is a **Virtual Card Management Web App**:
- Users sign up → get assigned **1 virtual card** with a USD balance
- Cards are organized in **Tier Pools** (Free, Spark, Orbit, Nova, Galaxy, Cosmos, Infinity)
- Users can **buy Top-Up Packs** (INR price → USD card balance)
- Admin panel manages cards, users, codes, and settings

---

## V2 Pack System (IMPLEMENTED)

| Pack     | INR Price | USD Card Balance |
|----------|-----------|-----------------|
| Spark    | ₹299      | $15             |
| Orbit    | ₹499      | $26             |
| Nova     | ₹799      | $32             |
| Galaxy   | ₹999      | $49             |
| Cosmos   | ₹1299     | $67             |
| Infinity | ₹1599     | $82             |

---

## Supabase DB Schema (Key Tables & RPCs)

### Tables
- `cards` — has `tier` (text: free/spark/orbit/nova/galaxy/cosmos/infinity), `balance_usd` (numeric), `is_active`, `card_number`, `expiry`, `cvv`, `provider`, `cardholder_name`, `label`
- `user_cards` — `user_id uuid PRIMARY KEY`, `card_id uuid` → enforces 1 card per user
- `orders` — tracks pack purchase orders
- `packs` — the 6 V2 packs
- `admin_sessions` — admin login tokens
- `admin_codes` — 6-digit admin login codes

### Key RPCs
- `my_card()` — returns logged-in user's card details
- `admin_cards(p_token)` — list all cards (admin)
- `admin_card_save(p_token, p_id, p_card_number, p_cardholder_name, p_expiry, p_cvv, p_provider, p_is_active, p_label, p_tier, p_balance_usd)` — add/edit card
- `admin_card_delete(p_token, p_id)` — delete card
- `admin_card_toggle(p_token, p_id)` — toggle active status
- `admin_users(p_token)` — list all users
- `admin_user_plan(p_token, p_id, p_plan)` — change user plan
- `admin_stats(p_token)` — dashboard stats
- `admin_limits(p_token)` — plan limits
- `admin_limit_set(p_token, p_plan, p_limit)` — update plan limit
- `admin_codes_list(p_token)` — list admin codes
- `admin_code_add(p_token, p_code, p_label)` — add admin code
- `admin_code_delete(p_token, p_id)` — delete admin code
- `admin_login(p_code)` — returns session token
- `admin_logout(p_token)` — invalidates session
- `admin_assign_free_card(p_token, p_user_id)` — assign a free-tier card to a user
- `create_order(p_pack_id)` — create a purchase order
- `confirm_order(p_order_id, p_gateway)` — confirm payment, assign card
- `claim_free_card(p_user_id)` — claim a free card
- `available_packs()` — list purchasable packs

---

## App Pages & Components (all in src/App.jsx)

### Pages
1. **LandingPage** — hero section, navigation to auth/cards/pricing
2. **AuthPage** — login/signup + admin code entry
3. **CardsPage** — shows user's 1 virtual card + category filter + search
4. **PricingPage** ✅ UPDATED → 6 Top-Up Packs (INR → USD) + Payment Modal
5. **AccountPage** — profile, plan info, admin access section
6. **AdminPanelPage** ✅ UPDATED → full admin panel (see below)

### AdminPanelPage Tabs (ALL INTACT)
- **Overview** — stats cards (Total Cards, Users, Active Cards, Admin Codes) + Recent Cards list
- **Manage Cards** — searchable table with toggle/edit/delete + Add Card + Bulk Add
- **Manage Users** — searchable user table with plan dropdown + `+ Free Card` button per user
- **Settings** — Plan Limits editor + Admin Codes manager (add/delete)

### Key Components
- `VirtualCardVisual` — animated flip card with USD balance badge overlay
- `BottomNav` — mobile bottom navigation
- `CardDetailModal` — full card details modal with copy buttons
- `ProviderLogo` — Visa/Mastercard/Amex/Discover/RuPay logo
- `Toast` — notification toasts

---

## What Was Implemented (V2 Changes)

### Pricing Page → Top-Up Packs
- Replaced old monthly plans (Free/Pro/Max) with 6 V2 packs
- Payment Modal → simulated UPI checkout → calls `create_order` + `confirm_order`

### Card Visual — USD Balance Badge
- Front of virtual card shows $XX USD badge next to provider logo

### Admin Panel — Card Add/Edit Modal
- Added **Tier Pool** dropdown (Free → Infinity) — auto-fills balance_usd
- Added **Balance (USD)** input with live display

### Admin Panel — Bulk Add Modal
- Added **Tier Pool** selector — all bulk cards get that tier + matching balance_usd

### Admin Panel — Users Tab
- `+ Free Card` button per user → calls `admin_assign_free_card` RPC

### Supabase DB — Migration Deployed
- `0006_admin_assign_free_card.sql` — deployed on remote Supabase DB

---

## Git State
- Branch: `master`
- Tag: `v1-checkpoint` = original v1 app (rollback point)
- To rollback: `git checkout v1-checkpoint -- src/App.jsx`

---

## Constants in App.jsx (top of file)
```js
const V2_PACKS = [
  { id: 'spark', name: 'Spark', price_inr: 299, balance_usd: 15, badge: 'Starter' },
  { id: 'orbit', name: 'Orbit', price_inr: 499, balance_usd: 26, badge: 'Popular' },
  { id: 'nova', name: 'Nova', price_inr: 799, balance_usd: 32, badge: 'Best Value' },
  { id: 'galaxy', name: 'Galaxy', price_inr: 999, balance_usd: 49, badge: 'Pro' },
  { id: 'cosmos', name: 'Cosmos', price_inr: 1299, balance_usd: 67, badge: 'Ultra' },
  { id: 'infinity', name: 'Infinity', price_inr: 1599, balance_usd: 82, badge: 'Max Balance' },
]

const TIER_BALANCES = {
  free: 0, spark: 15, orbit: 26, nova: 32, galaxy: 49, cosmos: 67, infinity: 82,
}
```

---

## How to Run
```powershell
cd C:\Users\Aorus\Documents\Cline\Workflows\virtual-cards
npm run dev
# Opens at http://localhost:5173
```

---

## Notes for OpenCode
- All code is in **one file**: `src/App.jsx`
- Supabase anon key is in `.env` as `VITE_SUPABASE_ANON_KEY`
- Admin login: enter 6-digit code in Account page → "Admin Access" section
- Session storage used for user & admin token persistence
- `PLAN_LIMITS` still used in AccountPage display (legacy, not core to V2 logic)
- Supabase URL: `https://zqckifdofenqmgjfuydj.supabase.co`
