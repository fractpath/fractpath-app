# AGENTIC-405  
## Controlled Function — homeowner_authorize_counter() (Sprint 4)

---

## Intent Freeze

Homeowner remains sole economic authority.

Homeowner authorization of a countered version must:

- deauthorize the prior authorized version (if any)
- update deals.current_version_id via controlled pathway only
- emit attributable, auditable signals
- never allow direct table writes to binding fields outside approved functions

This ticket must align with the verified Sprint 3 primitive:

- `transition_deal_status(p_deal_id, p_new_status, p_actor_user_id, p_version_id, p_metadata)`

IMPORTANT:
- `transition_deal_status` updates **status only** (does NOT move current_version_id or authorize versions).
- Therefore Sprint 4 requires `authorize_deal_version(...)` (AGENTIC-406) as the binding-field gateway.

---

## Scope Classification

| Category | Classification |
|----------|---------------|
| DB Function | NEW |
| State Machine | EXTEND |
| Authorization | ENFORCE |
| Audit | EXTEND |
| Schema | USE EXISTING (AGENTIC-402/403/406) |

---

## Preconditions

- deal exists
- actor_user_id exists
- actor has role = HOMEOWNER (must exist in deal_user_roles for deal)
- (If your model requires it) actor has controller entitlement required for authorization
- version exists and belongs to the deal:
  - deal_versions.id = p_version_id
  - deal_versions.deal_id = p_deal_id
- version is unauthorized (e.g., authorized_at IS NULL)
- deal not WITHDRAWN_BY_HOMEOWNER (terminal)
- function executes inside a transaction
- deal row must be locked FOR UPDATE

---

## Constitutional Invariants

- No silent mutation
- No direct writes to deals.current_version_id
- Authorization is attributable (actor_user_id + role)
- All irreversible effects are auditable
- Binding-field changes occur only through authorize_deal_version(...)
- transition_deal_status called with explicit:
  - p_version_id = the version being referenced for the transition
  - p_metadata includes action + lineage context

---

## Function Definition (Authoritative Skeleton)

```sql
CREATE OR REPLACE FUNCTION public.homeowner_authorize_counter(
    p_deal_id UUID,
    p_actor_user_id UUID,
    p_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_status public.deal_status;
    v_current_version UUID;
    v_version_deal_id UUID;
    v_is_authorized BOOLEAN;
    v_parent_version UUID;
BEGIN

    -- Deal-scoped role validation (matches Sprint 3 model)
    PERFORM public.assert_deal_role(p_deal_id, p_actor_user_id, 'HOMEOWNER');

    -- Lock deal row to prevent races with other transitions/authorizations
    SELECT status, current_version_id
      INTO v_status, v_current_version
    FROM public.deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Deal does not exist';
    END IF;

    IF v_status = 'WITHDRAWN_BY_HOMEOWNER'::public.deal_status THEN
        RAISE EXCEPTION 'Cannot authorize counter for withdrawn deal'
          USING errcode = 'P0001';
    END IF;

    -- Validate the version belongs to this deal and is unauthorized
    SELECT deal_id,
           (authorized_at IS NOT NULL),
           parent_version_id
      INTO v_version_deal_id, v_is_authorized, v_parent_version
    FROM public.deal_versions
    WHERE id = p_version_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version does not exist';
    END IF;

    IF v_version_deal_id <> p_deal_id THEN
        RAISE EXCEPTION 'Version does not belong to deal'
          USING errcode = 'P0001';
    END IF;

    IF v_is_authorized THEN
        RAISE EXCEPTION 'Version is already authorized'
          USING errcode = 'P0001';
    END IF;

    -- Stale protection (strict default for Sprint 4):
    -- Only authorize counters that descend from the current baseline.
    IF v_parent_version IS NOT NULL AND v_parent_version <> v_current_version THEN
        RAISE EXCEPTION 'Stale counter: parent_version_id (%) does not match current_version_id (%)',
          v_parent_version, v_current_version
          USING errcode = 'P0001';
    END IF;

    -- Step 1: perform binding-field authorization + current_version_id update (AGENTIC-406)
    PERFORM public.authorize_deal_version(
        p_deal_id,
        p_version_id,
        p_actor_user_id,
        jsonb_build_object(
            'action', 'homeowner_authorize_counter',
            'authorized_version_id', p_version_id,
            'prior_current_version_id', v_current_version,
            'parent_version_id', v_parent_version
        )
    );

    -- Step 2: transition status (status-only) using Sprint 3 primitive.
    -- NOTE: This call must respect the existing transition matrix.
    -- Common authorized transition is: PROPOSED -> AUTHORIZED_BY_HOMEOWNER.
    PERFORM public.transition_deal_status(
        p_deal_id,
        'AUTHORIZED_BY_HOMEOWNER'::public.deal_status,
        p_actor_user_id,
        p_version_id,
        jsonb_build_object(
            'action', 'homeowner_authorize_counter_status_transition',
            'authorized_version_id', p_version_id,
            'prior_status', v_status
        )
    );

END;
$$;
