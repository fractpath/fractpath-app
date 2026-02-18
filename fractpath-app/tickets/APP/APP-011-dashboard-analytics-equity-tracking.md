# APP-011 — Dashboard analytics + value tracking (snapshot-driven, read-only)

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 5 (implementation)

## Objective
Provide Buyer, Homeowner, Realtor, and FractPath Admin with **clear, confidence-building analytics**
that explain *what’s happened so far* and *what different exits would look like today*—without
introducing new math or editable assumptions.

The dashboard must answer:
- how equity has accumulated over time
- how today’s estimated value compares to accepted terms
- what Early / Standard / Late exit would look like **as of today**
- how platform fees and commissions accrue (read-only)

This view reinforces long-term value and reduces “what happens next?” anxiety.

---

## Non-Goals
- No real-time market feeds (AVM/Zillow later)
- No new forecasting logic beyond existing calculator + terms logic
- No editable assumptions (read-only for MVP)
- No benchmarking vs other assets
- No investor marketplace analytics

---

## Preconditions
- APP-002 — Calculator snapshot persistence + versioning
- APP-008 — Accepted terms exist for some deals
- APP-005 — Ledger exists (fees, servicing, commissions)
- Deal status is at least `PRE_CONTRACT` or `ACTIVE`
  - earlier statuses may show a limited analytics view

---

## Core Design Principles (Locked)
1) **Read-only, snapshot-driven**
   - analytics render from accepted terms + stored snapshots
2) **No surprise math**
   - show assumptions alongside outputs
3) **Explain variance**
   - time, payments, appreciation, fees
4) **Persona-aware framing**
   - same numbers, different emphasis

---

## A) Analytics Data Inputs (Single Source of Truth)

Analytics must derive **only** from:
- accepted `deal_term_versions` (APP-008)
- calculator snapshot data (APP-002)
- `ledger_entries` (paid + scheduled)
- elapsed time since deal start

Rules:
- No new formulas introduced here
- Reuse existing calculator / terms computation logic
- Never recompute historical snapshots

---

## B) Dashboard Location

Add an **Analytics** tab to:
`/deals/[id]`

This tab is read-only for all roles.

---

## C) Analytics Sections (Required)

### 1) Equity Over Time (Primary Visual)
**Purpose:** show ownership evolution clearly.

Chart:
- X-axis: time (months or years since start)
- Y-axis: equity %
- Series:
  - Buyer equity
  - Homeowner remaining equity

Data sources:
- upfront equity (if any)
- installment-accrued equity
- current vested equity

Annotations:
- “You are here” (today)
- CPW start / CPW end markers

Hard rules:
- Buyer + Homeowner equity must always sum to 100%
- No equity may exceed 100%

---

### 2) Value Snapshot — *Today*
**Purpose:** orient the user to “where things stand right now.”

Cards:
- Current estimated FMV
  - derived from starting value + agreed appreciation assumption
- Buyer vested equity %
- Buyer implied equity value
- Homeowner remaining equity value

Microcopy:
> “Values shown are estimates based on agreed assumptions.  
> Final value is determined at settlement.”

---

### 3) Exit Scenario Comparison — *As of Today*
**Purpose:** clarify optionality without changing FMV.

Table:

| Scenario | Buyer Payout | Homeowner Net | Notes |
|--------|--------------|---------------|------|
| Early  | $            | $             | Discount applied |
| Standard | $          | $             | Base terms |
| Late   | $            | $             | Premium applied |

Rules:
- FMV is identical across scenarios (same “today” value)
- Timing Factor (TF) affects payout, **not property value**
- Floors / ceilings must be visibly applied (badges + microcopy)

---

### 4) Fees & Commissions (Read-Only)
**Purpose:** transparency without friction.

Show:
- Platform fees paid to date
- Servicing fees accrued
- Exit fees (planned)
- Realtor commissions:
  - earned to date
  - projected at exit

Realtor emphasis:
- “Your projected total commission”

---

### 5) Lifecycle Indicators
Small, confidence-building indicators:
- Deal age
- Time until CPW start / end
- Last activity timestamp
- Next expected milestone

---

## D) Persona-Specific Emphasis (Same Numbers, Different Framing)

### Buyer
Emphasize:
- equity gained over time
- implied purchase price vs FMV
- long-term ownership path

De-emphasize:
- operational fees not paid by buyer

### Homeowner
Emphasize:
- cash received to date
- remaining equity
- net proceeds at exit

De-emphasize:
- buyer upside framing

### Realtor
Emphasize:
- commission timeline
- deals in progress
- total projected earnings

### Admin
- full visibility (no suppression)

---

## E) “What Changed?” Explanations
When values differ from last view:
- show subtle, inline explanations:
  - “Equity increased due to monthly contribution.”
  - “Estimated value increased due to time-based appreciation.”

No notifications required yet—clarity only.

---

## F) Export / Sharing (MVP-Lite)
Do **not** implement export yet.

Instead show:
> “Exporting and reports will be available in a future update.”

---

## Acceptance Criteria (Definition of Done)
- Analytics tab renders in Deal Workspace
- Equity-over-time chart renders correctly
- Value snapshot reflects accepted terms + elapsed time
- Exit scenario table applies TF without changing FMV
- Fees and commissions aggregate correctly from ledger
- Persona-specific emphasis is clear
- No editable fields exposed
- Mobile view remains readable

---

## QA Checklist
- Equity % never exceeds 100%
- Buyer + Homeowner equity always sum to 100%
- FMV consistent across exit scenarios
- Floors / caps visibly applied when binding
- No NaN / undefined values when deal is early-stage
- Charts update correctly as time advances

---

## Deliverables
- Analytics tab UI
- Equity-over-time chart component
- Exit scenario comparison table
- Fees & commission summary components
- Persona-aware copy variants
