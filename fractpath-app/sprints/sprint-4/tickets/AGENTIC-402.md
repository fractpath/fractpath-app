AGENTIC-402
Schema Extension — Buyer Version Lineage (Sprint 4)
Intent Freeze

Enable buyer-created versions without modifying any existing version rows.

Buyer counters are represented as new deal_versions rows.

No retroactive edits.

Lineage must be queryable and auditable.

This ticket creates only the minimum schema necessary to represent:

who created a version (role + user)

which version it descended from (parent pointer)

Scope Classification
Category	Classification
DB Schema	EXTEND
State Machine	NONE
Authorization	NONE
Audit	NONE
UI	NONE
Preconditions

Table deal_versions exists and contains id and deal_id.

Existing data already present in deal_versions (so migration must be backward-compatible).

Sprint 3 trigger prevents direct updates to deals.current_version_id (not directly used here but part of overall invariant model).

Constitutional Invariants (Schema Layer)

Existing versions remain immutable.

Buyer counters must reference a baseline via parent_version_id (nullable for initial/root versions).

parent_version_id must reference a version in the same deal (not merely “exists”).

Actor attribution fields must be present for new versions without breaking existing rows.

Schema Design Decisions (Locked)
created_by_role

Type: TEXT in Sprint 4 (enum-safe validation enforced via CHECK constraint)

Allowed values: HOMEOWNER, BUYER, OPS, REALTOR

created_by_user_id

UUID referencing user identity model (no FK requirement in this ticket; depends on current auth schema)

parent_version_id

UUID nullable: NULL indicates a root/origin version (e.g., first version created from intake)

Migration Plan (Backward Compatible)
Step 1 — Add columns as nullable first

Do NOT introduce NOT NULL immediately or you will fail on existing rows.

ALTER TABLE deal_versions
ADD COLUMN created_by_role TEXT NULL,
ADD COLUMN created_by_user_id UUID NULL,
ADD COLUMN parent_version_id UUID NULL;

Step 2 — Add constraints (safe)
2a) Self-FK for parent pointer
ALTER TABLE deal_versions
ADD CONSTRAINT deal_versions_parent_fk
FOREIGN KEY (parent_version_id)
REFERENCES deal_versions(id);

2b) Role safety constraint (enum-safe)
ALTER TABLE deal_versions
ADD CONSTRAINT deal_versions_created_by_role_check
CHECK (created_by_role IS NULL OR created_by_role IN ('HOMEOWNER','BUYER','OPS','REALTOR'));

Step 3 — Backfill existing rows (minimal default)

Backfill attribution for historical rows to avoid NULL surprises later.

Default rule for Sprint 4:

Existing versions become created_by_role = 'HOMEOWNER' (or 'OPS' if that better matches your historic creation model)

created_by_user_id remains NULL unless you can reliably infer it

UPDATE deal_versions
SET created_by_role = COALESCE(created_by_role, 'HOMEOWNER')
WHERE created_by_role IS NULL;

Step 4 — Enforce NOT NULL only after backfill
ALTER TABLE deal_versions
ALTER COLUMN created_by_role SET NOT NULL;


created_by_user_id stays nullable in Sprint 4 unless you can guarantee backfill. If you can guarantee it, add:

ALTER TABLE deal_versions
ALTER COLUMN created_by_user_id SET NOT NULL;


(Do not do this unless you can backfill safely.)

Same-Deal Parent Invariant (Required)

A plain FK does not ensure the parent belongs to the same deal. Enforce via trigger or constraint logic.

Option A (Preferred): Trigger validation

Create a trigger to enforce:

if parent_version_id is not null:

parent exists

parent.deal_id = child.deal_id

(Implement trigger in this ticket or in AGENTIC-403; recommend here.)

Pseudo-logic requirement:

reject insert/update where parent_version_id points to a version from another deal

Implementation Note: If you want to keep AGENTIC-402 “pure migration,” you can defer the trigger to AGENTIC-403, but then AGENTIC-403 must include it explicitly.

Verification Commands
Confirm schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'deal_versions'
ORDER BY ordinal_position;

Confirm constraints exist
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.deal_versions'::regclass
ORDER BY conname;

Spot-check lineage columns
SELECT id, deal_id, created_by_role, created_by_user_id, parent_version_id
FROM deal_versions
ORDER BY created_at DESC NULLS LAST
LIMIT 10;

Validate role constraint blocks bad values
-- Should fail
INSERT INTO deal_versions (deal_id, created_by_role)
VALUES ('00000000-0000-0000-0000-000000000000', 'ALIEN');

Evidence Checklist

Migration committed (up + down / rollback)

Existing production rows preserved (no destructive changes)

created_by_role populated for historical rows

Constraints present:

parent FK

role CHECK

Same-deal parent invariant enforcement plan recorded (trigger here or explicitly deferred)

Rollback Plan

Rollback must drop constraints before columns.

ALTER TABLE deal_versions
DROP CONSTRAINT IF EXISTS deal_versions_created_by_role_check;

ALTER TABLE deal_versions
DROP CONSTRAINT IF EXISTS deal_versions_parent_fk;

ALTER TABLE deal_versions
DROP COLUMN IF EXISTS parent_version_id,
DROP COLUMN IF EXISTS created_by_user_id,
DROP COLUMN IF EXISTS created_by_role;


If a trigger was added for same-deal validation, drop it as well in rollback.

Exit Criteria

Schema supports immutable buyer lineage representation:

attribution (role + optional user)

parent linkage

Migration is backward-compatible and does not break existing data or queries

Role values are constrained

Parent pointer exists and is structurally valid (FK), with plan for same-deal enforcement captured
