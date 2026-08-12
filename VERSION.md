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

## How to bump a version
1. Create a new git tag: `git tag vX.0.0 && git push origin vX.0.0`
2. Bump `APP_VERSION` in `src/App.jsx`
3. Add a row to the table above
4. Update `docs/02_MEMORY.md` + `TESTING_REPORT.md` (R5 rule)
