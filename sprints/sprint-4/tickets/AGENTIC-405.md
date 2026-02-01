# AGENTIC-405  
## Controlled Function — homeowner_authorize_counter() (Sprint 4)

---

## Intent Freeze

Homeowner remains sole economic authority.

Homeowner authorization of a countered version must:
- deauthorize the prior authorized version (if any)
- update `deals.current_version_id` via controlled pathway only
- emit attributable, auditable signals
- never allow direct table writes to binding fields outside approved functions

This ticket must align with the verified Sprint 3 primitive:

`transition_deal_status(p_deal_id, p_new_status, p_actor_user_id, p_version_id, p_metadata)`

IMPORTANT: `promote_scenario_to_deal(p_scenario_id)` is scenario-scoped and MUST NOT be used for deal_version authorization.

---

## Scope Classification

| Category | Classification |
|----------|---------------|
| DB Function | NEW |
| State Machine | EXTEND |
| Authorization | ENFORCE |
| Audit | EXTEND |
| Schema | USE EXISTING (AGENTIC-402/403) |

---

## Preconditions

- deal exists
- actor_user_id exists
- actor has role = HOMEOWNER
- (If your model requires it) actor has controller entitlement required for authorization
- version exists and belongs to the deal:
  - `deal_versions.id = p_version_id`
  - `deal_versions.deal_id = p_deal_id`
- version is unauthorized (e.g., `authorized_at IS NULL`)
- deal not WITHDRAWN_BY_HOMEOWNER (and any other terminal states)
- function executes inside a transaction
- deal row must be locked FOR UPDATE

---

## Constitutional Invariants

- No silent mutation
- No updates to deal_versions rows except through authorized pathways
- No direct writes to deals.current_version_id
- Authorization must be attributable (actor_user_id + role)
- All irreversible effects must be auditable
- transition_deal_status must be called with explicit:
  - p_version_id = the version being authorized
  - p_metadata includes action + lineage context

---

## Function Definition (Authoritative Skeleton)

```sql
CREATE OR REPLACE FUNCTION homeowner_authorize_counter(
    p_deal_id UUID,
    p_actor_user_id UUID,
    p_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_status deal_status;
    v_current_version UUID;
    v_version_deal_id UUID;
    v_is_authorized BOOLEAN;
BEGIN

    -- Validate role (replace with your real assertion function if different)
    PERFORM assert_user_role(p_actor_user_id, 'HOMEOWNER');

    -- Lock deal row to prevent races with other transitions/authorizations
    SELECT status, current_version_id
    INTO v_status, v_current_version
    FROM deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Deal does not exist';
    END IF;

    -- Validate the version belongs to this deal and is eligible
    SELECT deal_id,
           (authorized_at IS NOT NULL)
    INTO v_version_deal_id, v_is_authorized
    FROM deal_versions
    WHERE id = p_version_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version does not exist';
    END IF;

    IF v_version_deal_id <> p_deal_id THEN
        RAISE EXCEPTION 'Version does not belong to deal';
    END IF;

    IF v_is_authorized THEN
        RAISE EXCEPTION 'Version is already authorized';
    END IF;

    -- Optional: enforce that the version is a counter lineage off the current baseline
    -- (keep this strict in Sprint 4 unless you explicitly allow authorizing older counters)
    -- Example check (if parent_version_id exists and must match current_version_id):
    -- IF (SELECT parent_version_id FROM deal_versions WHERE id=p_version_id) <> v_current_version THEN
    --   RAISE EXCEPTION 'Stale counter: parent does not match current baseline';
    -- END IF;

    -- Authorize + transition using verified Sprint 3 primitive.
    -- NOTE: This assumes transition_deal_status performs the controlled update/supersession internally.
    PERFORM transition_deal_status(
        p_deal_id,
        'AUTHORIZED_BY_HOMEOWNER',
        p_actor_user_id,
        p_version_id,
        jsonb_build_object(
            'action', 'homeowner_authorize_counter',
            'authorized_version_id', p_version_id,
            'prior_current_version_id', v_current_version
        )
    );

END;
$$;
