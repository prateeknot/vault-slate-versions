-- 0014_v5_user_features.sql — v5 user features + realtime fix
-- 1) user_cards: nickname + favorite
alter table public.user_cards add column if not exists note text not null default '';
alter table public.user_cards add column if not exists is_favorite boolean not null default false;

-- 2) my_card_update(p_uc_id, p_note, p_favorite) — user updates ONLY their own card metadata
create or replace function public.my_card_update(p_uc_id uuid, p_note text default null, p_favorite boolean default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned boolean;
begin
  select exists(select 1 from public.user_cards where id = p_uc_id and user_id = auth.uid()) into v_owned;
  if not v_owned then
    raise exception 'CARD_NOT_YOURS' using errcode = '22000';
  end if;
  update public.user_cards
     set note        = coalesce(p_note, note),
         is_favorite = coalesce(p_favorite, is_favorite)
   where id = p_uc_id;
  return json_build_object('ok', true);
end;
$$;
grant execute on function public.my_card_update(uuid, text, boolean) to authenticated;

-- 3) extend cards_for_me() to include uc_id / note / is_favorite (v5 features)
create or replace function public.cards_for_me()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select coalesce(json_agg(
    json_build_object(
      'id', c.id,
      'uc_id', uc.id,
      'card_number', c.card_number,
      'cardholder_name', c.cardholder_name,
      'expiry', c.expiry,
      'cvv', c.cvv,
      'provider', c.provider,
      'tier', c.tier,
      'label', c.label,
      'note', uc.note,
      'is_favorite', uc.is_favorite,
      'balance_usd', c.balance_usd,
      'created_at', c.created_at,
      'unlocked', true
    ) order by uc.created_at desc
  ), '[]'::json) into v_result
  from public.user_cards uc
  join public.cards c on c.id = uc.card_id
  where uc.user_id = auth.uid();

  return v_result;
end;
$$;
grant execute on function public.cards_for_me() to authenticated;

-- 4) REALTIME FIX: admin card assignment writes to user_cards (not cards) —
--    broadcast those too, so users see new/removed cards within seconds.
alter publication supabase_realtime add table public.user_cards;
alter publication supabase_realtime add table public.orders;
