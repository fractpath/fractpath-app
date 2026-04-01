-- Debt basis tracking fields on properties table.
--
-- Policy (from FractPath spec):
--   - ATTOM debt signals are authoritative enough to trigger review but are NOT final truth.
--   - Owner-provided current mortgage/lien documentation is the debt challenge path.
--   - Admin can adopt updated owner-verified secured debt as the canonical current debt basis
--     if documentation supports it.
--   - Title findings can supersede later.
--
-- current_controlling_secured_debt_basis tracks which source is canonical:
--   attom_estimated    — ATTOM totalEstimatedLoanBalance (default after enhanced screening)
--   owner_verified_docs — admin adopted owner-provided mortgage/lien statement(s)
--   admin_adjusted     — admin manually adjusted the debt basis with a noted reason
--   title_confirmed    — title company confirmed balance at closing

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS current_controlling_secured_debt_basis text,
  ADD COLUMN IF NOT EXISTS current_controlling_secured_debt_amount numeric,
  ADD COLUMN IF NOT EXISTS secured_debt_basis_reason text,
  ADD COLUMN IF NOT EXISTS secured_debt_basis_evidence_links jsonb,
  ADD COLUMN IF NOT EXISTS secured_debt_basis_updated_at timestamptz;

-- Constrain basis to known values (NULL = not yet established)
ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_secured_debt_basis_check;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_secured_debt_basis_check
  CHECK (
    current_controlling_secured_debt_basis IS NULL OR
    current_controlling_secured_debt_basis IN (
      'attom_estimated',
      'owner_verified_docs',
      'admin_adjusted',
      'title_confirmed'
    )
  );
