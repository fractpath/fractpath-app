TICKET APP-007 — Email notifications, payment receipts, and reminders (MVP)
Ticket ID

APP-007

Title

Email notifications: invites, milestones, payment receipts, and reminders (compliance-safe)

Objective

Implement a minimal, reliable email notification layer so users and FractPath ops are always informed when key events occur:

deal invitations sent/accepted

deal status changes

documents uploaded

payments requested (DUE) and confirmed (PAID via Stripe webhook)

upcoming reminders for next steps (manual-first)

This ticket improves trust and reduces your operational load without adding in-app messaging yet.

Non-goals

No SMS (post-MVP)

No in-app chat

No marketing drip campaigns (HubSpot handles that)

No complex scheduling engine

No PDF attachments (link-only)

Preconditions

APP-003 deals + invites exist

APP-004 documents exist

APP-005 ledger exists

APP-006 Stripe webhook updates ledger

You have domain email sending configured (recommended: Postmark, Resend, or SES)

Recommended provider (default)

Use Postmark or Resend for transactional emails.

Default recommendation: Resend

simple API

easy templates

good DX for Next.js

If you already have AWS SES configured (you do), SES can work too—but Resend/Postmark is generally easier for solo founders.

Implementation Requirements
A) Email sending abstraction (single wrapper)

Create:

src/lib/email.ts

Exports:

sendEmail({ to, subject, html, text, tags })

Provider selection behind env vars

No direct provider calls from business logic files

If provider not configured in dev:

logs to console instead of failing (dev safety)

B) Email templates (minimal set)

Create templates as functions (no external template system yet):

src/emails/

Required templates:

Deal Invite

Trigger: invite created (APP-003)

To: invited_email

Includes:

“You’ve been invited to a FractPath deal”

CTA button: “View invite”

Plain URL fallback

Safety line: “You’ll need to sign in to access details.”

Invite Accepted

Trigger: invite accepted

To: deal initiator (admin ops email for MVP)

Includes:

who accepted

deal link

Document Uploaded

Trigger: doc uploaded

To:

admin ops email always

parties only if doc visibility allows + deal CONNECTED

Includes:

doc type

deal link

“View document in secure portal”

Payment Requested (DUE)

Trigger: ledger entry status changes to DUE

To: payer email

Includes:

itemized description

amount

CTA: “Pay now”

link to deal payments tab

Payment Receipt (PAID)

Trigger: Stripe webhook confirms payment and ledger updated to PAID

To: payer email

Includes:

receipt-like summary (not official tax receipt)

amount

what it was for

date/time

deal link

Also send to admin ops email

Next Step Reminder (manual-first)

Trigger: admin clicks “Send reminder” or scheduled daily scan (choose below)

To: relevant user(s)

Includes:

1–2 next steps

simple CTA: “View your deal”

C) Trigger points (event-driven, using your deal_events/ledger)

Emails should trigger based on events (preferred) or direct calls after actions.

Required trigger mapping:

INVITE_SENT → send Deal Invite

INVITE_ACCEPTED → send Invite Accepted

DOCUMENT_UPLOADED → send Document Uploaded

LEDGER_ENTRY_STATUS_CHANGED to DUE → Payment Requested

LEDGER_ENTRY_STATUS_CHANGED to PAID via webhook → Payment Receipt

All email sends must be logged as a deal_event:

EMAIL_SENT
Payload includes:

template name

to

subject

provider message id (if available)

D) Ops email address + environment variables

Add to .env.example:

OPS_EMAIL=alex.hachey@gmail.com
EMAIL_PROVIDER=resend   # or postmark / ses
RESEND_API_KEY=
EMAIL_FROM=notifications@fractpath.com


MVP safety:

EMAIL_FROM should be a verified sender domain

Use DKIM already configured for fractpath.com (you have SES DKIM verified)

E) Reminder strategy (choose the MVP-safe version)

Implement reminders as admin-triggered for MVP (recommended).

Option A (recommended):

Admin button in deal workspace: “Send reminder”

Opens a small modal with:

recipient(s)

1–2 checkbox next steps

send

Option B:

Scheduled job daily scanning for “stale” deals

More moving parts; do later

This ticket defaults to Option A.

F) Compliance-safe wording

All templates must:

avoid financial promises

refer to “scenario” and “terms summary” appropriately

not attach documents, only link securely

include a footer line:

“If you didn’t request this, you can ignore this email.”

Acceptance Criteria (Definition of Done)

Email wrapper exists and provider configured via env vars

Deal invite email sends successfully on invite creation

Payment requested email sends when a ledger entry is marked DUE

Payment receipt email sends when Stripe webhook confirms payment

Document upload emails send appropriately (admin always; parties when allowed)

All sends create EMAIL_SENT events

Templates render nicely in dark/light email clients (basic formatting)

No secrets committed, Vercel build passes

QA Checklist

 Invite email link works and requires login

 Payment receipt doesn’t imply tax deductibility or returns

 Email sends are idempotent (no duplicate sends on webhook replay)

 OPS_EMAIL receives copies of key events

 In dev without provider, system logs emails instead of erroring

Deliverables

Email provider integration via src/lib/email.ts

Templates in src/emails/*

Trigger wiring from event points

Admin “Send reminder” control (Option A)

Email send logging into deal_events
