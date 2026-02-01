AGENTIC-401
Contract Freeze — Buyer Accept + Counter Invariants
Intent Freeze

Sprint 4 introduces buyer-side participation without weakening Sprint 3 constitutional guarantees.

This ticket defines:

Buyer acceptance rules

Buyer counter versioning rules

Homeowner authorization of counter rules

State transition contracts

Audit emission guarantees

No implementation until this contract is committed.

Scope Classification
Category	Classification
State Machine	EXTEND
DB Schema	NONE
Authorization	DEFINE
Audit	DEFINE
UI	NONE
Preconditions

Sprint 3 invariants enforced

transition_deal_status() is authoritative

Direct mutation of deals.current_version_id blocked by trigger

Audit table append-only

Constitutional Invariants

No silent mutation

No direct writes to binding fields

All authority attributable

All irreversible actions auditable

Negotiation via version insertion only

Functional Contracts
buyer_accept_proposal(deal_id, actor_user_id)

Preconditions:

role = BUYER

deal.status = AUTHORIZED_BY_HOMEOWNER

version_id = current authorized version

deal not paused or withdrawn

Postconditions:

deal.status → ACCEPTED_BY_BUYER

no version mutation

audit event: buyer_accepted_authorized_version

buyer_counter_proposal(deal_id, actor_user_id, proposed_terms)

Preconditions:

role = BUYER

deal.status in (AUTHORIZED_BY_HOMEOWNER, HOMEOWNER_REVIEW)

cannot counter stale version

Postconditions:

new deal_version inserted

created_by_role = BUYER

parent_version_id = current_version_id

deal.status → COUNTERED

audit event: buyer_counter_version_created

homeowner_authorize_counter(deal_id, actor_user_id, version_id)

Preconditions:

role = HOMEOWNER

version_id belongs to deal

version unauthorized

version eligible

Postconditions:

previous authorized version deauthorized

current_version_id updated via controlled pathway

deal.status → AUTHORIZED_BY_HOMEOWNER

audit event: homeowner_counter_authorized

Evidence Checklist

/sprints/sprint-4/contracts.md committed

All pre/post conditions written

Reviewed against Product Constitution

Exit Criteria

All 3 function contracts explicitly defined and signed off.
