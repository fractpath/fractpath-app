AGENTIC-403
Controlled Function — buyer_counter_proposal()
Intent Freeze

Buyer counters must create a new version.

Never mutate existing version rows.

Scope Classification
Category	Classification
DB Function	NEW
State Machine	EXTEND
Authorization	ENFORCE
Audit	EXTEND
Preconditions

deal exists

actor_user_id exists

actor role validated server-side

deal not withdrawn

Function Skeleton
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
BEGIN

    -- Role validation
    PERFORM assert_user_role(p_actor_user_id, 'BUYER');

    -- Lock deal row
    SELECT current_version_id
    INTO v_current_version
    FROM deals
    WHERE id = p_deal_id
    FOR UPDATE;

    -- Insert new version
    INSERT INTO deal_versions (
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

    -- Transition status
    PERFORM transition_deal_status(
        p_deal_id,
        'COUNTERED',
        p_actor_user_id
    );

    -- Audit log
    INSERT INTO audit_log (...)
    VALUES (...);

END;
$$;

Concurrency Guard

FOR UPDATE ensures no race overwrites current_version_id.

Verification Commands
SELECT buyer_counter_proposal('deal-uuid', 'buyer-uuid', '{"price": 450000}');

SELECT parent_version_id
FROM deal_versions
WHERE deal_id = 'deal-uuid'
ORDER BY created_at DESC;

Evidence Checklist

Two concurrent counters create two versions

No direct writes to deals.current_version_id

Audit event emitted

Exit Criteria

Counters versioned. No mutation pathway.
