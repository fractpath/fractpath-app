# HUMAN-001 — Minimum Intake Fields & Scenario Summary Rules

## Purpose
Define the minimum set of intake inputs and the exact rules for constructing `fractPathScenarioSummary`.

This document freezes product meaning and legal boundaries for Sprint 1.  
No code is written here.

---

## Minimum Intake Fields (Frozen)

The intake must collect the following fields and no more:

1. **Home Address**
   - Description: Street address of the property being evaluated
   - Purpose: Used to determine approximate fair market value via automated valuation models (AVMs)
   - Example: “123 Main St, Annapolis, MD”

2. **Estimated Equity Percentage Owned**
   - Description: Homeowner’s estimate of the portion of the home owned outright (not financed)
   - Purpose: Used as a conservative signal to estimate how much equity may be available to sell
   - Example: “Approximately 60% owned”

3. **Preferred Cash Structure**
   - Description: How the homeowner prefers to receive cash from a potential equity sale
   - Allowed values:
     - “Upfront lump sum”
     - “Ongoing installments”
     - “Combination of upfront + installments”
     - “Not sure / exploring”
   - Purpose: Signals flexibility and intent without implying specific amounts or outcomes
   - Example: “Ongoing installments”

4. **Intended Sale Timeline**
   - Description: When the homeowner expects or prefers to sell the home
