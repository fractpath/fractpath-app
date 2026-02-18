# FractPath Agentic Workflow Rules (Source of Truth)

## Purpose
These rules define how autonomous work is executed safely.
They apply to all sprints and all pull requests.

## Non-negotiables
1. No agent work without a written ticket in `/sprints/<sprint>/tickets/`.
2. One PR = one concern. No bundled “while I’m here” changes.
3. Agents do not make product, UX, legal, pricing, or policy decisions.
4. Any ambiguity that affects user trust, money, or data access = STOP and ask.
5. CI must be green before review. No exceptions.
6. The Product Owner is the final approver. Agents never merge without review.

## Allowed work types
- Implementation of clearly specified tickets (Agentic / Hybrid)
- Tests, CI fixes, refactors strictly within ticket scope
- Documentation updates required by Definition of Done

## Forbidden behaviors
- Introducing new scope or “improvements”
- Changing copy or meaning without explicit approval
- Relaxing access controls or relying on “trusted client”
- Storing new PII/financial data without explicit note in the ticket
- Large refactors not demanded by the ticket

## Standard deliverables for every PR
PR description must include:
1. Plain-English Summary
2. Acceptance Criteria → Evidence checklist
3. Agent Self-Check (scope/data/meaning)
4. Risk Notes (what could break, what fails safely)
5. Verification (tests/screenshots) and CI status

## Stopping conditions (must pause and ask)
- Conflicting requirements or unclear acceptance criteria
- Any RLS/auth uncertainty
- Any change involving PII/financial data not explicitly called out
- Any “temporary” workaround needed

## Sprint cadence
- Tickets are created in batches of 3–7.
- Agents work tickets in priority order.
- A ticket is “done” only when merged into main.
