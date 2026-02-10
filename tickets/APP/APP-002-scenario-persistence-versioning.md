# APP-002 — Calculator snapshot persistence + versioning (audit-safe, snapshot-first)

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 5 (implementation)

## Objective
Define a durable, auditable system inside the secure portal to **persist, reference, and evolve calculator snapshots**
that originate from the marketing calculator and the in-app calculator.

This ticket ensures:
- calculator projections never “disappear”
- users can review exactly what was modeled
- FractPath can trace how terms evolve over time
- nothing can be silently changed or recomputed

At this stage, calculator snapshots are **viewable and versioned**, and **editable only via explicit Apply actions**
(which create new snapshots).

---

## Non-Goals
- No inline negotiation UI (see APP-008)
- No silent recomputation of saved snapshots
- No background syncing with marketing calculator
- No deal execution or payments
- No AVM enrichment (APP-013 governs that)

---

## Preconditions
- APP-001 complete (auth, profiles, dashboard)
- Widget produces DraftSnapshot (WGT-040)
- Draft token redemption flow implemented (APP-INT-001)
- OPS-INT-001 lifecycle + logging discipline defined

---

## Core Design Principles (Locked)
1) **Snapshots are immutable**
   - once written, never mutated
2) **Changes create new snapshots**
   - version increments
3) **Deal views render snapshots**
   - never recompute silently
4) **Calculator is the only math engine**
   - app never derives numeric terms independently

---

## Terminology Alignment
- **Calculator Snapshot**: Persisted calculator inputs + results (canonical unit)
- **DraftSnapshot**: Pre-auth snapshot created by widget (WGT-040)
- **Deal Snapshot**: Persisted calculator snapshot attached to a Deal ID
- **Version**: Monotonic integer per deal, starting at 1

This ticket replaces the older notion of “scenario” with **calculator snapshots**,
which are the authoritative source for deal terms.

---

## A) Data Model — Calculator Snapshots (Minimal, Future-Proof)

Create a calculator snapshot model/table (or equivalent storage) with:

### Required Fields
- `id` (uuid, pk)
- `deal_id` (uuid, fk → deals)
- `version` (integer, starting at 1, monotonic per deal)
- `source` (`marketing_resume` | `app_apply` | `admin_override`)
- `calculator_schema_version`
- `engine_version`
- `persona_context` (nullable; informational only)
- `inputs_json` (canonical `CalculatorInputsV1`)
- `results_json` (canonical `CalculatorResultV1`)
- `created_at`
- `created_by` (`system` | `user` | `fractpath_admin`)
- `parent_snapshot_id` (nullable; links prior version)

### Rules
- Rows are **append-only**
- No UPDATEs after insert
- Version = max(version for deal_id) + 1
- Snapshot #1 is always created from DraftSnapshot on resume (APP-INT-001)

### “Current snapshot” rule (pick one; enforce consistently)
- The deal detail view must render the **current snapshot** by reading:
  - `deals.current_snapshot_id` (recommended), OR
  - the latest snapshot by version (if no pointer is stored)

Agents must not implement both approaches simultaneously.

---

## B) Snapshot Creation Flows (Authoritative)

### 1) Marketing → App Resume (Initial Snapshot)
- Triggered by draft token redemption (APP-INT-001)
- Create:
  - Deal record
  - Calculator snapshot version = 1
- Snapshot #1:
  - copied verbatim from DraftSnapshot
  - no recompute
  - no normalization beyond schema validation
- Source = `marketing_resume`

### 2) In-App Apply (New Snapshot)
- Triggered when authenticated owner:
  - opens input modal
  - edits inputs/assumptions
  - clicks **Apply**
- Widget computes new result (client preview)
- App persists:
  - new snapshot
  - version = prior + 1
- Server must validate payload against widget schemas (inputs + results).
- Source = `app_apply`

### 3) Admin Override (Manual, Rare)
- Admin may create a new snapshot by:
  - copying inputs from prior snapshot
  - adjusting values
  - persisting as version +1
- Source = `admin_override`
- Must preserve parent_snapshot_id linkage

---

## C) Ownership, Visibility, and Permissions
- Snapshots belong to a **deal**, not directly to a user

### RLS / Access Rules (explicit)
- Deal owner: read all snapshots; create new snapshots (Apply)
- Viewers: read-only access to snapshots
- Admins: read all; create admin_override snapshots

No deletion. No edits.

---

## D) Dashboard Updates (User-Facing)
Update `/dashboard` to show **Deals**, not free-floating scenarios.

For each deal:
- Property / deal identifier
- Latest snapshot version
- Key KPI rollups (from latest snapshot only)
- Status badge:
  - “Imported”
  - “Updated”
  - “Superseded” (older versions)

Clicking a deal opens:
- `/deal/[dealId]`
- renders current snapshot by default

---

## E) Deal Detail View — Snapshot Renderer
The deal detail page must:
- Render the **current calculator snapshot** by default
- Allow switching to older versions (read-only)
- Show snapshot metadata:
  - version
  - created_at
  - source
  - created_by

### Display Sections
- Snapshot header (version + date)
- Key inputs (read-only)
- Key outputs / terms sheet
- Charts (from results_json)
- Assumptions used
- Version history list:
  - version #
  - date
  - source
  - clickable to view

### UX Rules
- Viewing ≠ editing
- Editing always opens the input modal
- Applying changes always creates a new snapshot

---

## F) Admin-Only Capabilities (Manual-First)
Admins may create new snapshots by:
- copying inputs from an existing snapshot
- adjusting values
- saving as a new snapshot version

This may be implemented as:
- hidden admin route
- protected admin UI
- controlled script

Requirements:
- version increments correctly
- parent_snapshot_id preserved
- user can see that a new version exists
- no silent overwrite

---

## G) Audit Trail Discipline
Every snapshot must answer:
- who created it
- when it was created
- what prior snapshot it derived from
- which calculator schema + engine produced it

No silent edits.
No background recompute.
No mutation of history.

---

## Acceptance Criteria (Definition of Done)
- Calculator snapshots are persisted in the app DB
- Snapshots are immutable once saved
- New versions are created instead of edits
- Resume flow creates snapshot #1
- In-app Apply creates snapshot N+1
- Server validates snapshots against widget schemas
- Users can:
  - view latest snapshot
  - view prior snapshots
- Admins can create a new snapshot manually
- No snapshot disappears after refresh
- Read-only enforcement holds for non-owners
- Mobile rendering acceptable

---

## QA Checklist
- Resume from marketing creates exactly one snapshot
- Re-applying inputs creates a new version
- Version numbers increment correctly
- Old versions remain accessible
- No recompute occurs on page load
- Permissions enforced correctly
- Dashboard KPIs reflect latest snapshot only

---

## Deliverables
- Calculator snapshot data model
- Snapshot persistence logic
- Deal detail snapshot renderer
- Version history UI
- Admin snapshot creation mechanism
