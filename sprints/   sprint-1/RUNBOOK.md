# Sprint 1 Runbook — Remaining Work

## Sprint Goal
Ship the minimum secure intake pipeline that produces a deterministic, non-binding `fractPathScenarioSummary` and writes it to HubSpot on submission.

## Context
- Marketing site is being built in Webflow.
- This repo currently serves a static placeholder (no app code yet).
- HubSpot property `fractPathScenarioSummary` exists (or will be confirmed).
- No intake form, scenario logic, or HubSpot API integration exists in code yet.

## In-Scope Tasks
- Create a minimal secure app skeleton (server-side capable) suitable for intake submissions.
- Implement a single canonical `fractPathScenarioSummary` generator (server-side).
- Create an intake form that collects the minimum scenario inputs (no semantic changes beyond “minimum viable fields”).
- Implement server-side HubSpot write to populate `fractPathScenarioSummary` deterministically.
- Add explicit failure handling (no silent failures) and a simple verification path.
- Document the end-to-end flow and how to test.

## Explicitly Out of Scope
- Lead scoring, lifecycle stage automation, nurture emails, workflows
- Eligibility/approval/pricing logic or offer language
- Analytics dashboards and reporting
- Complex multi-step onboarding UX
- Supabase auth/RLS (unless needed for minimal secure submission)
- Any long-term architecture refactor

## Risks / Sensitivities
- Legal: summary must remain illustrative/non-binding; no approval language
- Financial: no financial advice, no implied terms
- Trust: HubSpot must reflect what user submitted; failures must be visible
- Data: minimize sensitive data; no raw payload logging; secrets must stay in env vars
