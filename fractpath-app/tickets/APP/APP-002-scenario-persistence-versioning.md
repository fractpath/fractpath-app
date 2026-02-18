# APP-002 — Calculator Snapshot Persistence + Versioning (Server-Computed, Audit-Safe)

## Sprint
Sprint 0 (architecture alignment rewrite) → Sprint 9 (implementation foundation)

---

# Objective

Define the authoritative, audit-safe persistence model for **calculator snapshots** inside the secure app.

This ticket formalizes:

- Server-side compute (trusted context)
- Snapshot-first storage
- Versioning under a stable `deal_id`
- Immutable historical records
- No silent recomputation
- No multi-party mutation of a deal thread

This is the foundation required before counter flows (APP-008).

---

# Architecture Alignment (Frozen)

This ticket is governed by the Sprint 9 Architecture Scope.

## Canonical Compute
- All economic math lives in `fractpath-calculator-widget`.
- App imports compute module and executes it server-side.
- App UI never derives numeric terms independently.
- App never recomputes silently on render.

## Trusted Compute Rule
All persisted snapshots must be generated via a **server-side compute-and-save operation**.

Client previews are allowed for UX only — but persisted data must originate from server compute.

---

# Core Design Principles (Locked)

1. **Snapshots are immutable**
   - No UPDATE after insert.
   - Version history is append-only.

2. **All economic mutations create a new version**
   - No overwriting.
   - No patching results_json.

3. **Snapshots are computed server-side**
   - App must not persist client-generated results without recompute.

4. **Deal thread is stable**
   - `deal_id` persists.
   - Versions exist under one deal.

5. **VIEWER cannot create versions**
   - Only OWNER (or admin) can mutate deal thread.

---

# Terminology (Authoritative)

- **Deal** — negotiation thread container (`deal_id`)
- **Snapshot** — immutable computed economic state
- **Version** — monotonic integer per deal
- **DraftSnapshot** — marketing-side preview only (not authoritative)
- **Engine Version** — compute package version
- **Terms Version** — economic rule set identifier

---

# A) Data Model — Deal Snapshots (Revised)

Create or align to a `deal_snapshots` table with:

## Required Fields

- `id` (uuid, pk)
- `deal_id` (uuid, fk → deals)
- `version` (integer, monotonic per deal)
- `source` (`marketing_resume` | `owner_apply` | `admin_override`)
- `terms_version`
- `engine_version`
- `inputs_json`
- `outputs_json`
  - must include:
    - summary
    - schedule[]
- `integrity_hash` (recommended; over terms_version + inputs + outputs)
- `created_at`
- `created_by` (user id or system)
- `parent_snapshot_id` (nullable)

## Rules

- Append-only.
- No UPDATE.
- No DELETE.
- `version = max(version) + 1` scoped to deal_id.
- Snapshot #1 created during resume.

---

# B) Current Snapshot Pointer (Required)

To prevent ambiguity:

`deals.current_snapshot_id` must exist.

Rules:

- Rendering must use `current_snapshot_id`.
- Changing current version requires explicit action.
- Do not derive “latest by version” implicitly in multiple places.

Single source of truth for active version.

---

# C) Snapshot Creation Flows (Revised to Server Compute)

## 1) Marketing → Resume (Initial Snapshot)

Triggered by draft token redemption.

Flow:

1. Create deal.
2. Extract inputs from DraftSnapshot.
3. Run compute server-side using canonical compute module.
4. Persist snapshot:
   - version = 1
   - source = `marketing_resume`
5. Set `deals.current_snapshot_id`.

Important:
- Do not persist client-computed results.
- Always recompute on server.

---

## 2) Owner Apply (New Version)

Triggered when OWNER edits inputs and clicks Apply.

Flow:

1. Client submits inputs only.
2. Server:
   - validates OWNER permission
   - runs compute module
   - persists new snapshot
   - increments version
   - sets current_snapshot_id
3. Response returns new version metadata.

Client preview must not be persisted directly.

Source = `owner_apply`.

---

## 3) Admin Override

Admin may:

1. Provide modified inputs.
2. Server recomputes.
3. Persist new snapshot.
4. Link parent_snapshot_id.

Source = `admin_override`.

No manual edits to outputs_json allowed.

---

# D) Permissions + RLS

## Owner
- Read all snapshots for their deal.
- Create new versions.
- Update current_snapshot_id.

## Viewer
- Read snapshots.
- Cannot create versions.
- Cannot change current pointer.

## Admin
- Read all.
- Create override versions.

No deletion permitted.

---

# E) Deal Detail Rendering Rules

`/deal/[dealId]` must:

- Load `deals.current_snapshot_id`
- Render snapshot read-only
- Provide version history list

Switching versions:
- Must not mutate data.
- Must not recompute.
- Must only change rendered snapshot.

---

# F) Dashboard Contract

Dashboard lists Deals.

For each deal:

- Property identifier
- Current version #
- Key KPIs (derived from current snapshot only)
- Status badge

KPIs must be read from persisted snapshot, not recomputed.

---

# G) Audit Discipline

Every snapshot must answer:

- Who created it?
- When?
- What version?
- Which terms_version?
- Which engine_version?
- What prior snapshot?

No silent recompute.
No background recalculation on load.
No hidden mutation.

---

# H) Integrity Enforcement (Required)

Server must:

- Validate input schema.
- Validate compute output schema.
- Optionally compute integrity_hash.
- Reject persistence if malformed.

App must never trust client-supplied results_json.

---

# Acceptance Criteria (Revised)

- Snapshot persisted only via server compute.
- Snapshots immutable.
- Resume creates version 1.
- Owner Apply creates version N+1.
- Viewer cannot create version.
- current_snapshot_id always valid.
- outputs_json includes schedule table.
- terms_version stored.
- Dashboard reads persisted snapshot.
- No silent recompute anywhere in UI.

---

# QA Checklist

- Resume creates exactly one version.
- Apply increments version correctly.
- Switching versions does not recompute.
- Viewer cannot apply changes.
- Attempted client-side tampering rejected.
- No snapshot disappears.
- Integrity hash matches compute result.

---

# Deliverables

- deal_snapshots table (or aligned equivalent)
- current_snapshot_id column on deals
- Server compute-and-save endpoint
- Snapshot renderer UI
- Version history UI
- RLS enforcement for snapshot writes
- Optional integrity_hash implementation

