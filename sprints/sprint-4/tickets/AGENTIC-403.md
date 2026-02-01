# AGENTIC-403  
## Controlled Function — buyer_counter_proposal() (Sprint 4)

---

## Intent Freeze

Buyer counters must create a new version.

Never mutate existing version rows.

All counters must:

- Insert a new deal_versions row
- Preserve lineage via parent_version_id
- Transition status using transition_deal_status(...)
- Emit attributable metadata via transition metadata (and actor_role added by transition_deal_status)

No direct writes to binding fields are permitted.

---

## Scope Classification

| Category | Classification |
|----------|---------------|
| DB Function | NEW |
| State Machine | EXTEND |
| Authorization | ENFORCE |
| Audit | EXTEND |
| Schema | USE EXISTING (AGENTIC-402) |

---

## Preconditions

- deal exists
- actor_user_id exists
- actor has role = BUYER (must exist in deal_user_roles for deal)
- deal.status = PROPOSED (locked to match current transition matrix)
- deal not PAUSED_BY_HOMEOWNER
- deal not WITHDRAWN_BY_HOMEOWNER
- function executes inside a transaction
- deal row must be locked FOR UPDATE

---

## Constitutional Invariants

- No silent mutation
- No updates to existing deal_versions rows
- parent_version_id must equal the locked current_version_id
- All state changes must use transition_deal_status(...)
- transition_deal_status requires:
  (p_deal_id, p_new_status, p_actor_user_id, p_version_id, p_metadata)

---

## Function Definition (Authoritative Skeleton)

```sql
CREATE OR REPLACE FUNCTION buyer_counter_proposal(
    p_deal_id UUID,
    p_actor_user_id UUID,
    p_proposed_terms JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_version UUID;
    v_new_version UUID;
    v_status public.deal_status;
BEGIN

    -- Validate role (replace with your real assertion function if different)
    PERFORM assert_user_role(p_actor_user_id, 'BUYER');

    -- Lock deal row and capture baseline
    SELECT current_version_id, status
      INTO v_current_version, v_status
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Deal does not exist';
    END IF;

    -- Enforce eligibility rule (must match transition_deal_status matrix)
    IF v_status <> 'PROPOSED'::public.deal_status THEN
        RAISE EXCEPTION 'Deal not eligible for counter (status=%)', v_status
          USING errcode = 'P0001';
    END IF;

    -- Insert new immutable version
    INSERT INTO public.deal_versions (
        deal_id,
        parent_version_id,
        created_by_role,
        created_by_user_id,
        proposed_terms,
        authorized_at
    )
    VALUES (
        p_deal_id,
        v_current_version,
        'BUYER',
        p_actor_user_id,
        p_proposed_terms,
        NULL
    )
    RETURNING id INTO v_new_version;

    -- Transition state using verified Sprint 3 primitive
    -- Matrix permits: PROPOSED -> COUNTERED
    PERFORM public.transition_deal_status(
        p_deal_id,
        'COUNTERED'::public.deal_status,
        p_actor_user_id,
        v_new_version,
        jsonb_build_object(
            'action', 'buyer_counter_proposal',
            'parent_version_id', v_current_version,
            'new_version_id', v_new_version
        )
    );

END;
$$;
