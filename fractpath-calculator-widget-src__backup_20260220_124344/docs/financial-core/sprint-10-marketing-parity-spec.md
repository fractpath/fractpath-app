# FractPath — Sprint 10 Marketing Parity Specification

Version: 10.0.0  
Applies To: fractpath-marketing  
Depends On: sprint-10-compute-spec.md  

---

# Purpose

This document defines how the marketing site must integrate with the canonical financial compute engine.

The marketing site must not implement any independent financial logic.

All financial outputs must originate from @fractpath/compute.

---

# Core Principle

Single Source of Financial Truth

Marketing may:

- Collect inputs
- Display outputs
- Render charts

Marketing may NOT:

- Derive financial formulas
- Compute IRR independently
- Calculate floor/ceiling logic locally
- Reconstruct settlement logic

All financial values must come from computeDeal().

---

# Integration Requirements

Marketing must import:

import { computeDeal } from "@fractpath/compute"


All calculator results must call:

const results = computeDeal(terms, assumptions)


Displayed values must reference:

results.invested_capital_total
results.isa_settlement
results.investor_profit
results.investor_multiple
results.investor_irr_annual


---

# Lite Snapshot Rendering

Marketing may choose to display a simplified view:

Example:

- Projected Cash Back
- Estimated Annual Return
- Total Equity Purchased
- Settlement Multiple

However:

These values must be derived from DealResults.

No recalculation permitted.

---

# Parity Validation

Before release:

Marketing must validate:

- Standard scenario parity with canonical spreadsheet
- Early exit scenario parity
- Late exit scenario parity
- Ceiling binding scenario
- NO_FLOOR negative scenario

All must match compute module outputs exactly.

---

# No Duplicate Math Rule

The following are prohibited in marketing:

- Local IRR solver
- Hardcoded ceiling formulas
- Gain calculation logic
- Floor logic
- Timing factor logic

If any financial formula exists outside compute module, it must be removed.

---

# Version Visibility

Marketing must include:

results.compute_version


Available for debugging or console logging.

---

# Future API Support

If compute is exposed via API endpoint:

Marketing may call API wrapper.

However:

API must call the same canonical compute module.

No logic duplication in API layer.

---

# Definition of Done

Marketing parity is complete when:

- All financial outputs originate from computeDeal()
- No financial formulas exist in marketing repo
- All scenarios match compute module outputs
- compute_version is embedded in result object

---

# End of Specification
