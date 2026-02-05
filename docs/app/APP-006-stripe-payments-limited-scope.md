# TICKET APP-006 — Stripe payments (limited-scope, ledger-first)

## Ticket ID

APP-006

## Title

Stripe payments integration (limited scope): pay links + ledger reconciliation

## Objective

Enable FractPath to **collect payments** for a small set of fee types using Stripe, while keeping the ledger as the source of truth.

This ticket adds:

* Stripe Checkout for selected ledger entries
* webhook-based payment confirmation
* automatic ledger updates (DUE → PAID)
* audit logging of payment events

The goal is to start monetizing with minimal complexity and minimal compliance exposure.

---

## Non-goals

* No escrow
* No ACH/bank account linking (unless Stripe makes it trivial later)
* No subscriptions (servicing stays manual-first)
* No payout automation to realtors/partners (record only)
* No invoice system beyond Checkout links

---

## Preconditions

* APP-005 complete (ledger_entries exists; Payments tab exists)
* Admin can create ledger entries and mark due/paid
* Deal events audit log exists
* You have a Stripe account

---

## Core Principles

1. **Ledger drives Stripe**, not the other way around
2. **One Stripe checkout session per payable ledger entry**
3. **Webhook is the only source of payment truth** (not client success redirects)
4. **No sensitive card data touches your system** (Stripe-hosted Checkout)

---

## Implementation Requirements

### A) Stripe account + environment setup

Add environment variables:

In `.env.example`:

```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_CHECKOUT_SUCCESS_URL=https://app.fractpath.com/deals/{DEAL_ID}?payment=success
STRIPE_CHECKOUT_CANCEL_URL=https://app.fractpath.com/deals/{DEAL_ID}?payment=cancel
```

In Vercel (app project env vars):

* `STRIPE_SECRET_KEY`
* `STRIPE_WEBHOOK_SECRET`
* `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

> Success/cancel URLs can be templated in code using deal_id.

---

### B) Stripe product strategy (MVP)

Do **not** create a Stripe Product for every fee type. Use **Checkout Sessions with line items** created dynamically.

Minimum metadata to include on each Checkout Session:

* `ledger_entry_id`
* `deal_id`
* `payer_role`
* `entry_type`

This enables reconciliation in webhooks.

---

### C) Eligible fee types (limited scope)

Only allow Stripe payment for these entry types initially:

* `OUTREACH_FEE`
* `PLATFORM_FEE_UPFRONT`

Optional (if easy):

* `TITLE_FEE` / `APPRAISAL_FEE` when payable to FractPath first (then you pay partner manually)

Explicitly exclude for now:

* `EXIT_FEE` (happens later at exit event; can be Stripe later)
* `SERVICING_FEE_MONTHLY` (don’t do subscriptions yet)

---

### D) UI changes: “Pay now” on ledger entries

On `/deals/[id]` → Payments tab:

For participants:

* For any ledger entry where they are payer and status is `DUE`:

  * show **Pay now** button
  * clicking triggers creation of a Stripe Checkout session and redirects

For admins:

* ability to mark an entry as “Collect via Stripe” which sets status to `DUE` (if currently PLANNED)
* view Stripe session links and payment status

---

### E) API route: Create Checkout Session

Create route:
`/api/payments/checkout`

Method: POST
Body:

* `ledger_entry_id`

Server verifies:

* authenticated user
* user is the payer for that ledger entry (or admin)
* ledger entry status is `DUE`
* entry type is eligible
* amount is > 0

Then create Stripe Checkout Session:

* mode: `payment`
* line item: description + amount_cents
* success_url / cancel_url include deal_id
* set `metadata` with identifiers

Return:

* `url` to redirect client

---

### F) Webhook route: Stripe → ledger reconciliation

Create route:
`/api/payments/webhook` (raw body handling required)

Listen for at least:

* `checkout.session.completed`
* optionally `payment_intent.succeeded`

On webhook event:

1. Extract `ledger_entry_id` from metadata
2. Fetch ledger entry
3. Validate amount matches (defensive)
4. Mark ledger entry as:

   * `status=PAID`
   * `paid_at=now`
   * `external_ref=stripe_payment_intent_id` (or checkout session id)
5. Create a `deal_event`:

   * `LEDGER_ENTRY_STATUS_CHANGED`
   * payload includes event id, amount, stripe refs

Idempotency:

* If webhook replays, do not double-apply
* If entry already PAID with same external_ref → no-op
* If mismatch → log error event and do not mark PAID

---

### G) Security and compliance posture (must implement)

* Webhook endpoint verifies Stripe signature with `STRIPE_WEBHOOK_SECRET`
* No client-side “paid” toggles
* No storage of card data
* Limit payment routes to authenticated users

---

## Acceptance Criteria (Definition of Done)

1. Eligible ledger entry can be marked DUE and paid via Stripe Checkout
2. After successful payment, webhook marks ledger entry PAID automatically
3. Deal events reflect the payment confirmation
4. Payments tab shows correct status without manual intervention
5. Unauthorized users cannot create sessions for other users’ entries
6. Webhook is verified and idempotent
7. Vercel deploy passes

---

## QA Checklist

* [ ] Pay now works for buyer/homeowner as payer
* [ ] Cancel path returns user safely without marking paid
* [ ] Webhook replay does not duplicate updates
* [ ] Amount mismatch is handled safely
* [ ] Stripe metadata contains ledger_entry_id + deal_id
* [ ] No secrets exposed client-side

---

## Deliverables

* Stripe env var setup documented
* `/api/payments/checkout` route
* `/api/payments/webhook` route
* Payments tab updates for Pay now
* Ledger reconciliation + audit events

