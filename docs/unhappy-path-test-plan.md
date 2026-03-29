# Unhappy-Path Test Plan — ATTOM-First Policy

This document describes the manual test scenarios for the ineligible-deal unhappy path, incorporating the ATTOM-first policy.

---

## Policy summary

1. **ATTOM must complete before renegotiation or manual appraisal challenge can be unlocked.**
   - A deal that fails RentCast eligibility enters `attom_required`, not `deal_terms_ineligible`.
   - Renegotiation and manual appraisal challenge CTAs are suppressed in `attom_required`.
   - The owner is directed to the property page to request the ATTOM enhanced valuation.

2. **Once ATTOM completes, the ineligible branch continues normally.**
   - If the deal is still ineligible under the ATTOM-verified FMV, the stage advances to `deal_terms_ineligible`.
   - Renegotiation and manual appraisal challenge CTAs become available.

3. **Manual appraisal can be proactively ordered at any time from the property page.**
   - The `initiate-manual-appraisal` API route does not gate on ATTOM completion.
   - When ordered before ATTOM completes, a contextual note explains the deal escalation ordering.

4. **`liveIneligiblePhase` drives property-page guidance blocks.**
   - `attom_required`: guidance directs owner to request ATTOM first; renegotiation not offered.
   - `void_renegotiable`: guidance offers renegotiation or valuation challenge paths.
   - `null`: no ineligible deal context; valuation sections show in default/proactive mode.

---

## Stage derivation (milestones.ts) unit checks

| Scenario | `triageStatus` | `escalationAvmStatus` | `renegotiationStatus` | `manualAppraisalStatus` | Expected stage |
|---|---|---|---|---|---|
| Ineligible, ATTOM not started | `ineligible` | `null` | `null` | `null` | `attom_required` |
| Ineligible, ATTOM ordered | `ineligible` | `ordered` | `null` | `null` | `attom_required` |
| Ineligible, ATTOM complete | `ineligible` | `completed` | `null` | `null` | `deal_terms_ineligible` |
| Ineligible, ATTOM complete, renegotiation requested | `ineligible` | `completed` | `requested` | `null` | `renegotiation_requested` |
| Ineligible DB, liveIneligible false, appraisal complete | `ineligible` | `completed` | `null` | `complete` | `enhanced_review_complete` |
| Eligible | `ready_for_deposit` | `null` | `null` | `null` | `ready_for_signatures` |
| Terminal: closed | — | — | — | — | `deal_closed` |

---

## Deal page — owner view

### Scenario A: Deal ineligible, ATTOM not yet started

**Setup:**
- Deal `triage_status = 'ineligible'`
- Property `escalation_avm_status = null`

**Expected on deal page:**
- Exception callout banner renders ("Enhanced valuation required")
- `AttomRequiredDealOwnerBlock` renders (not `IneligibleDealOwnerBlock`)
- Block explains that ATTOM must complete first, with a link to the property page
- No renegotiation button visible
- No appraisal challenge link visible

---

### Scenario B: Deal ineligible, ATTOM complete, not yet renegotiated

**Setup:**
- Deal `triage_status = 'ineligible'`
- Property `escalation_avm_status = 'completed'`
- Deal `renegotiation_status = null`

**Expected on deal page:**
- Exception callout banner renders ("Revised terms required")
- `IneligibleDealOwnerBlock` renders (NOT ATTOM required block)
- Path A (renegotiate) — "Notify team" button visible; not yet submitted
- Path B (valuation challenge) — link to property page for manual appraisal

---

### Scenario C: Deal ineligible, ATTOM complete, renegotiation already requested

**Setup:**
- Deal `triage_status = 'ineligible'`
- Property `escalation_avm_status = 'completed'`
- Deal `renegotiation_status = 'requested'`

**Expected on deal page:**
- `IneligibleDealOwnerBlock` renders
- Path A shows "✓ Renegotiation request logged" confirmation (no button)
- Customer hero status shows "Revised terms being prepared" (derived from `renegotiation_requested` stage)

---

### Scenario D: Deal ineligible, ATTOM complete, manual appraisal in progress

**Setup:**
- Deal `triage_status = 'ineligible'`
- Property `escalation_avm_status = 'completed'`, `manual_appraisal_status = 'in_progress'`

**Expected on deal page:**
- `IneligibleDealOwnerBlock` renders
- Path B shows "Valuation challenge in progress" copy (no link)

---

## Deal page — buyer view

### Scenario E: Deal ineligible, ATTOM not started (buyer)

**Setup:** same as Scenario A

**Expected:**
- `AttomRequiredDealBuyerBlock` renders
- Copy explains enhanced valuation is being arranged; no action required from buyer

