alternatives)
Ticket ID

APP-013

Title

Automated valuation inputs (AVM) with manual override and audit trail

Objective

Introduce automated property valuation inputs to improve realism and engagement in dashboards and scenarios—while preserving:

clear disclaimers

manual override control

auditable history of value changes

a clean upgrade path to better data sources

This is not about precision pricing; it’s about directional confidence.

Non-goals

No appraisal replacement

No underwriting decisions

No binding valuation for contracts

No real-time streaming prices

No secondary market pricing

Preconditions

APP-011 analytics + equity tracking exists

Accepted terms reference a starting value (SV)

Deal workspace + audit logging exists

Admin role exists

You’re operating U.S.-only

Core Design Principles

AVM is an input, not truth

All valuation changes are logged

Users see source + timestamp

Manual override always possible

Valuation affects analytics, not legal terms unless accepted

Implementation Requirements
A) Valuation source strategy (tiered)

Implement a pluggable valuation source model with this priority order:

Manual Appraisal (uploaded document) — highest authority

Manual Admin Override — medium authority

Automated AVM — lowest authority

Modeled Appreciation — fallback

Represent this explicitly in the UI.

B) Valuation data model

Create property_valuations table/model:

Fields:

id (uuid)

deal_id

source (enum: APPRAISAL | ADMIN_OVERRIDE | AVM | MODELED)

provider (e.g., ZILLOW, ATTOM, ESTATED, MANUAL)

value_cents

effective_date

confidence_score (nullable)

notes (short text)

created_by_user_id (nullable for system)

created_at

Rules:

Append-only (no edits)

“Current value” = most recent by authority rank, then date

C) Provider options (recommended MVP order)
Option 1 (Recommended MVP): Estated API

Pros:

Cheaper than Zillow

Clear API terms

Ownership + property metadata

Cons:

Less brand recognition

Use for:

initial AVM estimate

ownership confirmation (where possible)

Option 2: ATTOM Data

Pros:

Strong nationwide coverage

Cons:

More expensive

Enterprise-feel contracts

Option 3: Zillow

Reality check:

Zillow does not offer a public Zestimates API

Access requires partner approval and restrictive terms

Use only if partnership approved

Default MVP recommendation:
➡️ Implement Estated first, abstract the provider.

D) AVM fetch workflow (manual-triggered MVP)

For MVP, do not auto-refresh.

Admin action:

“Fetch AVM value”

Flow:

Admin clicks fetch

System calls provider API with:

address

city/state/zip

Store result as AVM valuation

Log deal_event:

VALUATION_FETCHED

include provider + value

Show:

Value

Source

Date fetched

E) Manual override workflow (admin-only)

Admin action:

“Set manual value”

Use cases:

correcting bad AVM

aligning with known appraisal pending

stabilizing analytics during negotiation

On save:

create ADMIN_OVERRIDE valuation record

require a short reason

log VALUATION_OVERRIDDEN event

F) Dashboard integration (APP-011)

Update Analytics tab to:

Display Current Estimated Value

show source badge:

Appraisal

AVM (Estated)

Admin override

Modeled

show timestamp

Add microcopy:

“Estimates are for illustration only. Final value determined by appraisal or market event.”

Ensure:

Exit scenarios use current estimated value

FMV is consistent across early/standard/late (timing affects payout only)

G) Term integrity rules

Critical rule:

Changing valuation does not change accepted terms automatically

If a valuation change would materially affect:

equity %

payout expectations

Then:

show a banner:

“Valuation updated. Accepted terms remain unchanged unless re-proposed.”

This protects against silent repricing.

H) Partner-facing clarity (email + packet)

If a contract packet exists:

Include valuation source in packet summary

Example:

“Current estimated value based on Estated AVM as of {date}. Appraisal to govern.”

Acceptance Criteria (Definition of Done)

Valuation model exists and is append-only

Admin can fetch AVM and set manual override

Source + timestamp visible in dashboard

Analytics use current estimated value correctly

Valuation updates do not mutate accepted terms

All valuation actions logged as deal events

AVM provider abstracted (not hardcoded)

QA Checklist

 Bad AVM data does not overwrite appraisal

 Manual override requires reason

 AVM fetch failures handled gracefully

 Users clearly see valuation source

 Exit scenario math unchanged except FMV input

Deliverables

property_valuations table/model

AVM provider adapter (Estated recommended)

Admin fetch + override UI

Analytics integration updates

Event logging for valuation changes
