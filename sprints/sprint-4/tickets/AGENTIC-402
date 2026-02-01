AGENTIC-402
Schema Extension — Buyer Version Lineage
Intent Freeze

Enable buyer-created versions without modifying any existing version rows.

No retroactive edits allowed.

Scope Classification
Category	Classification
DB Schema	EXTEND
State Machine	NONE
Authorization	NONE
Audit	NONE
Schema Additions
ALTER TABLE deal_versions
ADD COLUMN created_by_role TEXT NOT NULL,
ADD COLUMN created_by_user_id UUID NOT NULL,
ADD COLUMN parent_version_id UUID NULL;


Optional constraint:

ALTER TABLE deal_versions
ADD CONSTRAINT deal_versions_parent_fk
FOREIGN KEY (parent_version_id)
REFERENCES deal_versions(id);

Invariants

Existing versions remain immutable

parent_version_id must reference same deal

created_by_role must be enum-safe

Verification Commands
\d deal_versions

SELECT created_by_role, parent_version_id
FROM deal_versions
LIMIT 5;

Evidence Checklist

Migration committed

Rollback script written

No existing queries broken

Rollback Plan
ALTER TABLE deal_versions
DROP COLUMN parent_version_id,
DROP COLUMN created_by_user_id,
DROP COLUMN created_by_role;

Exit Criteria

Schema supports immutable buyer lineage.
