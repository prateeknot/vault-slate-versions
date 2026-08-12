-- 0015_security_cards_leak_fix.sql — CRITICAL security fix
--
-- Bug found during v5 security audit (S11):
--   policy `cards_read_authenticated` (SELECT, qual = TRUE) on public.cards let ANY
--   signed-up user read the whole cards table directly via REST — full card
--   numbers + CVVs + expiries (597 rows readable, proven live).
--
-- The app never reads `cards` directly (only via security-definer RPCs:
-- cards_for_me, admin_cards, admin_inventory, tier_stock, claim_free_card...),
-- so locking the table down breaks nothing.

-- 1) remove the dangerous policy
drop policy if exists cards_read_authenticated on public.cards;

-- 2) revoke direct DML from client roles (defense in depth — all card access
--    must go through the RPC layer)
revoke select, insert, update, delete on public.cards from anon, authenticated;
