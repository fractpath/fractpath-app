# APP-008 — Negotiation workspace (counter-offers + snapshot branching)

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 5 (implementation)

## Objective
Create a **structured, snapshot-driven negotiation experience** inside the Deal Workspace so Buyer and Homeowner can:

- propose terms using a guided, non-legalese form
- review a clean, human-readable **Terms Sheet Summary**
- counter-offer with **controlled, explicit changes**
- preserve a complete, immutable version history
- reach an **agreed terms** state that feeds pre-contract execution later

This is a core FractPath differentiator: **term shaping without contract churn**.

---

## Non-Goals
- No e-signature
- No PDF generation
- No payment automation
- No in-app chat or messaging
- No secondary investor participation (placeholders only)

---

## Preconditions
- APP-002 — Calculator snapshot persistence + versioning
- APP-003 — Deal workspace + participants
- APP-004 — Document scaffolding exists
- Deal status includes `TERMS_SHAPING` / `PRE_CONTRACT`
- Admin role exists

---

## Core Design Principles (Locked)
1) **Immutable versions**
   - every proposal or counter creates a new version
2) **Small surface area**
   - only a defined set of term fields are editable
3) **Human-readable first**
   - users interact with summaries, not raw schemas
4) **Controlled acceptance**
   - acceptance locks a version; no silent edits
5) **Snapshot alignment**
   - negotiated terms reference calculator snapshots where applicable
6) **No leakage**
   - contact info and sensitive details remain gated per APP-003

---

## A) Canonical Terms Object (Schema)

Create a canonical terms schema used **only for negotiation**, distinct from
calculator snapshots.

File:
`src/lib/termsSchema.ts`

### Minimum MVP Fields

#### Property
- `property_value_basis` (`appraisal | avm | manual`)
- `starting_value_sv` (number)
- `appreciation_assumption_g` (number)

#### Funding
- `upfront_amount` (number)
- `monthly_amount` (number)
- `monthly_count` (number)

#### Equity Mechanics
- `equity_vests_immediately` (boolean; default true)
- `equity_pricing_method` (enum; MVP: `percent_of_fmv_per_payment`)

#### Settlement / Timing
- `cpw_start_year`
- `cpw_end_year`
- `tf_early`
- `tf_late`
- `floor_multiplier_fm`
- `ceiling_multiplier_cm`

#### Fees (Display-only in MVP)
- `platform_fee_upfront`
- `servicing_fee_monthly`
- `exit_fee_pct`

#### Realtor (Optional)
- `realtor_referral_flat`
- `realtor_share_platform`
- `realtor_share_servicing`
- `realtor_share_exit`

#### Notes
- `special_terms_notes` (short text)

**Rules**
- Fields are optional at schema level
- UI enforces required fields for a valid proposal
- Schema changes require versioning discipline (WGT-050)

---

## B) Terms Versioning Model (Deal-Scoped)

Create `deal_term_versions` table/model.

### Fields
- `id` (uuid)
- `deal_id`
- `version` (int, starts at 1)
- `status` (`DRAFT | PROPOSED | COUNTERED | ACCEPTED | SUPERSEDED`)
- `proposed_by_user_id`
- `proposed_by_role`
- `terms_json` (canonical terms schema)
- `computed_json` (derived scenario outputs)
- `summary_markdown` (human-readable)
- `message` (short rationale text)
- `created_at`
- `parent_version_id` (nullable)

### Immutability Rules
- No updates after insert
- Counter = new row with `parent_version_id`
- Version increments monotonically per deal

---

## C) Negotiation UI (Deal Workspace)

Add a **Terms** tab to `/deals/[id]`.

### Terms Tab Contents
- **Current Terms Card**
  - latest `deal_term_versions` entry
  - key terms + computed highlights
  - floors / caps / timing notes
  - Early / Standard / Late outcomes
- **Version History**
  - link to full history view

### Role-Gated Actions
- Buyer / Homeowner (when `TERMS_SHAPING`):
  - `Propose terms` (if none exist)
  - `Counter-offer` (if version exists)
  - `Accept` (only if last version proposed by the other party)
- Admin:
  - may propose/counter on behalf of parties (optional)
  - may advance deal status

---

## D) Guided Propose / Counter Form (No Legalese)

Route:
`/deals/[id]/terms/new`

### Form Requirements
- Grouped sections matching schema
- Simple sliders / inputs where possible
- Inline explanations (microcopy)
- “Review summary” step before submit

### On Submit
- Create new `deal_term_versions` row
- Status:
  - first version → `PROPOSED`
  - counter → `COUNTERED`
- Log `deal_event`: `TERMS_VERSION_CREATED`
- Optional email notification hook (APP-007)

---

## E) Acceptance Flow (Safe, Admin-Gated)

### Default MVP (Recommended)
When a party clicks **Accept**:
1) Confirm modal:
   - “You’re accepting version X”
   - “This locks terms for pre-contract steps”
2) On confirm:
   - mark version as `ACCEPTED_PENDING_ADMIN`
   - log `deal_event`: `TERMS_ACCEPTED`
3) Admin reviews and confirms:
   - mark version `ACCEPTED`
   - mark prior versions `SUPERSEDED`
   - transition deal status → `PRE_CONTRACT`

This avoids accidental lock-in.

---

## F) Human-Readable Term Sheet Summary

Auto-generate `summary_markdown` for every version.

Must include:
- **At a glance** (SV, upfront, monthly, horizon)
- Settlement window + incentive explanation
- Floors / caps explanation
- Early / Standard / Late outcome table
- Fees itemization (if present)

This summary is the future source for:
- contract templates
- PDFs
- title partner handoff briefs

---

## G) Computation Integration (Derived, Stored)

On version creation:
- Compute and store in `computed_json`:
  - vested equity over time
  - paid-to-date amounts
  - FMV at Early / Standard / Late
  - floor / cap bounds
  - settlement outcomes per scenario

Rules:
- Reuse calculator library logic where possible
- Store outputs at creation time
- Never recompute silently later

---

## H) Version History View

Route:
`/deals/[id]/terms/history`

Display:
- version timeline (v1 → v2 → v3)
- proposer + role
- timestamp
- status badge
- expandable summary

Old versions are **read-only forever**.

---

## Acceptance Criteria (Definition of Done)
- Deal has a Terms tab
- Buyer/Homeowner can propose and counter via guided form
- Each proposal creates a new immutable version
- Version history is visible
- Acceptance flow locks a version (admin-confirmed)
- Computed scenario outputs are stored per version
- No silent mutation of terms
- Deal events record all key actions
- UX feels like “term shaping,” not contract review

---

## QA Checklist
- Counter-offer increments version and links parent
- User cannot accept their own proposal
- Accepted version cannot be edited
- Deal cannot move to PRE_CONTRACT without acceptance
- Summary text is readable and consistent
- Mobile UX works (modals usable)

---

## Deliverables
- `termsSchema.ts`
- `deal_term_versions` model
- Terms tab UI + form + history view
- Safe acceptance flow
- Computed output storage
- Deal events logging for negotiation
