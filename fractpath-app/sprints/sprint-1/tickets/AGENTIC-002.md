# AGENTIC-002 — HubSpot Write & Failure Handling

## Problem Statement
The generated summary must be written to HubSpot deterministically with no silent failures.

## Acceptance Criteria
- Server-side write to `fractPathScenarioSummary`
- Explicit error handling if write fails
- Simple verification path (manual test)
- No raw payload logging

## Constraints
- No workflows, emails, or lifecycle changes
- Use existing HubSpot property only

## Documentation
- Describe end-to-end flow
- Describe how to test locally

## PR Requirements
- Evidence HubSpot received value
