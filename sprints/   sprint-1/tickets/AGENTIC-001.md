# AGENTIC-001 — HubSpot Property Verification & Payload Wiring

## Problem Statement
`fractPathScenarioSummary` may not be written due to mismatched keys or payload omission.

## Acceptance Criteria
- Property existence and API writability confirmed.
- Payload includes non-empty `fractPathScenarioSummary`.
- Create and update paths handled correctly.

## Constraints
- No HubSpot workflow changes.
- No new properties.

## Data & Security Notes
- Use environment-stored secrets only.

## Out of Scope
- Automation or lifecycle changes

## PR Requirements
- Evidence of payload inspection.
