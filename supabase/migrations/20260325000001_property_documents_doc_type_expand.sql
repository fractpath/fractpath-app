-- ============================================================
-- Expand property_documents.doc_type check constraint to allow
-- all supporting document types added in sprint 16.
-- ============================================================

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.property_documents'::regclass
    AND contype = 'c'
    AND conname = 'property_documents_doc_type_check';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.property_documents DROP CONSTRAINT %I', cname);
  END IF;
END$$;

ALTER TABLE public.property_documents
  ADD CONSTRAINT property_documents_doc_type_check
  CHECK (doc_type IN (
    -- Baseline verification docs
    'selfie',
    'drivers_license',
    'utility_bill',
    -- Secured debt (sprint 15, multi-upload allowed)
    'secured_debt_statement',
    -- Lien / claim supporting docs (sprint 16)
    'mortgage_statement',
    'heloc_statement',
    'second_lien_statement',
    'tax_lien_notice',
    'judgment_document',
    'hoa_lien_notice',
    'other_claim_document',
    -- Valuation supporting docs (sprint 16)
    'appraisal_report',
    'cma_report',
    'online_estimate_screenshot',
    'listing_or_offer_document',
    -- Ownership / condition supporting docs (sprint 16)
    'trust_document',
    'estate_document',
    'condition_supporting_document'
  ));
