# Sprint 1 Runbook — Remaining Work

## Sprint Goal
Ensure that homeowner intake submissions reliably generate a complete, structured lead record in HubSpot, including a populated `fractPathScenarioSummary`, so that internal review and follow-up can occur without manual reconstruction.

## Context
- Public intake flow exists and is able to collect scenario inputs from users.
- Scenario data is being generated client-side and/or server-side.
- HubSpot contact creation/update is partially wired and functioning for some fields.
- The custom HubSpot property `fractPathScenarioSummary` exists but is **not consistently populating**.
- Debugging to date has shown uncertainty around:
  - where the scenario summary is assembled
  - whether it is being sent at all
  - whether the payload matches HubSpot property expectations
- No reliable end-to-end confirmation exists that:
  intake → scenario summary → HubSpot contact → internal review
  is working deterministically.

## In-Scope Tasks
- Identify the authoritative source of truth for `fractPathScenarioSummary`
  (where it is generated and when).
- Ensure `fractPathScenarioSummary` is deterministically assembled in a single place
  (not partially in client code and partially in server code).
- Validate that the HubSpot contact property:
  - exists
  - is writable via API
  - matches the payload key exactly
- Confirm that the HubSpot API call:
  - includes `fractPathScenarioSummary`
  - sends a non-empty value
  - handles create vs update correctly
- Add safe logging or inspection to confirm payload contents
  without leaking PII or sensitive financial data.
- Ensure failure modes are explicit:
  - scenario summary missing
  - HubSpot API rejection
  - partial contact creation
- Document the final, working data flow so it is understandable
  without reading code.

## Explicitly Out of Scope
- Lead scoring or prioritization logic
- Sales pipeline automation or lifecycle stage changes
- Marketing email triggers or nurture campaigns
- Dashboard analytics or reporting
- Changes to intake questions or scenario semantics
- Any interpretation, approval, or pricing logic

## Risks / Sensitivities
- Legal:
  - Scenario summaries must remain illustrative and non-binding.
  - No language implying approval, eligibility, or offer may be introduced.
- Financial:
  - Scenario data may reference home value, equity, or ranges and must not
    be framed as financial advice.
- Trust:
  - Internal teams must be able to trust that what appears in HubSpot
    accurately reflects what the user submitted.
  - Silent failures (empty summaries) erode confidence quickly.
- Data:
  - Scenario summary may include sensitive personal or financial context.
  - Logging and debugging must avoid storing or exposing raw payloads unnecessarily.
  - Cross-user data leakage must be impossible.
