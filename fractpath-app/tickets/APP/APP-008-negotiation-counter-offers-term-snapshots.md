# APP-008 — Negotiation Workspace (Counter-Offers + Snapshot Alignment)

## Sprint
Sprint 0 (architecture alignment rewrite) → Sprint 9 (implementation)

---

# Objective

Create a structured, versioned negotiation layer inside the Deal Workspace that:

- Allows OWNER of a deal thread to evolve economic inputs
- Allows counterparty to fork and respond safely
- Preserves immutable history
- Locks an accepted economic version
- Aligns strictly with server-computed calculator snapshots

This ticket must conform to APP-002 (server-side snapshot persistence).

---

# Architecture Realignment (Critical)

This ticket previously introduced a parallel “terms schema” and `deal_term_versions`.

Under the frozen architecture, we must avoid duplicating economic models.

### 🔒 Canonical Rule

There is only one economic truth source:
- The calculator compute engine
- Persisted snapshots (`deal_snapshots` from APP-002)

Negotiation must operate by:
- modifying inputs
- invoking server compute
- creating a new snapshot version

There must NOT be:
- a second economic schema that diverges
- client-side recompute for negotiation
- manually stored computed_json independent of snapshot engine

---

# Revised Design Model

Negotiation is snapshot-driven, not terms-schema-driven.

Each negotiation step produces a new `deal_snapshot` version.

The negotiation layer adds:
- status metadata
- proposer identity
- acceptance workflow

But economic data always lives in `deal_snapshots`.

---

# A) Negotiation Version Model (Aligned)

Instead of `deal_term_versions`, extend the snapshot model with negotiation metadata.

### deal_snapshots (Extended Fields)

In addition to APP-002 fields, include:

- `negotiation_status`
  - `DRAFT`
  - `PROPOSED`
  - `COUNTERED`
  - `ACCEPTED_PENDING_ADMIN`
  - `ACCEPTED`
  - `SUPERSEDED`
- `proposed_by_user_id`
- `proposed_by_role`
- `message` (short rationale)
- `parent_snapshot_id`

No separate economic schema.

All economic changes flow through:
