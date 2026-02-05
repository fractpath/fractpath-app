TICKET APP-005 — Payments (manual-first → Stripe later) + fee tracking + realtor commission hooks
Ticket ID

APP-005

Title

Payments + fee ledger (manual-first), with upgrade path to Stripe + realtor commissions

Objective

Enable FractPath to record and manage all money flows related to a deal—without processing payments in-app yet—so you can:

charge platform fees / outreach fees / servicing fees / exit fees (recorded first)

track whether parties paid (manual confirmation)

generate an auditable fee ledger

model and track realtor commission accruals and payouts

later “swap in” Stripe with minimal rework

This is the financial operating layer for your deal workflow.

Non-goals

No automated Stripe payments in MVP (that’s APP-006)

No escrow handling

No bank account linking

No secondary market investor payouts

No tax documents

Preconditions

APP-001..004 complete

Deals exist and can reach PRE_CONTRACT / CONTRACTED_MANUAL

Documents can be stored and linked

Deal events audit log exists

Admin role exists

Core Design Principles

Ledger-first: record what should happen, then mark what did happen.

No silent changes: financial records are append-only; corrections create new entries.

Party clarity: every fee is visible and itemized by payer and payee.

Upgradeable: later attach Stripe payment intents/charge IDs to existing ledger entries.

Implementation Requirements
A) Payment/Fee Ledger data model

Create a table/model: ledger_entries

Required fields:

id (uuid)

deal_id

entry_type (enum/text)

status (enum/text)

payer_role (buyer | homeowner | realtor | fractpath | partner)

payer_user_id (nullable; payer may be external initially)

payee_role (fractpath | realtor | partner | buyer | homeowner)

payee_user_id (nullable)

amount_cents (integer)

currency (default USD)

due_at (datetime, nullable)

paid_at (datetime, nullable)

description (string)

metadata_json (json; for terms, notes, etc.)

external_ref (string; e.g., Stripe charge ID later, or manual check reference)

created_at

created_by_user_id (admin/system)

Append-only rules:

Do not update amounts after creation

If correction needed: add a new entry with entry_type=ADJUSTMENT and reference prior entry in metadata

B) Ledger entry types (MVP list)

entry_type must support at least:

FractPath revenue

PLATFORM_FEE_UPFRONT

OUTREACH_FEE

SERVICING_FEE_MONTHLY

EXIT_FEE

Realtor commissions

REALTOR_REFERRAL_FLAT

REALTOR_SHARE_PLATFORM

REALTOR_SHARE_SERVICING

REALTOR_SHARE_EXIT

Partner fees (manual now)

TITLE_FEE

APPRAISAL_FEE

LEGAL_REVIEW_FEE

Ledger mechanics

ADJUSTMENT

REFUND

C) Ledger statuses

status values:

PLANNED (expected but not yet invoiced)

DUE (invoice/payment requested)

PAID (confirmed received)

WAIVED (explicitly waived; must log reason)

REFUNDED (refund issued; link to refund entry)

FAILED (attempted but not received; for future Stripe)

D) Admin UI: Deal Payments tab

Add a new tab to /deals/[id]:

Payments

This tab must show an itemized table:

Entry type

Description

Amount

Payer → Payee

Status

Due date / Paid date

External ref (optional)

Created by / created at

Admin-only actions:

Add a ledger entry (create)

Mark as PAID (requires paid_at + optional external_ref)

Mark as WAIVED (requires reason)

Add ADJUSTMENT (requires reason)

Participant view (buyer/homeowner/realtor):

Read-only list of entries where they are payer or payee

Only show entries once deal is CONNECTED

Clear totals:

“Total due”

“Total paid”

“Total waived”

E) Fee schedule templating (to reduce manual work)

Create fee_schedules (or implement as simple preset objects) to generate ledger entries based on deal configuration.

Minimum MVP behavior:

On admin action “Generate fee schedule”:

create PLATFORM_FEE_UPFRONT (if configured)

create OUTREACH_FEE (optional)

create SERVICING_FEE_MONTHLY (optional—can be generated as a single planned line item for MVP, not 12 separate entries)

create EXIT_FEE (planned; amount can be “TBD” until exit—store percentage in metadata)

Keep it simple:

Servicing can be represented as:

one entry with metadata { monthly_amount, term_months }

and you can later expand into monthly ledger lines if needed

F) Realtor commission tracking hooks (no payout automation)

Add a realtor_commission_schedule config linked to a deal:

Storage options:

As deal_participants metadata (if realtor is a participant)

Or as deal_commissions table (cleaner)

Must support:

referral flat amount

% of platform fee

% of servicing fee

% of exit fee

On “Generate fee schedule”:

automatically create PLANNED commission entries that correspond to the underlying FractPath fees:

e.g., REALTOR_SHARE_PLATFORM derived from platform fee

REALTOR_SHARE_EXIT derived from exit fee (percentage stored until exit)

commissions should be PLANNED until the underlying revenue is PAID

This ensures:

you can show “Projected commission” vs “Paid commission”

realtor dashboard later is straightforward

G) Exit event handling (fee finalization)

When a deal transitions to EXITED (admin-only for MVP):

require entry of:

FMV at exit

buyer settlement amount (ISA) (from your scenario terms or manual)

closing costs estimate

generate/finalize:

EXIT_FEE amount (from ExitFeePct * settlement or FMV—choose one consistent rule and store rule in metadata)

REALTOR_SHARE_EXIT (based on exit fee)

partner fees if applicable

Log DEAL_EXIT_RECORDED event with summary in payload.

H) Compliance & audit requirements

Every ledger entry creation and status change must log a deal_event:

LEDGER_ENTRY_CREATED

LEDGER_ENTRY_STATUS_CHANGED

Payload includes:

entry_id

entry_type

old_status/new_status

amount_cents

reason (for waive/adjust)

No deletions.

Acceptance Criteria (Definition of Done)

Ledger model exists and is append-only by behavior

Deal workspace has a Payments tab

Admin can create entries and mark paid/waived/adjusted with reasons

Participants can see their relevant entries read-only

Fee schedule generator creates baseline entries reliably

Realtor commission entries can be configured and generated (PLANNED)

Exit flow can finalize exit-related fees and commissions

Audit events are written for ledger changes

No sensitive payment info stored (no bank acct, no card data)

QA Checklist

 Amounts store as integer cents, not floats

 Users can’t see other deals’ ledger entries

 Waive requires reason and logs event

 Adjustment links to original entry via metadata

 Exit finalization generates correct derived entries

 Mobile view is readable (even if not perfect)

Deliverables

ledger_entries table/model

(optional) deal_commissions table/model or metadata strategy documented

Payments tab UI with admin controls + participant read-only

Fee schedule generator action

Exit finalization admin action

Audit events logged for ledger mutations
