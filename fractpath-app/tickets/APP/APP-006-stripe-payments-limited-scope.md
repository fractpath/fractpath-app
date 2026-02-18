# APP-006 — Stripe payments (limited-scope, ledger-first)

## Ticket ID
APP-006

## Title
Stripe payments integration (limited scope): Checkout links + ledger reconciliation

## Objective
Enable FractPath to **collect payments** for a small set of fee types using Stripe, while keeping the **ledger_entries**
table as the source of truth.

This ticket adds:
- Stripe Checkout for selected payable ledger entries
- webhook-based payment confirmation
- automatic ledger updates (`DUE` → `PAID`)
- audit logging of payment events

Goal: start monetizing with minimal complexity and minimal compliance exposure.

---

## Non-goals
- No escrow
- No ACH/bank account linking (unless trivial later)
- No subscriptions (servicing stays manual-first)
- No payout automation to realtors/partners (record only)
- No invoicing system beyond Checkout links
- No client-side “payment confirmed” trust

---

## Preconditions
- APP-005 complete (ledger_entries exists; Payments tab exists)
- Admin can create ledger entries and mark them `DUE`
- Deal events audit log exists
- Stripe account exists

---

## Core Principles (Locked)
1) **Ledger drives Stripe**, not the other way around
2) **One Checkout Session per payable ledger entry**
3) **Webhook is the source of payment truth** (never client success redirects)
4) **No sensitive card data touches FractPath** (Stripe-hosted Checkout)
5) **Idempotent reconciliation** (webhook replays must be safe)

---

## Implementation Requirements

### A) Stripe environment setup
Add environment variables.

In `.env.example`:
```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_CHECKOUT_SUCCESS_URL=https://app.fractpath.com/deals/{DEAL_ID}?payment=success
STRIPE_CHECKOUT_CANCEL_URL=https://app.fractpath.com/deals/{DEAL_ID}?payment=cancel
In Vercel (app project env vars):

STRIPE_SECRET_KEY

STRIPE_WEBHOOK_SECRET

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

Implementation note:

success/cancel URLs should be templated with deal_id in code.

B) Stripe product strategy (MVP)
Do not create Stripe Products for each fee type.
Use Checkout Sessions with dynamic line items.

Checkout Session metadata must include:

ledger_entry_id

deal_id

payer_role

entry_type

This enables deterministic reconciliation in webhook handlers.

C) Eligible fee types (limited scope)
Allow Stripe payment only for:

OUTREACH_FEE

PLATFORM_FEE_UPFRONT

Optional (only if payable to FractPath first):

TITLE_FEE

APPRAISAL_FEE

Explicitly exclude for now:

EXIT_FEE

SERVICING_FEE_MONTHLY (no subscriptions yet)

D) UI changes: “Pay now” on ledger entries
On /deals/[id] → Payments tab:

Participants:

For any ledger entry where:

they are the payer, AND

status is DUE, AND

entry type is eligible

Show Pay now button

Clicking creates a Checkout Session and redirects

Admins:

Add a control to mark an entry as Collect via Stripe

sets status from PLANNED → DUE

Show Stripe reconciliation details once paid:

external_ref

paid_at

E) API route: Create Checkout Session
Create route:

POST /api/payments/checkout

Request body:

ledger_entry_id

Server must verify:

authenticated user

caller is the payer for that ledger entry OR is admin

ledger entry status is DUE

entry type is eligible

amount_cents > 0

Then create Stripe Checkout Session:

mode: payment

line item:

description

amount_cents

success_url / cancel_url include deal_id

include required metadata

Return:

{ url } to redirect client

F) Webhook route: Stripe → ledger reconciliation
Create route:

POST /api/payments/webhook

raw body handling required

Listen for:

checkout.session.completed

(optional) payment_intent.succeeded if needed

On webhook:

Verify Stripe signature using STRIPE_WEBHOOK_SECRET

Extract ledger_entry_id from metadata

Fetch ledger entry

Validate defensively:

amount matches expected amount_cents

entry is eligible and status is DUE (or already PAID)

Reconcile:

set status=PAID

set paid_at=now

set external_ref = Stripe payment_intent_id (preferred) or session id

Log deal_event:

LEDGER_ENTRY_STATUS_CHANGED

payload includes:

ledger_entry_id

entry_type

old_status/new_status

amount_cents

stripe references

Idempotency Rules
If webhook replays:

if entry already PAID with same external_ref → no-op

If mismatch (amount or identifiers):

do not mark PAID

log an error event (or server log) and return 200 to avoid retries storm (implementation choice, but must be safe)

G) Security & compliance posture (Hard Requirements)
Webhook endpoint verifies Stripe signature

No client-side “paid” toggles

No storage of card data

Payment routes require authentication

Server-side authorization checks prevent paying another user’s ledger entry

Acceptance Criteria (Definition of Done)
Eligible ledger entry can be set DUE and paid via Stripe Checkout

After successful payment, webhook marks ledger entry PAID automatically

Deal events reflect payment confirmation and status transition

Payments tab reflects status without manual intervention

Unauthorized users cannot create sessions for other users’ entries

Webhook is verified and idempotent

Vercel deploy passes

QA Checklist
Pay now works for buyer/homeowner as payer

Cancel path returns user safely without marking paid

Webhook replay does not duplicate updates

Amount mismatch handled safely (no PAID)

Stripe metadata contains ledger_entry_id + deal_id

No secrets exposed client-side

Deliverables
Stripe env var setup documented

POST /api/payments/checkout route

POST /api/payments/webhook route

Payments tab updates for Pay now

Ledger reconciliation + audit events
