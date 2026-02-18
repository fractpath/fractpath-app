# AGENTIC-002 — Deterministic Scenario Summary + HubSpot Write

## Problem Statement
Sprint 1 requires a minimum secure intake pipeline that produces a deterministic, non-binding `fractPathScenarioSummary` and writes it to HubSpot on submission. The current app scaffold accepts intake inputs but performs no side effects and generates no canonical scenario summary.

## Scope
In scope:
- Server-side deterministic `fractPathScenarioSummary` generation
- Server-side HubSpot contact create/update with `fractPathScenarioSummary`
- Explicit failure handling (no silent failures)
- Minimal data handling (avoid sensitive PII; do not log raw payloads)
- Documentation for local testing

Out of scope:
- Deal IDs, property IDs, authentication, verification, negotiation states
- Lead scoring, workflows, nurture automation
- Pricing, eligibility, approval language
- Database persistence

## Acceptance Criteria
1. A new server-side function generates `fractPathScenarioSummary` deterministically from validated intake inputs.
2. The `/api/submit` endpoint:
   - validates input (existing Zod schema is acceptable)
   - generates `fractPathScenarioSummary`
   - writes the summary to HubSpot successfully (create or update a contact)
3. HubSpot write is explicit and testable:
   - on success: returns `{ ok: true }`
   - on failure: returns `{ ok: false, error: <human-readable message> }` and a non-2xx status
4. No raw request payload is logged.
5. HubSpot API key is read only from an environment variable (no hardcoding).
6. A README or sprint doc section explains how to test locally, including the required env var name.

## Constraints (Non-Negotiable)
- Summary must remain illustrative and non-binding (no offer/approval language).
- HubSpot is not a system of record; it stores only the stringified summary and minimal attribution fields.
- No new user-facing screens or flows beyond the current form.
- No additional data persistence introduced.

## Data & Security Notes
- Data included in HubSpot should be minimal: email (if available), scenario summary string, and optional persona/source fields.
- If the current form does not include email yet, add a single email field to the form and include it in validation. Do not add any other identity fields.
- Do not print HubSpot responses or secrets to logs.

## PR Requirements
- Plain-English PR summary
- Tests for the summary generator (at minimum)
- CI must pass
- Include evidence that HubSpot write was exercised (e.g., documented curl command + expected response)

