# AGENTIC-404  
## Controlled Function — buyer_accept_proposal() (Sprint 4)

---

## Intent Freeze

Buyer acceptance binds buyer intent only.

- Acceptance is binding only to buyer intent in Sprint 4
- Does not restrict homeowner withdrawal or pause (Sprint 5+ concern)
- Must not mutate deal_versions
- Must use controlled transition pathway with explicit version_id + metadata
- Must respect the existing strict transition matrix in transition_deal_status

---

## Scope Classification

| Category | Classification |
|----------|---------------|
| DB Function | NEW |
| State Machine | EXTEND |
| Authorization | ENFORCE |
| Audit | EXTEND |
| Schema | NONE |

---

## Preconditions

- deal exists
- actor_user_id exists
- actor has role = BUYER (must exist in deal_user_roles for deal)
- deal.status = PROPOSAL_READY (locked to match current transition matrix)
- deal not PAUSED_BY_HOMEOWNER
- deal not WITHDRAWN_BY_HOMEOWNER
- acceptance applies to the current authoritative version: deals.current_version_id
- function executes inside a transaction
- deal row must be locked FOR UPDATE

---

## Constitutional Invariants

- No silent mutation
- No updates to existing deal_versions rows
- All state changes must use transition_deal_status(...)
- transition_deal_status requires:
  (p_deal_id, p_new_status, p_actor_user_id, p_version_id, p_metadata)
- All intent must be explicit via metadata `action`
- transition_deal_status blocks no-op transitions; idempotency must be handled here

---

## Function Definition (Authoritative Skeleton)

```sql
CREATE OR REPLACE FUNCTION buyer_accept_proposal(
    p_deal_id UUID,
    p_actor_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_status public.deal_status;
    v_current_version UUID;
BEGIN

    -- Validate role (replace with your real assertion function if different)
    PERFORM assert_user_role(p_actor_user_id, 'BUYER');

    -- Lock deal row and capture the authoritative version being accepted
    SELECT status, current_version_id
      INTO v_status, v_current_version
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Deal does not exist';
    END IF;

    -- Idempotency: transition_deal_status blocks no-op transitions
    IF v_status = 'ACCEPTED_BY_BUYER'::public.deal_status THEN
        RETURN;
    END IF;

    -- Eligibility check (must match transition_deal_status matrix)
    -- Matrix permits: PROPOSAL_READY -> ACCEPTED_BY_BUYER
    IF v_status <> 'PROPOSAL_READY'::public.deal_status THEN
        RAISE EXCEPTION 'Deal not eligible for acceptance (status=%)', v_status
          USING errcode = 'P0001';
    END IF;

    -- Transition state using verified Sprint 3 primitive
    PERFORM public.transition_deal_status(
        p_deal_id,
        'ACCEPTED_BY_BUYER'::public.deal_status,
        p_actor_user_id,
        v_current_version,
        jsonb_build_object(
            'action', 'buyer_accept_proposal',
            'accepted_version_id', v_current_version
        )
    );

END;
$$;
