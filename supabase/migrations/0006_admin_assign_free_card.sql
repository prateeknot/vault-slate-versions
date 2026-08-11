-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0006: admin_assign_free_card RPC
-- Allows an admin to directly assign an unassigned free-tier card to any user
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing if any
DROP FUNCTION IF EXISTS admin_assign_free_card(uuid, uuid);

-- admin_assign_free_card: picks the oldest unused free card and links it to a user
CREATE OR REPLACE FUNCTION admin_assign_free_card(
  p_token  uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id  uuid;
  v_card_id   uuid;
BEGIN
  -- Auth: validate admin token
  SELECT user_id INTO v_admin_id
  FROM admin_sessions
  WHERE session_token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired admin token';
  END IF;

  -- Pick the first unassigned free card (tier = 'free', not yet in user_cards)
  SELECT c.id INTO v_card_id
  FROM cards c
  WHERE c.tier = 'free'
    AND c.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM user_cards uc WHERE uc.card_id = c.id
    )
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'No unassigned free cards available';
  END IF;

  -- Upsert into user_cards (replace existing assignment if any)
  INSERT INTO user_cards (user_id, card_id, assigned_at)
  VALUES (p_user_id, v_card_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET card_id = EXCLUDED.card_id,
        assigned_at = EXCLUDED.assigned_at;

  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_card_id,
    'user_id', p_user_id
  );
END;
$$;
