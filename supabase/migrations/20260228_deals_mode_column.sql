-- Sprint 11.5 — Contract Alignment: deals.mode column
--
-- App code reads deals.mode in:
--   - src/app/deal/[dealId]/page.tsx (display)
--   - src/app/api/deals/[dealId]/fork/route.ts (copy to forked deal)
--   - src/app/dashboard/page.tsx (query)
--
-- The deals table migration (20260210_app_int_001) did not define this column.
-- It was likely added to the live DB outside of migrations. This migration
-- reconciles the drift by adding the column if missing.

BEGIN;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'app';

COMMENT ON COLUMN public.deals.mode IS
  'Deal creation mode. Values: app (created in-app), marketing (from marketing widget/draft token), fork (forked from another deal). Default: app.';

UPDATE public.deals SET mode = 'app' WHERE mode IS NULL;

COMMIT;
