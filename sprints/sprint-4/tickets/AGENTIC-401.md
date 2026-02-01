AGENTIC-401
Contract Freeze — Buyer Accept + Counter Invariants (Sprint 4)
Intent Freeze

Sprint 4 introduces buyer-side participation without weakening Sprint 3 constitutional guarantees.

This ticket defines, in contract form:

Buyer acceptance rules

Buyer counter versioning rules

Homeowner authorization of counter rules

State transition contracts

Audit / attribution guarantees

Exact dependency mapping to Sprint 3 controlled primitives

No implementation begins until this contract is committed and consistent with the verified DB surface.

Scope Classification
Category	Classification
State Machine	EXTEND
DB Schema	NONE
Authorization	DEFINE
Audit	DEFINE
UI	NONE
Preconditions
Sprint 3 Guarantees (Inherited)

Sprint 3 invariants enforced

Direct mutation of deals.current_version_id is blocked by trigger / guard

Audit log (or equivalent) is append-only / immutable

Verified Sprint 3 Controlled Primitives (Authoritative)

prepare_proposal_for_outreach(p_deal_id uuid, p_actor_user_id uuid) returns void

promote_scenario_to_deal(p_scenario_id uuid) returns uuid (scenario-scoped; not used for deal_version authorization)

transition_deal_status(p_deal_id uuid, p_new_status deal_status, p_actor_user_id uuid, p_version_id uuid, p_metadata jsonb) returns void

Implication: All Sprint 4 status transitions MUST provide a concrete p_version_id and p_metadata describing explicit intent.

Constitutional Invariants (Non-Negotiable)

No silent mutation

No direct writes to binding fields

All intent is explicit

All authority is attributable

All irreversible actions are auditable

Negotiation occurs via version insertion, not mutation

Binding Fields (No Direct Writes)

The following are treated as binding / guarded fields for Sprint 4 purposes:

deals.current_version_id

deal_versions.authorized_at (or equivalent authorization marker)

any economic terms columns in deal_versions that represent an offer/commitment snapshot

All modifications to these must occur only via controlled functions and must emit audit events.

Role Authority Model (Sprint 4)

HOMEOWNER: authoritative economic authority

BUYER: reactive (may accept or counter only)

OPS: remediation/admin only; no ops writes in sprint scope

REALTOR: deferred/non-authoritative

State Machine Semantics (Sprint 4 Clarifications)
ACCEPTED_BY_BUYER

Buyer accepted the currently authorized version

Acceptance is binding only to buyer intent

Does not prevent homeowner withdrawal/pause in Sprint 4

COUNTERED

A new version exists representing a buyer counter (insert-only)

Counter is a proposal, not a commitment

Routes system back into homeowner review semantics

Functional Contracts (Authoritative)
1) buyer_accept_proposal(deal_id, actor_user_id)

Preconditions

actor_user_id has role = BUYER

deals.status = AUTHORIZED_BY_HOMEOWNER

deals.current_version_id references the currently authorized version

deal is not PAUSED_BY_HOMEOWNER or WITHDRAWN_BY_HOMEOWNER (or equivalent)

call must be protected by row lock (SELECT ... FOR UPDATE) to prevent races

Postconditions

transition_deal_status(deal_id, 'ACCEPTED_BY_BUYER', actor_user_id, current_version_id, metadata) executed

no version mutation

audit event emitted:

primary: buyer_accepted_authorized_version

includes: deal_id, version_id=current_version_id, actor_user_id, role=BUYER

metadata includes action='buyer_accept_proposal'

Idempotency

Second call either:

returns success with no additional state change, OR

throws a safe “already accepted” error

Must not create duplicate irreversible audit signals without explicit design

2) buyer_counter_proposal(deal_id, actor_user_id, proposed_terms)

Counter Eligibility (Decision Locked Here)

Sprint 4 default: Buyer may counter only when deals.status = AUTHORIZED_BY_HOMEOWNER.

Rationale: reduces ambiguity; counters always reference a single authoritative baseline.

Optional expansion (explicitly NOT in default): allow counter from HOMEOWNER_REVIEW only if the specific referenced version is explicitly provided and validated.

Preconditions

actor_user_id has role = BUYER

deal status satisfies counter eligibility rule above

deal not paused/withdrawn

buyer cannot counter a stale baseline: baseline must equal current authoritative version at transaction time

function must lock the deal row (FOR UPDATE)

Postconditions

new deal_versions row inserted (no edits to existing rows):

created_by_role = 'BUYER'

created_by_user_id = actor_user_id

parent_version_id = deals.current_version_id (baseline)

authorized_at = NULL (starts unauthorized)

proposed_terms stored per schema decision (Sprint 4 DB ticket)

deal status transition executed via:

transition_deal_status(deal_id, 'COUNTERED', actor_user_id, new_version_id, metadata)

audit event emitted:

primary: buyer_counter_version_created

includes lineage: parent_version_id, new_version_id

metadata includes action='buyer_counter_proposal'

3) homeowner_authorize_counter(deal_id, actor_user_id, version_id)

Preconditions

actor_user_id has role = HOMEOWNER (and controller entitlement if required by Sprint 3 model)

version_id belongs to deal_id

version_id is currently unauthorized

stale protection: authorization must fail if version_id is not eligible relative to the current baseline rules (explicitly defined in implementation ticket)

Postconditions

previous authorized version is deauthorized (via controlled pathway)

deals.current_version_id updates only via controlled pathway

deal status transition executed via:

transition_deal_status(deal_id, 'AUTHORIZED_BY_HOMEOWNER', actor_user_id, version_id, metadata)

audit event emitted:

primary: homeowner_counter_authorized

includes lineage + supersession references in metadata (supersedes_version_id, etc.)

metadata includes action='homeowner_authorize_counter'

Note / Dependency

Whether transition_deal_status internally performs:

current_version_id update, and

version authorization + supersession logging
must be verified by inspecting its definition.

If it does NOT, Sprint 4 will introduce a dedicated controlled function:

authorize_deal_version(deal_id, version_id, actor_user_id, metadata)
which performs supersession + current_version update constitution-safely.

Evidence Checklist

This contract is committed as sprints/sprint-4/tickets/AGENTIC-401.md

Verified function signatures are included (no placeholders)

Counter eligibility rule is explicitly locked

Product Constitution reviewed for conflicts (especially auditability + attribution)

Next-step dependency noted: inspect transition_deal_status function definition

Exit Criteria

All 3 function contracts are explicitly defined, consistent with the verified DB surface, and ready to drive implementation tickets without ambiguity.