---

### Scenario F: Deal ineligible, ATTOM complete, renegotiation not requested (buyer)

**Setup:** same as Scenario B

**Expected:**
- `IneligibleDealBuyerBlock` renders (no renegotiation text)

---

### Scenario G: Deal ineligible, renegotiation requested (buyer)

**Setup:**
- `canonicalResult.stage === 'renegotiation_requested'`

**Expected:**
- Buyer does NOT see `IneligibleDealBuyerBlock` (filtered by `stage !== 'renegotiation_requested'`)
- Buyer does NOT see `AttomRequiredDealBuyerBlock` (filtered by `stage !== 'attom_required'`)
- Customer hero card renders "Revised terms being prepared"

---

## Property page — valuation sections

### Scenario H: Live ineligible deal, ATTOM not yet started

**Setup:**
- Linked deal `triage_status = 'ineligible'`
- Property `escalation_avm_status = null`
- Computed `liveIneligiblePhase = 'attom_required'`

**Expected:**
- `PropertyValuationSections` renders (triggered by `liveIneligiblePhase !== null` even without rentcastFmv)
- ATTOM section renders with "Required next step for your active deal" policy banner
- `IneligibleGuidanceBlock` renders with `attom_required` copy — directs to request ATTOM; no renegotiation offered
- Manual appraisal section renders with proactive-ordering note and "Initiate appraisal challenge" button available (not blocked by ATTOM gate)

---

### Scenario I: Live ineligible deal, ATTOM complete

**Setup:**
- Linked deal `triage_status = 'ineligible'`
- Property `escalation_avm_status = 'completed'`
- Computed `liveIneligiblePhase = 'void_renegotiable'`

**Expected:**
- ATTOM section shows "Complete" badge and verified FMV; no policy banner
- `IneligibleGuidanceBlock` renders with `void_renegotiable` copy — offers renegotiate and appraisal challenge paths
- Manual appraisal section shows ATTOM-complete copy with challenge available

---

### Scenario J: No live ineligible deal (proactive context)

**Setup:**
- Linked deal `triage_status` is not `'ineligible'` (or no linked deal)
- Computed `liveIneligiblePhase = null`

**Expected:**
- `IneligibleGuidanceBlock` does NOT render
- ATTOM section renders normally (no policy banner) when rentcastFmv or ATTOM activity exists
- Manual appraisal shows generic copy without ATTOM-first note

---

## Proactive ordering of manual appraisal (API)

### Scenario K: Owner requests manual appraisal before ATTOM

**Request:** `POST /api/me/properties/{propertyId}/initiate-manual-appraisal`

**Pre-conditions:**
- Property owned by authenticated user
- `manual_appraisal_status = null`
- `escalation_avm_status = null` (ATTOM not started)

**Expected response:** `{ ok: true, status: "available", alreadyInitiated: false }`
- `manual_appraisal_status` updated to `"available"` in DB
- Audit entry written with `actor_type = "owner"`
- No 4xx error about ATTOM not being complete

---

### Scenario L: Idempotent re-request

**Pre-conditions:** `manual_appraisal_status = 'available'` (already set)

**Expected:** `{ ok: true, alreadyInitiated: true, status: "available" }` — no duplicate write

---

## Admin control tower

### Scenario M: Admin views deal in `attom_required` stage

**Expected on admin deal page:**
- Stage badge: "ATTOM enhanced valuation required — renegotiation blocked"
- Blocker: "Deal is ineligible under RentCast basis — ATTOM enhanced valuation must complete before renegotiation is unlocked"
- Next action: "Trigger ATTOM enhanced valuation via the escalation simulation panel on the property review page..."
- Owning surface: `property_review`

---

### Scenario N: Admin views deal in `deal_terms_ineligible` stage

**Expected on admin deal page:**
- Stage badge: "Deal void — terms ineligible under ATTOM-verified FMV"
- Blocker: "Deal is void under the ATTOM-verified FMV — owner must renegotiate terms or commission a manual appraisal"
- Next action: references revised terms within eligible LTV band
- Owning surface: `deal_review`

---

## Exception banner matrix

| Stage | `isExceptionState` | `exceptionLabel` |
|---|---|---|
| `attom_required` | true | "Enhanced valuation required" |
| `deal_terms_ineligible` | true | "Revised terms required" |
| `closing_issue_found` | true | "Issue found during closing review" |
| `renegotiation_requested` | false | null (blue hero card renders instead) |
| any other | false | null |

Verify: when `isExceptionState = true`, the amber callout card renders above all other content.
When `isExceptionState = false` but `customerHeroLabel` is set (renegotiation_requested),
the blue hero card renders instead.
