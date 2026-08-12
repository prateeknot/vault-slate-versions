# VCardz Version History

Versioning system: **v1 → v2 → v3 → v4 → v5 → ...**
Each major version = a batch of user-facing / admin features shipped together.
Git tags: `v1.0.0`, `v2.0.0`, ... (current tag = `v5.0.0`).
The current app version is displayed in Settings (Account page) and defined as `APP_VERSION` in `src/App.jsx`.

| Version | Release | What's new |
|---------|---------|-----------|
| **v1** | original | Base VCardz app — landing, auth (email + Google), cards page with preview, pack pricing, single-file `src/App.jsx`, Supabase backend (cards, user_cards, profiles, orders). |
| **v2** | later | Top-Up packs model (Spark → Infinity, ₹299–₹1599 with USD card balances), Telegram Stars payment path, card pools + free-card claim with random USD balance, admin code sessions. |
| **v3** | later | Admin user management, security fixes (RLS, admin RPC gating via 6-digit code), multi-card admin sessions, FIFO free-card sequencing, admin panel tabs (overview/cards/users/orders/packs/settings). |
| **v4** | S9–S10 | Full bug-fix release: sold-out handling (`tier_stock` RPC), guest cards CTA, real landing count, Turnstile fallback, legacy plan selector removed. **Admin Panel V3**: maintenance mode, announcement banner, force theme, free-claims toggle, pack stock badges, expiry + duplicate card filters, bulk card/user ops, order date-range filter, JSON backup, admin sessions list + revoke. |
| **v5** | S11 (current) | **User-focused release** — see `TESTING_REPORT.md` §S11. Highlights: realtime instant card updates (admin → user in seconds), card nicknames, favorites (★ filter), wallet summary (total balance + claim progress), expiring-soon alerts, grid/list view toggle, one-tap card export, change password, edit display name, Help & FAQ page, pack comparison table. |

### v5.0.1 — security hotfix (S11 audit)
- **CRITICAL fix:** `cards_read_authenticated` RLS policy (`SELECT, qual = TRUE`) let any signed-up user read ALL card numbers + CVVs directly via REST (597 rows, proven live). Dropped the policy + revoked direct DML grants on `cards` from `anon`/`authenticated`. All card access now goes exclusively through security-definer RPCs (verified: user/admin RPCs unaffected).

### v5.0.2 — security hardening round 2 (S11 audit #2)
- **CRITICAL:** `confirm_order` marked orders `paid` + assigned paid-tier cards **without verifying any payment** (proven: `create_order` → `confirm_order('upi_mock')` reached only `NO_CARD_AVAILABLE`). Now revoked from clients — service_role/bot only; mock "Simulated UPI Checkout" UI removed (Buy → Telegram directly).
- **CRITICAL:** `user_cards` policy allowed INSERT (proven: user self-assigned any card, full CVV returned). Now SELECT/UPDATE/DELETE only + UPDATE restricted to `note`/`is_favorite` columns. Claiming is RPC-only.
- **HIGH:** `vs_client_ip` used the FIRST `X-Forwarded-For` entry (client-spoofable) → admin-login cooldown bypass → 6-digit brute force. Now uses the LAST (trusted-gateway) entry.
- **MEDIUM:** `create_order` now caps pending orders to 1 per user (anti-spam).

| **v6** | S11d (current) | **UI glass fix** — frosted-glass blur now lives only on the content box (`max-w-md`), not the full-width header/nav wrapper, so the blur region exactly matches the rounded boxes (no more full-width blur leaking past on wide screens). Mobile look preserved; desktop now shows clean centered rounded glass bars. |

### v6.0.1 — UI glass fix round 2
- Header frosted-glass pill now applies at **ALL screen sizes** — same as the bottom nav (previously desktop-only via the `≥641px` media query; mobile header kept the old full-width frosted bar). Now the top box matches the bottom box: rounded pill + glass on the `max-w-md` content box everywhere, wrapper fully transparent. No media query left in the header/nav glass rules.

### v6.0.2 — pill radius alignment
- Header pill corner radius aligned to **28px (1.75rem)** to exactly match the bottom-nav pill (`rounded-[28px]`) — top and bottom boxes now look identical.

| **v7** | S12 (current) | **Telegram QR-payment foundation** — `upgrade_requests` table + RPCs (`my_pending_requests`, `bot_lookup_email`, `bot_approve_upgrade`, `bot_reject_upgrade`) with strict RLS (clients read own rows only, bot writes via service_role). Cards page is **locked with a "Payment Under Review" screen** while a request is pending — unlocks instantly (realtime) on approve/reject. **Telegram Stars completely removed** (stars fields, `BOT_API_BASE` callback flow, Stars success modal, ⭐ button). Full bot build spec shipped: `TELEGRAM_BOT_PROMPT.txt` (architecture diagram + flow + commands + edge cases). |

### v7.0.0 — Telegram QR-payment foundation (S12)
- **New table `upgrade_requests`** (migration 0018, applied + verified live): pending/approved/rejected/refunded lifecycle, unique-paise amounts (e.g. ₹599.37) so the owner can match each credit in PhonePe by exact amount.
- **New RPCs:** `my_pending_requests()` (authenticated — powers the Cards lock), `bot_lookup_email()` / `bot_approve_upgrade()` / `bot_reject_upgrade()` (service_role ONLY — verified: anon 401, live user got own pending row).
- **Website gating:** Cards page renders a lock screen while any request is pending; realtime on `upgrade_requests` clears it the moment the owner approves/rejects.
- **Telegram Stars removed:** `stars` fields, `BOT_API_BASE`/`telegram_id` return flow, "Stars" success modal, ⭐ on Buy button — verified 0 refs left; README updated.
- **`TELEGRAM_BOT_PROMPT.txt`** (repo root `/ai`): full spec so any AI can build the bot (Node/Telegraf/Supabase, QR, commands, security rules).

## How to bump a version
1. Create a new git tag: `git tag vX.0.0 && git push origin vX.0.0`
2. Bump `APP_VERSION` in `src/App.jsx`
3. Add a row to the table above
4. Update `docs/02_MEMORY.md` + `TESTING_REPORT.md` (R5 rule)
