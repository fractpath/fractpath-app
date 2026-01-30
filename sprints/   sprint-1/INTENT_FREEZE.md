# Sprint 1 — Intent Freeze
Sprint Name: Sprint 1 — Minimal Intake → Scenario Summary → HubSpot

## 1. Success Definition
- A user can submit an intake form and HubSpot receives a non-empty, accurate `fractPathScenarioSummary`.
- Summary is deterministic (same inputs → same output).
- Failures are explicit and observable (no silent missing summaries).
- Summary remains illustrative and non-binding.

## 2. In-Scope Decisions (Explicit)
- Building the minimal app skeleton needed to accept submissions securely (server-side).
- Defining a minimum set of intake inputs required to create a meaningful summary.
- Centralizing summary generation in a single server-side location.
- Implementing HubSpot write via server-side API using env secrets.
- Adding safe inspection (no raw payload logs) for verification.

## 3. Out-of-Scope Decisions (Explicit)
- No eligibility, approval, pricing, underwriting, or offer language.
- No marketing automation workflows, emails, scoring, lifecycle stage changes.
- No analytics dashboards or reporting.
- No expansion of intake scope beyond minimum viable fields.
- No storing of sensitive data beyond what is required to write the summary to HubSpot.

## 4. Invariants (Must Never Change)
- Non-binding: no implication of approval/offer.
- Trust: HubSpot reflects what the user submitted.
- Privacy: do not log raw sensitive data; minimize captured data.
- Security: secrets in env vars; no trusted-client assumptions for HubSpot writes.
- Safety: explicit failure paths; deny-by-default for any protected actions.

## 5. Acceptable Ambiguity
- Exact app framework structure (as long as server-side submission exists).
- Formatting of the summary (bullets vs paragraph), meaning unchanged.
- UI design minimalism (simple form is acceptable).

## 6. Unacceptable Ambiguity
- Whether the summary is being generated server-side.
- Whether HubSpot is receiving and writing the property successfully.
- Whether failures are silent.
- Whether meaning changed (semantics drift).
