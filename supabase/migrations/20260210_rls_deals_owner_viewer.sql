BEGIN;

-- deals: viewers can SELECT; only owners can UPDATE/DELETE
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: OWNER or VIEWER
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'deals'
      AND policyname = 'deals_select_owner_or_viewer'
  ) THEN
    CREATE POLICY deals_select_owner_or_viewer
      ON public.deals
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.deal_access_grants g
          WHERE g.deal_id = public.deals.id
            AND g.user_id = auth.uid()
        )
      );
  END IF;

  -- UPDATE: OWNER only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'deals'
      AND policyname = 'deals_update_owner_only'
  ) THEN
    CREATE POLICY deals_update_owner_only
      ON public.deals
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.deal_access_grants g
          WHERE g.deal_id = public.deals.id
            AND g.user_id = auth.uid()
            AND g.role = 'OWNER'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.deal_access_grants g
          WHERE g.deal_id = public.deals.id
            AND g.user_id = auth.uid()
            AND g.role = 'OWNER'
        )
      );
  END IF;

  -- DELETE: OWNER only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'deals'
      AND policyname = 'deals_delete_owner_only'
  ) THEN
    CREATE POLICY deals_delete_owner_only
      ON public.deals
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.deal_access_grants g
          WHERE g.deal_id = public.deals.id
            AND g.user_id = auth.uid()
            AND g.role = 'OWNER'
        )
      );
  END IF;
END $$;

COMMIT;
