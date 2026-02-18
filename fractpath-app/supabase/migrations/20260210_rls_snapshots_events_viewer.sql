-- APP-SHARE-001: Allow OWNER/VIEWER to SELECT calculator_snapshots and deal_events
-- via deal_access_grants join. No write access for authenticated clients.

BEGIN;

-- calculator_snapshots: SELECT for users with grant on parent deal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'calculator_snapshots'
      AND policyname = 'snapshots_select_via_grant'
  ) THEN
    CREATE POLICY snapshots_select_via_grant
      ON public.calculator_snapshots
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.deal_access_grants g
          WHERE g.deal_id = public.calculator_snapshots.deal_id
            AND g.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- deal_events: SELECT for users with grant on parent deal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'deal_events'
      AND policyname = 'events_select_via_grant'
  ) THEN
    CREATE POLICY events_select_via_grant
      ON public.deal_events
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.deal_access_grants g
          WHERE g.deal_id = public.deal_events.deal_id
            AND g.user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMIT;
