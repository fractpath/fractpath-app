# APP-007 — Email notifications, payment receipts, and reminders (MVP, compliance-safe)

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 5 (implementation)

## Objective
Implement a minimal, reliable transactional email layer so users and FractPath ops are informed when key events occur:

- deal invitations sent/accepted
- deal status changes (admin-controlled)
- documents uploaded (link-only)
- payments requested (`DUE`) and confirmed (`PAID` via Stripe webhook)
- manual reminders for next steps (admin-triggered)

This increases trust and reduces ops load without adding in-app messaging.

---

## Non-goals
- No SMS
- No in-app chat
- No marketing drip campaigns (HubSpot owns)
- No complex scheduling engine
- No PDF attachments (link-only)

---

## Preconditions
- APP-003 deals + invites exist
- APP-004 documents exist
- APP-005 ledger exists
- APP-006 Stripe webhook updates ledger
- Domain email sending configured (provider chosen)

---

## Provider Recommendation (Default)
Default: **AWS SES** (because it is already configured for FractPath).

If later switching to Resend/Postmark, do so behind the same abstraction.
This ticket must not hardcode provider calls outside a single wrapper.

---

## A) Email Sending Abstraction (Single Wrapper)

Create:
`src/lib/email.ts`

Exports:
- `sendEmail({ to, subject, html, text, tags })`

Rules:
- Provider selection is controlled by env vars
- No direct provider calls from business logic files
- Dev safety:
  - if provider not configured, log the email payload to console and return a stub result (do not throw)

---

## B) Email Templates (Minimal Set)

Create template functions:
`src/emails/*`

Required templates:

### 1) Deal Invite
Trigger: `INVITE_SENT` (APP-003)
To: `invited_email`

Includes:
- “You’ve been invited to a FractPath deal”
- CTA button: “View invite”
- plain URL fallback
- safety line: “You’ll need to sign in to access details.”

### 2) Invite Accepted
Trigger: `INVITE_ACCEPTED`
To: deal initiator + OPS email (MVP)

Includes:
- who accepted
- deal link

### 3) Document Uploaded
Trigger: `DOCUMENT_UPLOADED`
To:
- OPS email always
- parties only if doc visibility allows AND deal is CONNECTED

Includes:
- doc type
- deal link
- “View document in secure portal”

### 4) Payment Requested (`DUE`)
Trigger: `LEDGER_ENTRY_STATUS_CHANGED` → `DUE`
To: payer email

Includes:
- itemized description
- amount
- CTA: “Pay now”
- link to deal payments tab

### 5) Payment Receipt (`PAID`)
Trigger: Stripe webhook confirms payment and ledger updated to `PAID`
To:
- payer email
- OPS email

Includes:
- receipt-like summary (not a tax receipt)
- amount
- what it was for
- date/time
- deal link

### 6) Next Step Reminder (Manual-First)
Trigger: admin clicks “Send reminder” (Option A)

To: relevant user(s)

Includes:
- 1–2 next steps
- CTA: “View your deal”

---

## C) Trigger Points (Event-Driven, Idempotent)

Emails should trigger from **events**, not ad-hoc scattered calls.

Required trigger mapping:
- `INVITE_SENT` → Deal Invite
- `INVITE_ACCEPTED` → Invite Accepted
- `DOCUMENT_UPLOADED` → Document Uploaded
- `LEDGER_ENTRY_STATUS_CHANGED` to `DUE` → Payment Requested
- `LEDGER_ENTRY_STATUS_CHANGED` to `PAID` (from webhook) → Payment Receipt

### Email send logging (Required)
All email sends must create a `deal_event`:
- `EMAIL_SENT`

Payload includes:
- template name
- to
- subject
- provider name
- provider message id (if available)
- idempotency key

### Idempotency rule (Hard)
- A given event + recipient + template must send at most once.
- Webhook replays must not cause duplicate emails.

---

## D) Ops Email Address + Environment Variables

Add to `.env.example`:
```env
OPS_EMAIL=alex.hachey@gmail.com
EMAIL_PROVIDER=ses   # ses | resend | postmark | console
EMAIL_FROM=notifications@fractpath.com

# SES (if using SES)
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Resend (optional)
RESEND_API_KEY=


Notes:

EMAIL_FROM must be a verified sender domain

Use existing DKIM configuration for fractpath.com if available

E) Reminder Strategy (MVP-Safe Default)

Default to Option A (admin-triggered reminders).

Add admin control in deal workspace:

“Send reminder”

opens a small modal:

recipients

1–2 checkbox next steps (or short text)

send

No scheduled scanning in MVP.

F) Compliance-Safe Wording (Hard Rules)

All templates must:

avoid financial promises

refer to “illustrative scenario” / “terms summary” where appropriate

never attach documents (link-only)

include footer:

“If you didn’t request this, you can ignore this email.”

Acceptance Criteria (Definition of Done)

Email wrapper exists and provider configured via env vars

Deal invite email sends on invite creation

Payment requested email sends when ledger entry becomes DUE

Payment receipt email sends when Stripe webhook marks entry PAID

Document upload emails send correctly (OPS always; parties only when allowed)

Reminder send works (admin-triggered)

All sends create EMAIL_SENT events with idempotency keys

Dev works without provider (console fallback)

No secrets committed; Vercel build passes

QA Checklist

Invite email link works and requires login

Payment receipt does not imply returns or tax deductibility

Webhook replay does not duplicate emails

OPS_EMAIL receives copies of key events

In dev without provider, emails are logged not thrown

Deliverables

Email provider abstraction (src/lib/email.ts)

Templates (src/emails/*)

Event-driven trigger wiring

Admin “Send reminder” control (Option A)

Email send logging into deal_events
