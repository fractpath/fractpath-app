# HUMAN-001 — Minimum Intake Fields & Scenario Summary Rules

## Purpose
Define the minimum set of intake inputs and the exact rules for constructing `fractPathScenarioSummary`.

This document freezes product meaning and legal boundaries. No code is written here.

---

## Minimum Intake Fields (Frozen)
The intake must collect the following fields and no more:

- **[Field 1]**:
  - Description:
  - Example value:

- **[Field 2]**:
  - Description:
  - Example value:

- **[Field 3]**:
  - Description:
  - Example value:

(Optional: add 1–2 more if absolutely necessary.)

---

## Scenario Summary Rules (Frozen)

The `fractPathScenarioSummary` MUST:

- Be generated server-side only
- Reflect user-provided inputs faithfully
- Be deterministic (same inputs → same output)
- Be human-readable for internal review
- Include a non-binding disclaimer line

The summary MUST NOT:

- Include approval, eligibility, pricing, or offer language
- Include advice or recommendations
- Infer or calculate values the user did not provide
- Change meaning based on UI context

---

## Required Disclaimer Line (Exact)
Include the following line verbatim at the end of the summary:

> “This scenario summary is illustrative only and does not represent an offer, approval, or commitment.”

---

## Formatting Guidance (Non-Binding)
- Bullets or short paragraphs are acceptable
- Clarity > brevity
- Internal-facing tone

---

## Out of Scope
- Eligibility logic
- Financial calculations
- Data persistence beyond submission handling
