-- APP: profiles + properties tables with RLS
-- profiles: user profile data, consent capture, EULA versioning
-- properties: multiple per user, address, status, privacy

BEGIN;

-- ============================================================
-- 0. updated_at trigger function (reusable)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1. profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name       text NOT NULL,
  last_name        text NOT NULL,
  nickname         text NOT NULL,
  phone            text,
  marketing_opt_in boolean NOT NULL DEFAULT true,
  sms_consent      boolean NOT NULL DEFAULT false,
  sms_consent_at   timestamptz,
  eula_version     text,
  eula_accepted_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_deny_delete" ON public.profiles;
CREATE POLICY "profiles_deny_delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 2. properties
-- ============================================================
CREATE TABLE IF NOT EXISTS public.properties (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address        text NOT NULL,
  status         text NOT NULL DEFAULT 'unverified'
                   CHECK (status IN ('unverified', 'verified', 'archived')),
  visibility     text NOT NULL DEFAULT 'private'
                   CHECK (visibility IN ('private', 'public')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_owner
  ON public.properties (owner_user_id);

-- Only one verified property per owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_one_verified_per_owner
  ON public.properties (owner_user_id) WHERE status = 'verified';

-- Cross-column constraint: visibility=public requires status=verified
ALTER TABLE public.properties
  ADD CONSTRAINT chk_visibility_requires_verified
  CHECK (visibility = 'private' OR status = 'verified');

DROP TRIGGER IF EXISTS trg_properties_updated_at ON public.properties;
CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "properties_select_own" ON public.properties;
CREATE POLICY "properties_select_own"
  ON public.properties FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "properties_insert_own" ON public.properties;
CREATE POLICY "properties_insert_own"
  ON public.properties FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND status = 'unverified'
    AND visibility = 'private'
  );

DROP POLICY IF EXISTS "properties_update_own" ON public.properties;
CREATE POLICY "properties_update_own"
  ON public.properties FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (
    owner_user_id = auth.uid()
    AND status IN ('unverified', 'archived')
  );

DROP POLICY IF EXISTS "properties_deny_delete" ON public.properties;
CREATE POLICY "properties_deny_delete"
  ON public.properties FOR DELETE
  TO authenticated
  USING (false);

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run after applying)
-- ============================================================
-- 1. Tables exist:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name IN ('profiles', 'properties');
--
-- 2. RLS enabled:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN ('profiles', 'properties');
--
-- 3. Policies:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('profiles', 'properties');
--
-- 4. Unique partial index (one verified per owner):
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'properties' AND indexname = 'idx_properties_one_verified_per_owner';
--
-- 5. Check constraints:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.properties'::regclass AND contype = 'c';
