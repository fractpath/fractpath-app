TICKET APP-008 — Negotiation UI (counter-offer forms + versioned term snapshots)
Ticket ID

APP-008

Title

Negotiation workspace: counter-offers, versioned term snapshots, and controlled acceptance

Objective

Create a structured, “gamified” negotiation experience inside a Deal Workspace so Buyer and Homeowner can:

propose terms using a guided form (not legalese)

see a clean human-readable term summary

counter-offer with controlled changes

keep a complete version history (no silent edits)

reach an “agreed terms” state that feeds contract execution later

This is the core UX differentiator: no long contract review for small changes.

Non-goals

No e-sign

No PDF generation

No payment automation tied to acceptance

No in-app chat (terms-only negotiation)

No secondary investor participation (leave placeholders only)

Preconditions

APP-002 scenario persistence + versioning exists

APP-003 deal workspace exists

APP-004 documents exist

APP-005 ledger exists (not used here)

Deal status includes TERMS_SHAPING / PRE_CONTRACT

Admin-only deal initiation is in place

Core Design Principles (important)

Immutable versions: every offer/counter is a new snapshot

Small surface area: only allow edits to a defined set of term fields

Human-readable first: users see a clean “Term Sheet Summary”

Controlled acceptance: acceptance locks the version and advances status

No leakage: contact info remains gated until CONNECTED (already true)

Implementation Requirements
A) Define the “Terms Object” (schema)

Create a canonical terms schema to be used everywhere.

File:
src/lib/termsSchema.ts

Represent as JSON (with types) containing:

Minimum MVP fields:

Property

property_value_basis (enum: appraisal | avm | manual)

starting_value_sv (number)

appreciation_assumption_g (number)

Funding

upfront_amount (number)

monthly_amount (number)

monthly_count (number)

Equity mechanics

equity_vests_immediately (boolean; default true)

equity_pricing_method (enum: “percent_of_fmv_per_payment” as current model)

Settlement

cpw_start_year

cpw_end_year

tf_early

tf_late

floor_multiplier_fm

ceiling_multiplier_cm

Fees (display only for now)

platform_fee_upfront (number)

servicing_fee_monthly (number)

exit_fee_pct (number)

Realtor (optional fields)

realtor_referral_flat

realtor_share_platform

realtor_share_servicing

realtor_share_exit

Notes

special_terms_notes (short text)

Rules:

All fields are optional unless required for calculation; enforce required fields in UI.

B) Terms versioning model (deal-scoped)

Create deal_term_versions table/model:

Fields:

id (uuid)

deal_id

version (int, starts at 1)

status (enum: DRAFT | PROPOSED | COUNTERED | ACCEPTED | SUPERSEDED)

proposed_by_user_id

proposed_by_role

terms_json (the canonical schema)

computed_json (calculated outputs: equity %, ISA scenarios, etc.)

summary_markdown (human-readable summary)

created_at

parent_version_id (nullable; for lineage)

message (short text: “I’m proposing X because…”)

Immutability rules:

No updates to terms_json after insert

New counter = new version row

C) Negotiation UI in Deal Workspace

Add a new tab to /deals/[id]:

Terms

It includes:

Current terms card

Shows latest deal_term_versions entry

Displays:

key terms

computed highlights

floor/cap notes

early/standard/late scenario outcomes

“Version history” link

Action buttons (role-gated)

If user is Buyer or Homeowner and deal status is TERMS_SHAPING:

“Propose terms” (if no version yet)

“Counter-offer” (if version exists)

“Accept” (if last version proposed by the other party)

Admin:

can propose/counter on behalf of parties (optional)

can move deal status if accepted

D) Guided “Propose / Counter” form (no legalese)

Create modal or page:
/deals/[id]/terms/new

Form requirements:

grouped sections matching the schema

“simple slider” feel where possible (but input fields ok for MVP)

inline explanations (microcopy)

“Review summary” step before submit

On submit:

create new deal_term_versions row with status:

if first: PROPOSED

if counter: COUNTERED

log deal_event:

TERMS_VERSION_CREATED

optional: email notification (APP-007 hooks)

E) Acceptance flow (locks the deal terms)

When a party clicks Accept:

Confirm modal:

“You’re accepting version X”

“This will lock terms for pre-contract steps”

On confirm:

mark accepted version status to ACCEPTED

mark all previous versions to SUPERSEDED (by creating admin/system events or updating statuses only if allowed)

update deal status to PRE_CONTRACT (admin-controlled if you want; MVP: allow acceptance to request admin review)

Log deal_event:

TERMS_ACCEPTED with version id

MVP safe approach (recommended):

acceptance sets:

terms_accepted_pending_admin = true

admin then clicks “Confirm acceptance” to transition to PRE_CONTRACT
This avoids parties accidentally locking terms.

Default to this safe approach unless you say otherwise.

F) Human-readable “Term Sheet Summary”

Auto-generate a readable summary (Markdown) for each version.

Include:

“At a glance” block (SV, upfront, monthly, horizon)

settlement window and incentive explanation

floors/caps explanation

a 3-scenario outcome table (Early/Standard/Late)

fees itemization (if present)

This summary is what later becomes:

contract template input

PDF source

title partner handoff brief

G) Computation integration

When a terms version is created, compute and store:

vested equity over time

IBA paid to date (based on schedule)

FMV at early/standard/late

UIA, TF, floor/cap bounds

ISA settlement per scenario

Store this in computed_json.

This should reuse your existing calculator library logic where possible.

H) Version history view

Add:
/deals/[id]/terms/history

Display:

version timeline (v1 → v2 → v3)

who proposed each

timestamp

status badge

“View summary” expand/collapse

No editing of old versions.

Acceptance Criteria (Definition of Done)

Deal has a Terms tab

Buyer/Homeowner can propose and counter-offer via guided form

Each proposal creates a new immutable version row

Version history is visible

Acceptance flow locks a version (with admin confirmation if using safe approach)

Computed scenario outputs appear in each term version

No silent mutation of terms

Deal events record every key action

UX reads like “term shaping”, not contract law

QA Checklist

 Counter-offer increments version and links parent

 User cannot accept their own proposed version

 Accepted version cannot be changed

 Deal can’t move to PRE_CONTRACT without accepted version (or pending admin confirm)

 Version summary is readable and consistent

 Mobile is usable (modal doesn’t break)

Deliverables

termsSchema.ts

deal_term_versions table/model

Deal Terms tab + form + history page

Acceptance flow (safe mode recommended)

Computed outputs generation and storage

Events logging for terms negotiation
