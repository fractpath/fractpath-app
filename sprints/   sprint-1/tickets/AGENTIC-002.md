# AGENTIC-002 — Explicit HubSpot Write Failure Handling

## Problem Statement
Silent failures prevent trust in HubSpot data.

## Acceptance Criteria
- Failed writes are detectable.
- Failures are surfaced clearly for internal review.
- No silent success states.

## Constraints
- No retries that risk duplication.
- No sensitive payload logging.

## Out of Scope
- Alerting systems
- Dashboards

## PR Requirements
- Description of failure modes and safe behavior.
