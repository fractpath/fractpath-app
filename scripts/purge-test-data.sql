-- Sprint 0: Purge disposable test/dummy lifecycle data
-- Run with: psql -f scripts/purge-test-data.sql
-- Safe: deletes only lifecycle data, preserves auth.users and profiles
-- Note: TRUNCATE CASCADE used for immutable/append-only tables (bypass trigger)

BEGIN;

-- 1. Thread-related (deepest FK deps)
DELETE FROM deal_thread_participants;
DELETE FROM deal_proposals;
DELETE FROM thread_invites;

-- 2. Deal threads (FK: deal_threads → properties, deals)
DELETE FROM deal_threads;

-- 3. Deal lifecycle data (TRUNCATE for immutable tables)
TRUNCATE deal_events CASCADE;
TRUNCATE deal_activity_log CASCADE;
TRUNCATE deal_snapshots CASCADE;
TRUNCATE deal_versions CASCADE;
TRUNCATE calculator_snapshots CASCADE;
DELETE FROM deal_access_grants;
DELETE FROM deal_share_tokens;
DELETE FROM draft_tokens;

-- 4. Deals themselves
DELETE FROM deals;

-- 5. Property-related (FK: property_documents → properties)
DELETE FROM property_documents;
TRUNCATE property_status_audit CASCADE;

-- 6. Properties
DELETE FROM properties;

COMMIT;
