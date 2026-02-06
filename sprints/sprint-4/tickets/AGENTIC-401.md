# AGENTIC-401  
## Contract Freeze — Buyer Accept + Counter Invariants (Sprint 4)

---

## Intent Freeze

Sprint 4 introduces buyer-side participation without weakening Sprint 3 constitutional guarantees.

This ticket defines, in contract form:

- Buyer acceptance rules
- Buyer counter versioning rules
- Homeowner authorization of counter rules
- State transition contracts
- Audit / attribution guarantees
- Exact dependency mapping to Sprint 3 controlled primitives

**No implementation begins until this contract is committed and consistent with the verified DB surface.**

---

## Scope Classification

| Category | Classification |
|----------|---------------|
| State Machine | EXTEND |
| DB Schema | NONE |
| Authorization | DEFINE |
| Audit | DEFINE |
| UI | NONE |

---

## Preconditions

### Sprint 3 Guarantees (Inherited)
- Sprint 3 invariants enforced
- Direct mutation of `deals.current_version_id` is blocked by trigger / guard
- Audit log (or equivalent) is append-only / immutable

### Verified Sprint 3 Controlled Primitives (Authoritative)
- `prepare_proposal_for_outreach(p_deal_id uuid, p_actor_user_id uuid) returns void`
- `promote_scenario_to_deal(p_scenario_id uuid) returns uuid` *(scenario-scoped; not used for deal_version authorization)*
- `transition_deal_status(p_deal_id uuid, p_new_status deal_status, p_actor_user_id uuid, p_version_id uuid, p_metadata jsonb) returns void`

**Implication:** All Sprint 4 status transitions MUST provide a concrete `p_version_id` and `p_metadata` describing explicit intent.

### Verified Sprint 3 Behavior (Inspected)
- `transition_deal_status(...)` updates **only** `deals.status` and logs `deal_status_changed` to `deal_activity_log`.
- `transition_deal_status(...)` does **not** update `deals.current_version_id`.
- `transition_deal_status(...)` blocks no-op transitions.
- `transition_deal_status(...)` enforces role membership via `deal_user_roles` and a strict transition matrix.

**Implication:** Sprint 4 requires a dedicated controlled function to authorize versions and update `current_version_id`:
- `authorize_deal_version(p_deal_id, p_version_id, p_actor_user_id, p_metadata)` (AGENTIC-406)

---

## Constitutional Invariants (Non-Negotiable)

1. No silent mutation
2. No direct writes to binding fields
3. All intent is explicit
4. All authority is attributable
5. All irreversible actions are auditable
6. Negotiation occurs via version insertion, not mutation

---

## Binding Fields (No Direct Writes)

The following are treated as binding / guarded fields for Sprint 4 purposes:

- `deals.current_version_id`
- `deal_versions.authorized_at` (or equivalent authorization marker)
- any economic terms columns in `deal_versions` that represent an offer/commitment snapshot

All modifications to these must occur only via controlled functions and must emit audit events.

---

## Role Authority Model (Sprint 4)

- HOMEOWNER: authoritative economic authority
- BUYER: reactive (may accept or counter only)
- OPS: remediation/admin only; no ops writes in sprint scope
- REALTOR: deferred/non-authoritative

---

## State Machine Semantics (Sprint 4 Clarifications)

### ACCEPTED_BY_BUYER
- Buyer accepted the currently authorized version
- Acceptance is binding only to buyer intent
- Does not prevent homeowner withdrawal/pause in Sprint 4

### COUNTERED
- A new version exists representing a buyer counter (insert-only)
- Counter is a proposal, not a commitment
- Routes system back into homeowner review semantics

---

## Functional Contracts (Authoritative)

### 1) buyer_accept_proposal(deal_id, actor_user_id)

**Preconditions**
- actor is on the deal with role = BUYER (enforced via deal_user_roles)
- deal.status = PROPOSAL_READY
  - Rationale: `transition_deal_status` only permits `PROPOSAL_READY -> ACCEPTED_BY_BUYER`
