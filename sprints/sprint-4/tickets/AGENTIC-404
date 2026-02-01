AGENTIC-404
Controlled Function — buyer_accept_proposal()
Intent Freeze

Buyer acceptance binds buyer intent only.

Does not restrict homeowner withdrawal (Sprint 5 concern).

Scope Classification
Category	Classification
DB Function	NEW
State Machine	EXTEND
Authorization	ENFORCE
Audit	EXTEND
Preconditions

deal.status = AUTHORIZED_BY_HOMEOWNER

actor role = BUYER

version = current_version_id

Function Skeleton
CREATE OR REPLACE FUNCTION buyer_accept_proposal(
    p_deal_id UUID,
    p_actor_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_status TEXT;
BEGIN

    PERFORM assert_user_role(p_actor_user_id, 'BUYER');

    SELECT status
    INTO v_status
    FROM deals
    WHERE id = p_deal_id
    FOR UPDATE;

    IF v_status <> 'AUTHORIZED_BY_HOMEOWNER' THEN
        RAISE EXCEPTION 'Deal not eligible for acceptance';
    END IF;

    PERFORM transition_deal_status(
        p_deal_id,
        'ACCEPTED_BY_BUYER',
        p_actor_user_id
    );

    INSERT INTO audit_log (...)
    VALUES (...);

END;
$$;

Verification Commands
SELECT buyer_accept_proposal('deal-uuid', 'buyer-uuid');

SELECT status FROM deals WHERE id='deal-uuid';

Evidence Checklist

Idempotent behavior

Rejects unauthorized state

Audit row written

Exit Criteria

Buyer acceptance safe + attributable.
