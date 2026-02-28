-- Sprint 11.5 — Contract Alignment: Authoritative v2 RPCs
--
-- These functions are the canonical versions matching what the application
-- code actually calls today. Legacy functions (create_deal_with_owner_grant,
-- mint_deal_share_token, redeem_deal_share_token) may still exist in the
-- live database but are DEPRECATED and should not be used by new code.
--
-- Each function follows existing conventions:
--   SECURITY DEFINER, explicit search_path, CREATE OR REPLACE, REVOKE PUBLIC.
--
-- This migration is additive-only. It does NOT drop or alter existing functions.

BEGIN;

-- ============================================================
-- 0. Add max_redemptions / redemption_count to deal_share_tokens
-- ============================================================
-- App code (src/app/share/page.tsx) reads these columns. They were not in the
-- original migration but may exist in the live DB. Add IF NOT EXISTS to be safe.

ALTER TABLE public.deal_share_tokens
  ADD COLUMN IF NOT EXISTS max_redemptions integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS redemption_count integer NOT NULL DEFAULT 0;

-- ============================================================
-- 1. create_deal_with_owner_grant_v2
-- ============================================================
-- App callsite: src/app/api/deals/create/route.ts
-- Called as:    supabase.rpc("create_deal_with_owner_grant_v2", { p_user_id })
-- Returns:     UUID (the new deal id)
--
-- Differences from legacy:
--   - No p_property_address parameter (app never passes it)
--   - Inserts into deals using (owner_user_id, status, created_from, mode)
--     which matches the actual deals table columns

CREATE OR REPLACE FUNCTION public.create_deal_with_owner_grant_v2(
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_deal_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  INSERT INTO public.deals (owner_user_id, status, created_from, mode)
  VALUES (p_user_id, 'IMPORTED', 'app', 'app')
  RETURNING id INTO v_deal_id;

  INSERT INTO public.deal_access_grants (deal_id, user_id, role, created_by)
  VALUES (v_deal_id, p_user_id, 'OWNER', p_user_id);

  RETURN v_deal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_deal_with_owner_grant_v2(uuid) FROM PUBLIC;

-- ============================================================
-- 2. mint_deal_share_token_v2
-- ============================================================
-- App callsite: src/app/api/deals/[dealId]/share/route.ts
-- Called as:    supabase.rpc("mint_deal_share_token_v2", { p_deal_id, p_actor_user_id })
-- Returns:     TEXT (the opaque token string)
--
-- Enforces:
--   - Actor must have OWNER grant on the deal
--   - Generates 64-char hex token (32 random bytes)
--   - 30-day expiry (matches deal_share_tokens.expires_at default)
--   - max_redemptions defaults to 1

CREATE OR REPLACE FUNCTION public.mint_deal_share_token_v2(
  p_deal_id uuid,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_token text;
  v_caller_id uuid;
  v_has_owner_grant boolean;
BEGIN
  IF p_deal_id IS NULL THEN
    RAISE EXCEPTION 'p_deal_id is required';
  END IF;
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'p_actor_user_id is required';
  END IF;

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR v_caller_id != p_actor_user_id THEN
    RAISE EXCEPTION 'p_actor_user_id must match authenticated user'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.deal_access_grants
    WHERE deal_id = p_deal_id
      AND user_id = p_actor_user_id
      AND role = 'OWNER'
  ) INTO v_has_owner_grant;

  IF NOT v_has_owner_grant THEN
    RAISE EXCEPTION 'Only OWNER can mint share tokens'
      USING ERRCODE = '42501';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.deal_share_tokens (
    token, deal_id, created_by, expires_at
  )
  VALUES (
    v_token,
    p_deal_id,
    p_actor_user_id,
    now() + interval '30 days'
  );

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_deal_share_token_v2(uuid, uuid) FROM PUBLIC;

-- ============================================================
-- 3. redeem_deal_share_token_v2
-- ============================================================
-- App callsite: src/app/share/page.tsx
-- Called as:    supabase.rpc("redeem_deal_share_token_v2", { p_token })
-- Returns:     UUID (the deal_id)
--
-- Enforces:
--   - Token must exist and not be expired or revoked
--   - Caller (auth.uid()) gets a VIEWER grant (upserted, idempotent)
--   - Owner cannot redeem their own share token (no self-grant)

CREATE OR REPLACE FUNCTION public.redeem_deal_share_token_v2(
  p_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_token_row record;
  v_caller_id uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'p_token is required';
  END IF;

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT token, deal_id, created_by, expires_at, revoked_at,
         max_redemptions, redemption_count
  INTO v_token_row
  FROM public.deal_share_tokens
  WHERE token = p_token
  FOR UPDATE;

  IF v_token_row IS NULL THEN
    RAISE EXCEPTION 'Invalid share token';
  END IF;

  IF v_token_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Share token has been revoked';
  END IF;

  IF v_token_row.expires_at < now() THEN
    RAISE EXCEPTION 'Share token has expired';
  END IF;

  IF v_token_row.max_redemptions IS NOT NULL
     AND v_token_row.redemption_count >= v_token_row.max_redemptions THEN
    RAISE EXCEPTION 'Share token has reached maximum redemptions';
  END IF;

  IF v_token_row.created_by = v_caller_id THEN
    RETURN v_token_row.deal_id;
  END IF;

  INSERT INTO public.deal_access_grants (deal_id, user_id, role, created_by)
  VALUES (v_token_row.deal_id, v_caller_id, 'VIEWER', v_token_row.created_by)
  ON CONFLICT (deal_id, user_id) DO NOTHING;

  UPDATE public.deal_share_tokens
  SET redemption_count = redemption_count + 1
  WHERE token = p_token;

  RETURN v_token_row.deal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_deal_share_token_v2(text) FROM PUBLIC;

-- ============================================================
-- 4. is_admin (add to migrations if not present)
-- ============================================================
-- App callsite: src/lib/auth/requireAdmin.ts
-- Called as:    supabase.rpc("is_admin")  — no params
-- Returns:     BOOLEAN
--
-- Checks user_metadata->>'role' = 'admin' on the calling user.
-- This matches the existing admin guard convention.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT raw_user_meta_data->>'role'
  INTO v_role
  FROM auth.users
  WHERE id = auth.uid();

  RETURN v_role = 'admin';
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMIT;
