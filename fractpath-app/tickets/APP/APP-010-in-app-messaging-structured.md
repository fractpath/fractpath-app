TICKET APP-010 — In-app messaging (structured, auditable, anti-leakage)
Ticket ID

APP-010

Title

Structured in-app messaging tied to deals (auditable, no free-form chat)

Objective

Introduce a controlled, auditable messaging layer inside each Deal Workspace that:

keeps negotiations and coordination on-platform

avoids free-form chat that’s hard to moderate or audit

prevents early off-platform leakage of contact details

creates a clear, reviewable record of communications

integrates cleanly with email notifications (APP-007)

This messaging system is structured and deal-scoped, not Slack-like chat.

Non-goals

No real-time chat or typing indicators

No file attachments in messages (documents live in APP-004)

No emoji reactions or threading

No SMS or push notifications

No cross-deal messaging

Preconditions

APP-003 Deal Workspace exists

APP-004 Documents tab exists

APP-007 Email notifications exist

Deal events audit log exists

Gating rules (pre/post CONNECTED) already implemented

Core Design Principles (important)

Messages are contextual, not conversational

Every message is attributable and timestamped

No contact info exchange before CONNECTED

Admin visibility into all messages

Messages complement—not replace—terms negotiation UI

Implementation Requirements
A) Message data model (append-only)

Create deal_messages table/model:

Required fields:

id (uuid)

deal_id

sender_user_id

sender_role (buyer | homeowner | realtor | fractpath_admin)

message_type (enum/text)

body_text (string, length-limited)

visibility (PARTICIPANTS | ADMIN_ONLY)

created_at

Rules:

Messages are append-only

No edits or deletes

Length limit (e.g., 1,000 characters)

B) Message types (MVP-safe set)

Use message_type to keep communication structured:

User-generated

QUESTION

CLARIFICATION

COUNTER_CONTEXT (used alongside APP-008 counter-offers)

NEXT_STEP_REQUEST

System / admin

SYSTEM_NOTICE

ADMIN_NOTE

STATUS_UPDATE

This allows filtering and future automation.

C) Gating + anti-leakage rules

Before deal status = CONNECTED:

Messages allowed:

Buyer ↔ FractPath admin

Homeowner ↔ FractPath admin

Buyer ↔ Homeowner messaging disabled

UI copy explains:

“Direct messaging unlocks once both parties join the deal.”

After CONNECTED:

Buyer ↔ Homeowner ↔ Realtor ↔ Admin allowed

Messages remain deal-scoped

Hard rules:

Block sending emails, phone numbers, URLs in body_text before CONNECTED
(basic regex filter + warning message)

After CONNECTED, allow but still log normally

D) Messaging UI (Deal Workspace)

Add a new tab to /deals/[id]:

Messages

Layout:

chronological list (top → bottom)

sender name + role

timestamp

message body

subtle badge for message_type

Composer:

textarea

dropdown (message type)

“Send message” button

Admin extras:

toggle visibility = ADMIN_ONLY

post SYSTEM_NOTICE (e.g., “Appraisal received”)

E) Integration with terms negotiation (APP-008)

When a user submits a counter-offer:

auto-create a COUNTER_CONTEXT message

message body example:

“I’ve proposed updated terms adjusting the monthly amount and exit window.”

This keeps context without duplicating logic.

F) Email notifications (via APP-007)

Trigger emails on new messages:

Rules:

Email only for:

messages addressed to the user

message types ≠ SYSTEM_NOTICE

Email includes:

sender role

truncated message preview

CTA: “View message in secure portal”

Log:

EMAIL_SENT event linked to message_id

G) Audit logging

Every message creation must also create a deal_event:

MESSAGE_SENT
Payload includes:

message_id

sender_user_id

sender_role

message_type

This ensures:

messages are part of the audit trail

lawyers/compliance can reconstruct conversations

Acceptance Criteria (Definition of Done)

Deal has a Messages tab

Users can send structured messages within allowed gating rules

Buyer ↔ Homeowner messaging unlocks only after CONNECTED

Contact info is blocked pre-CONNECTED

Admin can view all messages and post SYSTEM_NOTICE / ADMIN_NOTE

Messages are immutable and timestamped

New messages trigger email notifications

All messages generate deal_events

QA Checklist

 Pre-CONNECTED users cannot message counterparties

 Contact info blocked pre-CONNECTED

 Messages render correctly on mobile

 Email notifications contain correct links

 No message edits or deletes possible

 Admin visibility confirmed

Deliverables

deal_messages table/model

Messages tab UI

Message composer with type selector

Gating + content filtering logic

Email notification triggers

Deal event logging
