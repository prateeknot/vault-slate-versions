-- 0013_admin_card_set_active.sql — set-based card status (fixes bulk Activate/Deactivate
-- buttons which previously used the flip-style admin_card_toggle and could do the
-- opposite of the button label).
create or replace function public.admin_card_set_active(p_token text, p_id uuid, p_active boolean)
returns public.cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.cards%rowtype;
begin
  perform public.vs_admin_code_id(p_token);
  update public.cards set is_active = p_active where id = p_id returning * into v_row;
  if v_row.id is null then
    raise exception 'CARD_NOT_FOUND' using errcode = '22000';
  end if;
  return v_row;
end;
$$;

grant execute on function public.admin_card_set_active(text, uuid, boolean) to authenticated, anon;
