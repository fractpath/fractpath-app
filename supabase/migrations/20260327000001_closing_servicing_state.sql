-- Property closing-review workflow stages (7-9 in the simplified lifecycle)
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS closing_review_status text
    CONSTRAINT chk_closing_review_status CHECK (
      closing_review_status IN ('pending', 'issue_found', 'ready')
    ),
  ADD COLUMN IF NOT EXISTS closing_review_note text;

-- Deal post-close servicing tracking (stages 15-16 in the simplified lifecycle)
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS servicing_status text
    CONSTRAINT chk_servicing_status CHECK (
      servicing_status IN ('active', 'issue')
    ),
  ADD COLUMN IF NOT EXISTS servicing_note text;
