# VCardz Version History

Versioning system: **v1 → v2 → v3 → v4 → v5 → ...**
Each major version = a batch of user-facing / admin features shipped together.
Git tags: `v1.0.0`, `v2.0.0`, ... (current tag = `v9.0.0`).
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

| **v8** | S13 (current) | **In-app UPI QR payments (no Telegram needed)** — user taps a pack on the Plans page → `create_upgrade_request` creates a pending request → QR modal (pay + write email in the UPI note) → request appears in the admin panel's new **Payments** tab with the user's name, email, requested plan + amount → **Activate** upgrades the plan instantly (Cards unlock via realtime) or **Decline** blocks re-submission for 24 hours. Telegram-bot-only flow is still supported (same table/RPCs). |

### v8.0.0 — In-app UPI QR payments (S13)
- **Migration 0019** (applied + live-verified end-to-end): `upgrade_requests.user_id` column; `create_upgrade_request()` (authenticated — validates account + pack, blocks duplicate pending, enforces the **24h cooldown** after a decline); `my_upgrade_requests()` (user status history); `admin_payments_list()` / `admin_payment_approve()` / `admin_payment_decline()` (same admin-session token gate as every other admin RPC).
- **Plans page:** "Buy via Telegram" replaced with **"Pay via UPI QR"** — one tap creates the request and opens a QR payment modal (QR image slot + step-by-step: scan → pay exactly ₹X → **write your login email in the UPI payment note** → under review). Pending / 24h-cooldown states disable the buttons; realtime updates status.
- **Admin panel:** new **Payments** tab — name, email, current plan, requested pack, amount, status + **Activate** (instantly upgrades `profiles.plan_type` + clears the user's card lock) / **Decline** (marks rejected, starts the 24h cooldown).
- **Cards page:** red banner when the last request was declined (24h retry notice).
- QR image is a placeholder for now — drop `public/upi-qr.png` and set `UPI_QR_IMAGE` in `src/App.jsx` when the owner provides it.

| **v9** | S14 (current) | **No free cards + live plan sync + QR confirm** — free card claiming removed entirely (`claim_free_card` / `create_order` revoked from users): cards now ONLY come from a paid Top-Up Pack (admin activates the plan + assigns the card). Admin plan changes reach the user **LIVE** via realtime on `profiles` (no refresh needed). UPI QR flow now opens the modal **first** with Confirm/Cancel — the request is created only on Confirm. Real owner QR image applied (`public/upi-qr.jpg`). Login page dock + back button removed. |

### v9.0.2 — Cloudflare Pages migration (S14)
- **New host:** moved from Vercel to **Cloudflare Pages** (user's request — asked for the diff between Vercel and Cloudflare and wanted the CLI installed + the work done).
- **Edge function:** `api/verify-turnstile.js` (Vercel format) converted to **Cloudflare Pages Function** at `functions/api/verify-turnstile.js` (`onRequest` + `Request`/`Response`; env via `context.env.TURNSTILE_SECRET`; client IP via `cf-connecting-ip` with trusted x-forwarded-for fallback). **Verified locally end-to-end** (Node harness hitting the real siteverify API with the real secret): GET→405, empty body→400, bad JSON→400, fake token→403 `invalid-input-response`.
- **Config:** `wrangler.toml` (project `virtual-cards`, `pages_build_output_dir = dist`, compat date) · `_redirects` SPA fallback (`/* /index.html 200` — functions take precedence for `/api/*`) · `_headers` security headers (nosniff, DENY frame, strict-origin referrer, empty permissions).
- **Tooling:** wrangler 4.122.0 added as devDependency (project-scoped). Legacy Vercel `api/` function KEPT for rollback — both endpoints coexist.
- **Verified:** bundle inlines Supabase URL, `TURNSTILE_SECRET` NOT in bundle; build passes.
- **User action needed:** connect the GitHub repo in the Cloudflare dashboard (build `npm run build`, output `dist`, env vars `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET`) OR give me a Cloudflare API token and I'll deploy via CLI. Then point `paid.cc.cd` (CNAME to `<project>.pages.dev`) at Cloudflare.

### v9.0.1 — React Doctor cleanup pass (S14)
- **Real bugs fixed:** Turnstile `fetch` now checks HTTP status BEFORE consuming the response body; dead favicon reference removed (`/vite.svg` didn't exist → 404 on every load — replaced with an inline SVG card icon); AdminPanel initial-load effect now depends on `token`; FAQ accordion uses real keys (`item.q`) instead of array indexes; `aria-label`s added to the 4 search inputs + admin OTP digits.
- **Perf/cleanup:** static values moved out of components to module scope (auth input classes, admin empty form, all-tiers list, random-name/provider pools) so they aren't rebuilt every render; unused `PLAN_TIERS` dead constant removed; `plan` signup state is now a plain const (was only used in handlers).
- **Reviewed & kept (false positives / intentional):** all `createObjectURL` calls already `revokeObjectURL` (deferred 100ms); all realtime subscriptions already cleaned up (`cancelled` flag + `removeChannel`); anon key in bundle is normal Supabase architecture (RLS + code-gated RPCs are the protection); `transition-all` classes are a deliberate UI style; sequential admin bulk loops intentionally stay sequential to avoid rate-limit bursts.
- **Release:** commit + tag `v9.0.1`.

### v9.0.0 — No free cards + live plan sync + QR confirm (S14)
- **Migration 0020** (applied + verified live): `revoke execute on claim_free_card()/create_order(text) from public, anon, authenticated` (only service_role can call them now — verified grants); `profiles` added to the `supabase_realtime` publication.
- **Cards gating:** signup/login no longer grants any card — free claim UI, guest free-card CTA and the admin free-claims toggle/badge removed. Cards page empty state now points to the Plans page; only an admin-assigned card after a paid pack shows up.
- **Live plan sync:** App() subscribes to `profiles` realtime (own row) and instantly updates the plan badge/limits when the admin changes a plan in the Users tab or activates a payment.
- **QR confirm/cancel:** tapping "Pay via UPI QR" opens the QR modal first — user reviews, then presses **Confirm & Send Request** (or **Cancel**). The `upgrade_requests` row is only created on Confirm; accidental lock-outs are impossible.
- **Real QR image:** owner's `5181481080731667578_121.jpg` shipped as `public/upi-qr.jpg` + `UPI_QR_IMAGE = '/upi-qr.jpg'` (placeholder removed).
- **Login page cleanup:** bottom dock + header back button removed (app can only be used after login/signup/guest), padding adjusted.
- **Admin Users tab:** plan dropdown now normalizes plan casing (spark → Spark) so the value always matches an option.

| **v7** | S12 | **Telegram QR-payment foundation** — `upgrade_requests` table + RPCs (`my_pending_requests`, `bot_lookup_email`, `bot_approve_upgrade`, `bot_reject_upgrade`) with strict RLS (clients read own rows only, bot writes via service_role). Cards page is **locked with a "Payment Under Review" screen** while a request is pending — unlocks instantly (realtime) on approve/reject. **Telegram Stars completely removed** (stars fields, `BOT_API_BASE` callback flow, Stars success modal, ⭐ button). Full bot build spec shipped: `TELEGRAM_BOT_PROMPT.txt` (architecture diagram + flow + commands + edge cases). |

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
