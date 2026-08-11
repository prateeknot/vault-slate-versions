# VCardz — Admin Panel Feature Plan (Senior-Dev Review)

Date: 2026-08-11 · Status: v1 (partially implemented)

This document lists what the admin panel already does, what is missing,
and what is planned — with a plain-language description of what each feature
does and why it matters. Marked [DONE] = already live, [NEW] = this build,
[PENDING-SQL] = frontend ready, needs the SQL migration applied.

---

## 1. CURRENT STATE (already in the panel)

| # | Feature | What it does |
|---|---------|--------------|
| 1 | Admin login (6-digit code) | Owner logs in with the admin code; 10s cooldown + IP lockout after failed tries (brute-force guard). Session lasts 2h. |
| 2 | Overview | Stat cards (total cards, total users, active cards, admin codes) + recent cards list. |
| 3 | Manage Cards | Search cards; add/edit/delete/toggle-active; **Bulk Add** (paste a big list of card numbers, auto-random name/provider, pick tier). |
| 4 | Manage Users | Search users; change plan; assign a **free** card to a user. |
| 5 | Settings | Edit plan card-limits (Free/Pro/Max legacy) + manage admin codes (add/delete). |

---

## 2. PROBLEMS FOUND (senior-dev review)

- **Overview stats are weak/fake**: `planDist` is hard-coded to zeros; there is
  no revenue, no order count, no "cards available to sell" number.
- **No Orders/Transactions view**: the `orders` table exists (who bought which
  pack for how much) but the admin cannot see or manage any of it.
- **Packs (the actual product) cannot be managed**: pack prices/balances exist
  only in the DB; admin has no UI to edit them or disable a pack.
- **User plan dropdown uses the OLD Free/Pro/Max system** which the app no
  longer uses — the app is pack-based (Spark…Infinity). Changing a plan does
  nothing useful today.
- **No user suspension**: cannot block a user who misbehaves.
- **No way to see which cards a user owns**, or to revoke/assign a specific
  tier card.
- **No inventory view**: how many unassigned cards remain per tier (stock out
  risk is invisible).
- **Admin session expiry is silent**: when the 2h session dies, the panel just
  shows "Failed to load" instead of prompting a fresh login.
- **No CSV export** of users/cards/orders.

---

## 3. FEATURE PLAN

Priority: **P0** = must have · **P1** = high value · **P2** = nice to have.

### 3.1 Orders / Transactions tab — [NEW]
- **What it does**: Full list of purchases — order id, user name+email, pack
  bought, amount (₹), status (pending/paid/failed/refunded), gateway ref,
  created & paid date.
- **Admin actions**: mark an order Paid / Failed / Refunded (one click).
- **Why**: this is the money trail — without it the admin is flying blind.
- **Needs SQL**: `admin_orders_list`, `admin_order_set_status`. (PENDING-SQL)

### 3.2 Packs management tab — [NEW]
- **What it does**: Lists the packs (Spark ₹299/$15 … Infinity ₹1599/$82).
  Admin edits price (₹), card balance ($), sort order, and can deactivate a
  pack (hidden from users). One-click save.
- **Why**: pricing/product changes should not require touching SQL.
- **Needs SQL**: `admin_pack_set`. (PENDING-SQL)

### 3.3 User suspension — [NEW]
- **What it does**: A suspend/activate toggle per user. A suspended user is
  blocked from logging in (Supabase `banned_until`) and is flagged in the
  users list.
- **Why**: ban rule-breakers without deleting their data.
- **Needs SQL**: `admin_toggle_user_status`. (PENDING-SQL)

### 3.4 User card management — [NEW]
- **What it does**: "View Cards" button per user → shows every card they own
  (number, provider, tier, balance, pack). Admin can remove a card from the
  user, or assign a card of a chosen tier (e.g. give a Galaxy card directly).
- **Why**: support/refunds — take a card back or gift a card.
- **Needs SQL**: `admin_user_cards`, `admin_remove_user_card`,
  `admin_assign_card`. (PENDING-SQL)

### 3.5 Overview revamp (real dashboard) — [NEW]
- **What it does**: Real KPIs — total cards, **available vs assigned** per
  tier (inventory table with low-stock warning), total users, total orders,
  revenue (₹ sum of paid orders), recent orders, plan distribution.
- **Why**: the dashboard should answer "can I still sell pack X?" at a glance.
- **Needs SQL**: `admin_inventory` (+ reuses existing `admin_stats`,
  `admin_orders_list`). (PENDING-SQL)

### 3.6 Admin session-expiry handling — [NEW, NO SQL]
- **What it does**: When the 2h admin token expires, the panel detects
  `SESSION_INVALID` and shows a clear "Session expired — log in again" screen
  instead of a generic failure.
- **Why**: stops confusing "failed to load" errors.

### 3.7 CSV export — [NEW, NO SQL]
- **What it does**: One-click download of Cards / Users / Orders as `.csv`
  (openable in Excel/Sheets).
- **Why**: ad-hoc reporting, migration, sharing.

### 3.8 Tier card-pool inventory [part of 3.5] — [NEW]
- **What it does**: Per-tier table: total / active / assigned / **available**
  with a red warning when a tier is nearly sold out (e.g. < 3 left).
- **Needs SQL**: `admin_inventory`. (PENDING-SQL)

### 3.9 User plan aligned to packs — [NEW]
- **What it does**: The plan dropdown now uses the real pack tiers
  (Free, Spark, Orbit, Nova, Galaxy, Cosmos, Infinity) and updates
  `profiles.plan_type` (what the app actually reads).
- **Needs SQL**: `admin_set_user_plan`. (PENDING-SQL)

### 3.10 Audit log (admin actions) — [P2, future]
- **What it does**: Record key admin actions (login, add/delete card, suspend,
  change plan) in an `admin_actions` table with timestamp + admin label.
- **Why**: accountability if multiple people share the code.
- **Status**: planned for a later build.

### 3.11 Order/notification alerts — [P2, future]
- **What it does**: Badge on Orders tab showing pending-purchase count;
  optional low-inventory alert on the sidebar.
- **Status**: planned for a later build.

---

## 4. WHAT NEEDS TO BE APPLIED (user action)

The new backend functions live in:
`supabase/migrations/0009_admin_features.sql`

**Steps**: Supabase → project `card-vault` → **SQL Editor** → open the file →
**Run**. Nothing else is required — the panel auto-detects the functions.

Features in 3.6 & 3.7 (session expiry + CSV) work immediately after deploy,
without SQL.

---

## 5. VERIFICATION / QA CHECKLIST

- [ ] Admin login → dashboard loads without errors.
- [ ] Orders tab lists real purchases; changing status works.
- [ ] Packs tab edits a price and it reflects on the user side.
- [ ] Suspend a test user → they cannot log in; activate → they can again.
- [ ] View a user's cards → remove one → assign a tier card.
- [ ] Inventory shows available-per-tier; low-stock warning appears.
- [ ] CSV exports open in Excel.
- [ ] Wait 2h (or edit session) → "Session expired" screen, re-login works.
