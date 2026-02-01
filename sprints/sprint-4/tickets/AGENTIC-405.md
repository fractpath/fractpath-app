AGENTIC-405
Controlled Function — homeowner_authorize_counter()
Intent Freeze

Homeowner remains sole economic authority.

Authorization deauthorizes prior version and updates current_version_id via controlled function only.

Scope Classification
Category	Classification
DB Function	NEW
State Machine	EXTEND
Authorization	ENFORCE
Audit	EXTEND
Function Skeleton
CREATE OR REPLACE FUNCTION homeowner_authorize_counter(
    p_deal_id UUID,
    p_actor_user_id UUID,
    p_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN

    PERFORM assert_user_role(p_actor_user_id, 'HOMEOWNER');

    PERFORM promote_scenario_to_deal(
        p_deal_id,
        p_version_id,
        p_actor_user_id
    );

    PERFORM transition_deal_status(
        p_deal_id,
        'AUTHORIZED_BY_HOMEOWNER',
        p_actor_user_id
    );

    INSERT INTO audit_log (...)
    VALUES (...);

END;
$$;

Verification Commands
SELECT homeowner_authorize_counter('deal', 'homeowner', 'version');

SELECT current_version_id FROM deals WHERE id='deal';

Evidence Checklist

Previous version deauthorized

current_version_id updated via controlled path

Audit log shows lineage

Exit Criteria

Homeowner retains exclusive authorization authority.
