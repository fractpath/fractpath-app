-- Simulation-only escalation state columns on the properties table.
-- These track simulated deposit collection and stronger AVM ordering.
-- NULL means "not started" for each stage.
-- Real Stripe / ATTOM integration will replace these with dedicated event rows.
-- TODO(stripe): Replace escalation_deposit_status with Stripe payment-intent state.
-- TODO(attom): Replace escalation_avm_status with ATTOM order-tracking state.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS escalation_deposit_status text
    CONSTRAINT chk_escalation_deposit_status
      CHECK (escalation_deposit_status IN ('requested', 'paid', 'failed')),
  ADD COLUMN IF NOT EXISTS escalation_avm_status text
    CONSTRAINT chk_escalation_avm_status
      CHECK (escalation_avm_status IN ('ordered', 'completed'));
