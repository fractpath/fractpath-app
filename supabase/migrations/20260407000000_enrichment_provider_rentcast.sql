-- Allow 'rentcast' as a valid provider in the property_enrichments table.
--
-- Phase 1 of the RentCast facts migration: broaden the CHECK constraint so that
-- RentCast property-profile data can be written as a separate provider row while
-- existing Mashvisor image rows remain untouched.
--
-- The partial unique index (is_current = true, per property+provider) already
-- supports separate current rows for 'mashvisor' and 'rentcast' simultaneously.

ALTER TABLE property_enrichments
  DROP CONSTRAINT IF EXISTS property_enrichments_provider_check;

ALTER TABLE property_enrichments
  ADD CONSTRAINT property_enrichments_provider_check
    CHECK (provider IN ('mashvisor', 'rentcast'));
