-- ============================================
-- Fix claim_free_card — subquery must return only one column
-- The `v_card := (select * from ...)` pattern fails because
-- `select *` returns multiple columns. Use `select ... into` instead.
-- ============================================

create or replace function public.claim_free_card()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cards  uuid[];
  v_card   public.cards%rowtype;
  v_me     public.user_cards%rowtype;
begin
  select * into v_me from public.user_cards where user_id = auth.uid();
  if v_me.user_id is not null then
    return (select public.my_card());
  end if;

  select array_agg(id order by created_at asc, id asc) into v_cards
    from public.cards c
   where c.is_active
     and c.tier = 'free'
     and not exists (select 1 from public.user_cards uc where uc.card_id = c.id);

  if v_cards is null or cardinality(v_cards) = 0 then
    return null;
  end if;

  select * into v_card from public.cards where id = v_cards[1];

  insert into public.user_cards (user_id, card_id, pack_id)
  values (auth.uid(), v_card.id, 'free');

  return (select public.my_card());
end;
$$;