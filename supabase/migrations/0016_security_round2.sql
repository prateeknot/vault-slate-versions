-- 0016_security_round2.sql — round-2 security hardening
--
-- 1) user_cards: drop the blanket "user_cards owner" ALL policy (its WITH CHECK
--    only verified user_id = auth.uid(), so any user could INSERT any card_id
--    and assign it to themselves — PROVEN: HTTP 201 + full card incl. CVV
--    returned via cards_for_me). Claiming/assignment must go through the
--    security-definer RPCs only.
drop policy if exists "user_cards owner" on public.user_cards;

create policy "user_cards owner select" on public.user_cards
  for select using (user_id = auth.uid());
create policy "user_cards owner update" on public.user_cards
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_cards owner delete" on public.user_cards
  for delete using (user_id = auth.uid());

-- 2) confirm_order: NEVER client-callable. It marks an order 'paid' and assigns
--    a paid-tier card WITHOUT verifying any payment (PROVEN: create_order ->
--    confirm_order('upi_mock') reached NO_CARD_AVAILABLE, i.e. only card stock
--    stood between a user and a free paid card). Payment confirmation belongs to
--    the payment bot / serverless side only.
revoke execute on function public.confirm_order(uuid, text, text) from public;
revoke execute on function public.confirm_order(uuid, text, text) from anon, authenticated;
grant execute on function public.confirm_order(uuid, text, text) to service_role;

-- 3) vs_client_ip: take the LAST x-forwarded-for entry. The first entry is
--    client-controlled (attacker sets X-Forwarded-For: <fake> and rotates IPs to
--    bypass the admin-login cooldown -> 6-digit code brute force). The LAST
--    entry is appended by Supabase's trusted gateway (Kong), so it is the real
--    peer IP.
create or replace function public.vs_client_ip()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', -1
    )), ''),
    'unknown'
  );
$$;
