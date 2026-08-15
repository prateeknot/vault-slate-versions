-- 0027_fake_id_collection.sql — Fake IDs: multi-generate per user (v13.1)
--
-- v13.0 gave each user ONE fake ID (idempotent — regenerating returned the
-- same one). The product changed: a user can now Generate as many times as
-- they want — every generate pulls a NEW random ID from the admin pool and
-- saves it into their collection ("jhola"). Each saved ID can be deleted
-- (it goes back to the pool so other users can get it).
--
-- Changes:
--   * fake_id_generate()  — ALWAYS picks a fresh random unassigned ID (no more
--                           "return existing" short-circuit).
--   * fake_id_mine()      — returns ALL the user's IDs as a list.
--   * fake_id_delete(p_id)— user removes one of their own IDs (back to pool).

-- generate: pick a random unassigned active ID and lock it to the caller.
create or replace function public.fake_id_generate()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_picked uuid;
  v_row public.fake_ids%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- pick a random unassigned active row, with a race-safe claim (up to 3
  -- tries — if two users pick the same row at once, the loser retries)
  for i in 1..3 loop
    select id into v_picked from public.fake_ids
    where is_active and assigned_user_id is null
    order by random()
    limit 1;

    if v_picked is null then
      return json_build_object('ok', false, 'error', 'NO_FAKE_IDS_AVAILABLE');
    end if;

    update public.fake_ids
    set assigned_user_id = v_uid, assigned_at = now(), updated_at = now()
    where id = v_picked and assigned_user_id is null
    returning * into v_row;

    if v_row.id is not null then
      exit;
    end if;
  end loop;

  if v_row.id is null then
    return json_build_object('ok', false, 'error', 'NO_FAKE_IDS_AVAILABLE');
  end if;

  return json_build_object('ok', true, 'id', v_row.id, 'content', v_row.content,
    'name', v_row.name, 'iban', v_row.iban, 'email', v_row.email,
    'country', v_row.country);
end;
$$;

-- my IDs (ALL of them — the collection)
create or replace function public.fake_id_mine()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_ids json;
begin
  select coalesce(json_agg(json_build_object(
    'id', f.id,
    'content', f.content,
    'name', f.name,
    'iban', f.iban,
    'email', f.email,
    'country', f.country,
    'assigned_at', f.assigned_at
  ) order by f.assigned_at desc), '[]'::json) into v_ids
  from public.fake_ids f
  where f.assigned_user_id = auth.uid() and f.is_active;

  return json_build_object('ok', true, 'ids', v_ids);
end;
$$;

-- delete one of MY IDs (frees it back to the pool)
create or replace function public.fake_id_delete(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  update public.fake_ids
  set assigned_user_id = null, assigned_at = null, updated_at = now()
  where id = p_id and assigned_user_id = v_uid;

  if not found then
    return json_build_object('ok', false, 'error', 'NOT_YOURS');
  end if;
  return json_build_object('ok', true);
end;
$$;

-- grants
grant execute on function public.fake_id_generate() to anon, authenticated, service_role;
grant execute on function public.fake_id_mine() to anon, authenticated, service_role;
grant execute on function public.fake_id_delete(uuid) to anon, authenticated, service_role;