- deal not PAUSED_BY_HOMEOWNER or WITHDRAWN_BY_HOMEOWNER
- `deals.current_version_id` references the currently authorized version
- call must lock the deal row (`SELECT ... FOR UPDATE`) to prevent races

**Postconditions**
- `transition_deal_status(deal_id, 'ACCEPTED_BY_BUYER', actor_user_id, current_version_id, metadata)` executed
- no deal_version mutation
- audit event emitted via `deal_activity_log`:
  - action_type: `deal_status_changed`
  - includes: deal_id, version_id=current_version_id, actor_user_id
  - metadata includes `action='buyer_accept_proposal'` and `actor_role='BUYER'`

**Idempotency**
- Because `transition_deal_status` blocks no-ops, buyer_accept_proposal MUST:
  - return early if status already ACCEPTED_BY_BUYER, OR
  - raise a safe “already accepted” error before attempting transition

---

### 2) buyer_counter_proposal(deal_id, actor_user_id, proposed_terms)

**Counter Eligibility (Locked Here; must match transition matrix)**
Sprint 4 default: Buyer may counter only when deal.status = PROPOSED.

- Rationale: `transition_deal_status` currently permits `PROPOSED -> COUNTERED`
- (Sprint 4 extension may later allow `AUTHORIZED_BY_HOMEOWNER -> COUNTERED`, but that requires updating the transition matrix first.)

**Preconditions**
- actor is on the deal with role = BUYER
- deal.status = PROPOSED
- deal not paused/withdrawn
- function locks the deal row (`FOR UPDATE`)
- buyer cannot counter a stale baseline:
  - baseline must equal `deals.current_version_id` at transaction time

**Postconditions**
- new `deal_versions` row inserted (no edits to existing rows):
  - created_by_role = 'BUYER'
  - created_by_user_id = actor_user_id
  - parent_version_id = deals.current_version_id (baseline)
  - authorized_at = NULL (starts unauthorized)
  - proposed_terms stored per schema decision (AGENTIC-402)
- deal status transition executed via:
  - `transition_deal_status(deal_id, 'COUNTERED', actor_user_id, new_version_id, metadata)`
- audit event emitted via `deal_activity_log`:
  - action_type: `deal_status_changed`
  - includes lineage in metadata: parent_version_id, new_version_id
  - metadata includes `action='buyer_counter_proposal'` and `actor_role='BUYER'`

---

### 3) homeowner_authorize_counter(deal_id, actor_user_id, version_id)

**Preconditions**
- actor is on the deal with role = HOMEOWNER
- version_id belongs to deal_id
- version_id is currently unauthorized
- stale protection: authorization must fail if version is not eligible relative to baseline rules (implementation detail in AGENTIC-405)
- function locks the deal row (`FOR UPDATE`)

**Postconditions**
- prior authorized version (if any) is deauthorized via controlled pathway
- deals.current_version_id is updated via controlled pathway
- authorization performed via:
  - `authorize_deal_version(deal_id, version_id, actor_user_id, metadata)` (AGENTIC-406)
- deal status transition executed via:
  - `transition_deal_status(deal_id, 'AUTHORIZED_BY_HOMEOWNER', actor_user_id, version_id, metadata)` only if transition is legal from current status
- audit events emitted via `deal_activity_log`:
  - deal_version_deauthorized (if prior existed)
  - deal_version_authorized
  - deal_current_version_updated
  - deal_status_changed (when status transition occurs)
  - metadata includes `action='homeowner_authorize_counter'` and actor_role

---

## Evidence Checklist

- This contract is committed as `sprints/sprint-4/tickets/AGENTIC-401.md`
- Verified function signatures included (no placeholders)
- Verified behavior of `transition_deal_status` recorded (status-only, no current_version_id updates)
- Counter eligibility rule matches current transition matrix (PROPOSED -> COUNTERED)
- Buyer acceptance eligibility matches current transition matrix (PROPOSAL_READY -> ACCEPTED_BY_BUYER)
- Product Constitution reviewed for conflicts (auditability + attribution + authority)

---

## Exit Criteria

All 3 function contracts are explicitly defined, consistent with the verified DB surface and transition matrix, and ready to drive implementation tickets without ambiguity.
