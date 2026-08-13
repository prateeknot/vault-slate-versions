-- ============================================================
-- Migration 0020: No cards without a paid plan + live plan sync
-- v9.0.0
--
-- 1. Revoke claim_free_card from users — cards can ONLY be
--    obtained via a paid Top-Up Pack (admin activates the plan
--    and assigns the card). No more free $1-$15 cards on signup.
-- 2. Revoke the legacy create_order RPC from users — the v8
--    UPI QR flow (upgrade_requests) is the only purchase path.
-- 3. Publish profiles to realtime so plan upgrades (admin panel
--    or payment approval) reach the logged-in user LIVE without
--    a page refresh.
-- ============================================================

-- 1. Free-card self-claim: users can no longer execute it.
--    (service_role keeps access so nothing else breaks.)
revoke execute on function public.claim_free_card() from public, anon, authenticated;

-- 2. Legacy order creation — no longer part of the purchase flow.
revoke execute on function public.create_order(text) from public, anon, authenticated;

-- 3. Realtime: profiles changes (plan_type) push to the user's app.
alter publication supabase_realtime add table public.profiles;
