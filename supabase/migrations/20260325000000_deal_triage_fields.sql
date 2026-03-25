-- Sprint 16: Deal-level triage metadata columns
-- Orthogonal to property verification status — these live on deals, not properties.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS triage_status text,
  ADD COLUMN IF NOT EXISTS triage_reason_tags text[],
  ADD COLUMN IF NOT EXISTS fmv_plausibility_flag text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deal_triage_status') THEN
    ALTER TABLE public.deals ADD CONSTRAINT chk_deal_triage_status
      CHECK (triage_status IS NULL OR triage_status IN (
        'ready_for_deposit',
        'triage_in_progress',
        'more_info_needed',
        'ineligible'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deal_fmv_plausibility_flag') THEN
    ALTER TABLE public.deals ADD CONSTRAINT chk_deal_fmv_plausibility_flag
      CHECK (fmv_plausibility_flag IS NULL OR fmv_plausibility_flag IN (
        'green',
        'yellow',
        'red'
      ));
  END IF;
END $$;
