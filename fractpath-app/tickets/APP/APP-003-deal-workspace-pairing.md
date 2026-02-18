# APP-003 — Deal workspace (buyer ↔ homeowner pairing, snapshot-anchored)

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 5 (implementation)

## Objective
Create a secure **Deal Workspace** that lets FractPath:

- pair a **Buyer** and **Homeowner** around a persisted calculator snapshot
- track deal lifecycle stages inside the app
- invite counterparties via secure email links
- gate sensitive details until both parties are authenticated
- maintain an **auditable, append-only record** of deal progression

This is the first step toward negotiation and contract execution, **without**
building chat, payments, or automated contracts.

---

## Non-Goals
- No in-app chat or messaging
- No payments or escrow
- No document upload
- No AVM / Zillow integration
- No automated contract generation
- No off-platform negotiation enablement

---

## Preconditions
- APP-001 complete (auth + profiles)
- APP-002 complete (calculator snapshot persistence + versioning)
- Draft resume flow implemented (APP-INT-001)
- Roles exist: homeowner, buyer, realtor
- Admin role exists (even if minimal)

---

## Core Design Principles (Locked)
1) **A deal is a container**
   - for relationship + permissions + snapshot evolution
2) **Snapshots anchor deal terms**
   - the deal always references calculator snapshots (never recomputed)
3) **Progressive disclosure**
   - sensitive details unlock only after both parties join
4) **Manual-first control**
   - admins moderate status transitions initially
5) **Audit over convenience**
   - no silent changes, no hidden mutations

---

## A) Deal Data Model (Minimal, Future-Proof)

Create a `deals` model/table with:

### Required Fields
- `id` (uuid, pk)
- `created_at`
- `created_by_user_id` (initiator)
- `status` (enum/text)
- `initial_snapshot_id`
  - points to calculator snapshot version that seeded the deal
- `current_snapshot_id`
  - points to latest attached calculator snapshot
- `title`
  - human-readable (e.g., “Annapolis SFR — Buyer / Homeowner”)
- `visibility_mode`
  - default = `gated`
- `last_activity_at`

### Deal Statuses (MVP)
- `DRAFT` — deal created, not paired
- `INVITED` — counterparty invited
- `CONNECTED` — both buyer + homeowner joined
- `TERMS_SHAPING` — FractPath moderating terms
- `PRE_CONTRACT` — ready for appraisal/title/manual paperwork
- `CONTRACTED_MANUAL` — signed off-platform (MVP)
- `ACTIVE` — agreement live
- `EXITED` — closed

Statuses map directly to OPS-001 lifecycle.
Keep transitions **explicit and controlled**.

---

## B) Deal Participants Model

Create `deal_participants` table:

### Required Fields
- `id` (uuid)
- `deal_id`
- `user_id` (nullable until accepted)
- `role` (`buyer | homeowner | realtor | fractpath_admin`)
- `status` (`INVITED | JOINED | REMOVED`)
- `invited_email`
- `invited_at`
- `joined_at`
- `permissions` (optional JSON; empty for MVP)

### Rules
- Exactly **one buyer** and **one homeowner** required to progress past `CONNECTED`
- Realtor is optional
- FractPath admin may view all deals
- Participants never gain implicit edit rights to calculator snapshots

---

## C) Invitation Mechanism (Email Link, Manual-First)

### Invite Flow
- Initiator (buyer or homeowner) invites counterparty by email
- System creates:
  - `deal_participants` row (status = INVITED)
  - `deal_invites` token

### `deal_invites` Table
- `token` (random, single-use)
- `deal_id`
- `role`
- `invited_email`
- `expires_at`
- `used_at` (nullable)

### Acceptance Rules
- Invite link: `/invite/[token]`
- If logged out → user must sign up / login
- After login:
  - invited_email must match authenticated email
  - token must be unused + unexpired
- On success:
  - attach `user_id`
  - mark participant JOINED
  - mark token used
  - update deal status if both parties joined

---

## D) Gating Model (Airbnb-Style Progressive Disclosure)

### Before `CONNECTED`
Counterparty may see:
- Deal title
- Role-specific context
- **Sanitized snapshot summary**:
  - headline KPIs only
  - no legal, pricing, or fee breakdowns
- City / region only (no exact address)

Must NOT see:
- exact property address
- full participant names
- personal contact details
- full calculator breakdowns
- any documents

### After `CONNECTED`
Reveal:
- exact address (if present)
- full calculator snapshot details
- participant names (first name + last initial OK)
- version history

---

## E) Deal Workspace UI (Core Screens)

### Routes
- `/deals`
  - list of deals user participates in
  - shows:
    - title
    - status badge
    - role
    - last activity

- `/deals/[id]`
  - Deal workspace with tabs:

#### Overview
- deal status + next steps
- participants + roles
- gating indicator
- admin-only controls (if applicable)

#### Terms Summary
- read-only view of **current calculator snapshot**
- key inputs + outputs
- floors / caps / timing notes
- early / standard / late outcomes
- link to snapshot version history

#### Activity
- audit log of major events (no chat)

---

## F) Deal Status Transitions (Manual-First)

### Allowed Actions (MVP)
- Initiator:
  - create deal
  - invite counterparty
- Participants:
  - accept invite
  - view deal (subject to gating)
- FractPath admin:
  - move deal status forward/backward
  - attach newer calculator snapshot as current

Status change UI may be admin-only initially.

---

## G) Audit Logging (Append-Only)

Create `deal_events` table:

### Fields
- `id`
- `deal_id`
- `actor_user_id` (nullable for system)
- `event_type`
- `event_payload_json`
- `created_at`

### Required Event Types
- `DEAL_CREATED`
- `INVITE_SENT`
- `INVITE_ACCEPTED`
- `STATUS_CHANGED`
- `SNAPSHOT_ATTACHED`

Events are **append-only**.
Never edited or deleted.

---

## Acceptance Criteria (Definition of Done)
- User can create a deal from a calculator snapshot
- User can invite a counterparty by email
- Invite flow:
  - requires login
  - enforces email match
  - single-use token
- Deal status becomes `CONNECTED` when buyer + homeowner joined
- Gating works:
  - sanitized view before CONNECTED
  - full snapshot after CONNECTED
- `/deals` and `/deals/[id]` render correctly
- Activity log shows key events
- No off-platform leakage before CONNECTED

---

## QA Checklist
- Invite token expires correctly
- Invite token is single-use
- Wrong-email user cannot accept invite
- Participants only see their deals
- Admin can view all (if implemented)
- Deal events append correctly
- Snapshot version history remains intact

---

## Deliverables
- Tables/models:
  - `deals`
  - `deal_participants`
  - `deal_invites`
  - `deal_events`
- UI routes:
  - `/deals`
  - `/deals/[id]`
  - `/invite/[token]`
- Controlled invite acceptance flow
- Snapshot-anchored deal workspace with gating
