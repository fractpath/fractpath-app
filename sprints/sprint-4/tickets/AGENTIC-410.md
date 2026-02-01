# AGENTIC-410  
## Chaos Tests — Constitutional Proof (Sprint 4)

---

## Intent Freeze

Sprint 4 is complete only if the system resists:

- Double counters (concurrency)
- Stale authorization attempts
- Role misuse
- Rapid state racing

Passing these tests is the constitutional proof that Sprint 4 did not weaken Sprint 3 guarantees.

---

## Scope Classification

| Category | Classification |
|----------|---------------|
| Testing | NEW |
| State Machine | VERIFY |
| Authorization | VERIFY |
| Audit | VERIFY |
| UI | NONE |

---

## Preconditions

- AGENTIC-402 applied (lineage columns exist)
- AGENTIC-403 implemented (buyer_counter_proposal)
- AGENTIC-404 implemented (buyer_accept_proposal)
- AGENTIC-405 implemented (homeowner_authorize_counter)
- transition_deal_status is authoritative and emits auditable state transitions
- Access to run SQL in a session capable of concurrent execution (psql recommended)

---

## Constitutional Invariants Under Test

- No silent mutation
- No direct writes to binding fields
- Negotiation via version insertion only
- Authority attributable (role checks enforced server-side)
- Irreversible actions auditable (metadata includes explicit intent)
- Race conditions resolve deterministically (by transactional ordering) and leave a replayable audit trail

---

## Test Data Setup (Required)

Create or identify:
- `deal_id`
- `homeowner_user_id`
- `buyer_user_id`

Ensure the deal is in the eligibility state for Sprint 4 actions:
- `status = AUTHORIZED_BY_HOMEOWNER`
- `current_version_id` points to the authorized baseline version

Record baseline:
```sql
SELECT id, status, current_version_id
FROM deals
WHERE id = 'deal-uuid';
