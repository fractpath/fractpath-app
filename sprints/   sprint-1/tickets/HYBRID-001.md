# HYBRID-001 — Authoritative Scenario Summary Definition

## Problem Statement
`fractPathScenarioSummary` is not reliably populated in HubSpot because ownership of where and how the summary is generated is unclear.

## Human-Frozen Intent
- There must be exactly one authoritative source for the final scenario summary.
- The summary must faithfully reflect what the homeowner submitted.
- No interpretation, approval, eligibility, or pricing language may be introduced.
- Summary content is illustrative and non-binding.

## Acceptance Criteria (Frozen)
- The system has one clearly defined location responsible for generating the final summary.
- All downstream systems consume this summary without modifying meaning.
- Removal of duplicate or partial summary generation is complete.

## Implementation Boundaries
- Agent may refactor code to centralize summary generation.
- Agent may not change intake questions or scenario semantics.

## Data & Security Notes
- Summary may include sensitive financial context.
- No raw payload logging.
- No cross-user visibility.

## Out of Scope
- Scenario model changes
- Lead scoring or automation
- UI copy changes

## PR Requirements
- Plain-English explanation of where the summary is generated and why.
- Reference to Sprint 1 INTENT_FREEZE.

