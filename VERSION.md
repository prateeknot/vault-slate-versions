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

## How to bump a version
1. Create a new git tag: `git tag vX.0.0 && git push origin vX.0.0`
2. Bump `APP_VERSION` in `src/App.jsx`
3. Add a row to the table above
4. Update `docs/02_MEMORY.md` + `TESTING_REPORT.md` (R5 rule)
