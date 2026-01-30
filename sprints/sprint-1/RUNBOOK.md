Below is a **drop-in replacement** for your existing Sprint 1 Runbook.
It incorporates the **Product Constitution v1** rules while **not expanding Sprint 1 scope** beyond what you explicitly allowed.

You can copy/paste this directly into GitHub.

---

# Sprint 1 Runbook — Secure Intake & Opportunity Capture (Constitution-Aligned)

## Sprint Goal

Ship the **minimum secure intake pipeline** that produces a deterministic, **non-binding**, persona-aware `fractPathScenarioSummary`, anchored to a **Property (address-based)**, and writes it to HubSpot on submission with explicit success/failure visibility.

This sprint **does not create deals, deal IDs, property control, or negotiations**.
It prepares the system for those concepts without prematurely implementing them.

---

## Product Constitution Alignment (Why This Sprint Exists)

Sprint 1 implements **State 0 → State 1** of the FractPath Product Constitution:

* **State 0:** Persona-specific scenario exploration (marketing)
* **State 1:** Opportunity capture (non-binding, CRM-only)

This sprint **must not** cross into:

* Property control
* Deal ID generation
* Verification
* Negotiation
* Execution readiness

Those are explicitly deferred to later sprints.

---

## Context

* Marketing site is built in **Webflow**
* This repo currently serves a static placeholder (no production app logic)
* HubSpot property `fractPathScenarioSummary` exists (or will be confirmed)
* No intake form, scenario logic, or HubSpot API integration exists yet
* Product Constitution v1 is authoritative for permissions and boundaries

---

## In-Scope (Exactly What We Are Building)

### 1. Minimal Secure App Skeleton

* Server-side capable (Node / Flask / Next API / similar)
* Accepts POST submissions from Webflow
* Secrets stored only in environment variables
* Explicit request validation and failure responses

> No authentication system required in Sprint 1.

---

### 2. Canonical `fractPathScenarioSummary` Generator (Server-Side)

Create **one** deterministic function that:

* Accepts validated intake inputs
* Produces a **plain-English, non-binding summary**
* Is stable and repeatable for the same inputs
* Is safe to store in CRM and review internally

**This function is the single source of truth.**

---

### 3. Intake Form (Marketing → App)

Create a minimal intake endpoint that supports **persona-aware opportunity capture**.

#### Required Inputs (Minimum Viable)

**Shared**

* persona (`homeowner | buyer | realtor`)
* property_address (full address required; ZIP alone is insufficient)
* email
* consent / acknowledgement checkbox

**Persona-Specific (Minimal)**

* **Homeowner**

  * estimated_home_value
  * estimated_equity_percent
  * desired_cash_amount
  * time_horizon (sale / refinance / undecided)

* **Buyer**

  * target_cash_amount
  * target_equity_percent
  * target_time_horizon

* **Realtor**

  * client_type (buyer | homeowner)
  * estimated_price_range
  * market_location (derived from address)

> These inputs are **illustrative only** and must not imply approval, pricing, or eligibility.

---

### 4. HubSpot Write (Opportunity Capture Only)

On successful submission:

* Create or update a HubSpot contact
* Populate:

  * `fractPathScenarioSummary`
  * persona
  * property_address
  * source = `fractpath_marketing_intake`

**Important**

* No deal ID
* No property ID persisted yet
* No ownership inference
* No verification state

This is **State 1: Opportunity**, not a Deal.

---

### 5. Explicit Failure Handling (Non-Optional)

All failures must be visible and explicit:

* Invalid payload → clear 4xx response
* HubSpot failure → clear 5xx response
* Partial success is not allowed

**No silent failures. No console-only errors.**

---

### 6. Documentation & Testability

Document:

* How to run the app locally
* Required env vars
* How to POST a test payload
* Expected HubSpot outcome
* Known failure modes

---

## Explicitly Out of Scope (Hard Boundaries)

This sprint **must not** include:

* Deal creation
* Deal IDs or property IDs
* Property claiming or verification
* Buyer anonymity logic
* Realtor delegation
* Negotiation states
* Outreach deposits
* Payments
* Supabase auth / RLS
* Multi-step onboarding UX
* Analytics dashboards
* Lead scoring or automation
* Pricing logic or eligibility decisions
* Legal execution language

If a task implies **authority, control, or negotiation**, it is out of scope.

---

## Risks & Sensitivities (Constitution-Aligned)

### Legal

* Summary must be clearly **illustrative and non-binding**
* No language implying approval, offer, or execution

### Financial

* No financial advice
* No implied rates, returns, or guaranteed outcomes

### Trust & Safety

* Users must see success/failure clearly
* HubSpot must exactly reflect submitted data
* No sensitive PII beyond email + address

### Data & Security

* No raw request payload logging
* Secrets only via env vars
* Server-side summary generation only (never client-side)

---

## Acceptance Criteria (Definition of Done)

Sprint 1 is complete when:

1. A Webflow form can POST to the app
2. The app validates inputs and generates `fractPathScenarioSummary`
3. The summary is written deterministically to HubSpot
4. Failures are visible and testable
5. No deal, property control, or verification logic exists
6. Documentation allows a new developer to test end-to-end in <10 minutes

---

## Sprint 1 Deliverable Summary

**What Exists After Sprint 1**

* Secure intake endpoint
* Canonical scenario summary generator
* HubSpot opportunity capture
* Constitution-aligned boundaries

**What Explicitly Does Not Exist Yet**

* Property control
* Deal negotiation
* Ownership verification
* Buyer/homeowner entitlements

---

If you’re ready, the **next logical artifact to update** after this is:

> **Agentic Workflow / Ticket Templates**
> So agents don’t accidentally implement deal or ownership logic in Sprint 2.

Upload the next artifact when ready.
