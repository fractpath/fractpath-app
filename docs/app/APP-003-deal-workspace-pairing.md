TICKET APP-003 — Deal workspace (buyer ↔ homeowner pairing)
Ticket ID

APP-003

Title

Deal workspace: pairing, invitations, participants, and deal status (no chat yet)

Objective

Create a secure Deal Workspace that lets FractPath:

pair a Buyer and Homeowner around a scenario

track the deal lifecycle stage in-app

invite the counterparty via email link

gate sensitive details until both parties are authenticated

maintain an auditable history of “deal progression” (manual-first)

This is the first step toward negotiation and contract execution, without building full messaging or e-sign yet.

Non-goals

No in-app chat/messaging (later ticket)

No payments

No document upload

No Zillow/AVM

No automated contract generation

Preconditions

APP-001 complete (auth + profiles)

APP-002 complete (scenario persistence + versioning)

You have roles: homeowner, buyer, realtor

You have an admin concept (even if rudimentary) for FractPath ops

Core Design Principles (important)

A deal is a container for relationship + terms evolution

No off-platform leakage by default

Sensitive details are revealed progressively (Airbnb-style)

Implementation Requirements
A) Deal data model (minimal but future-proof)

Create a deals model/table with:

Required fields:

id (uuid)

created_at

created_by_user_id (the initiator)

status (enum/text)

primary_scenario_id (points to scenario version that seeded deal)

title (human-readable, e.g., “Annapolis SFR — Buyer/Homeowner”)

visibility_mode (enum/text; default gated)

last_activity_at

Deal statuses (MVP):

DRAFT (created, not paired)

INVITED (counterparty invited)

CONNECTED (both parties have joined)

TERMS_SHAPING (FractPath moderating terms)

PRE_CONTRACT (ready for title/appraisal + paperwork)

CONTRACTED_MANUAL (signed off-platform for MVP)

ACTIVE (agreement live)

EXITED (closed)

Keep it simple. These map directly to OPS-001 lifecycle.

B) Deal participants model

Create a deal_participants model/table:

Required fields:

id (uuid)

deal_id

user_id (nullable until accepted)

role (buyer | homeowner | realtor | fractpath_admin)

display_name (optional)

status (INVITED | JOINED | REMOVED)

invited_email (string)

invited_at

joined_at

permissions (optional JSON; can be blank for MVP)

Rules:

A deal must have exactly one buyer and one homeowner to progress past CONNECTED (for MVP)

Realtor is optional participant

FractPath admin may view all deals

C) Invitation mechanism (email link, no fancy system)

MVP invite flow:

Buyer or Homeowner initiates a deal from their scenario

They enter counterparty email (or FractPath does it as admin)

System creates a deal_participants row with:

invited_email

role

status=INVITED

System generates an invite link with a token:

/invite/[token]

Token model/table (deal_invites):

token (random, single-use)

deal_id

role

invited_email

expires_at (e.g., 7 days)

used_at (nullable)

When the invited user clicks:

If logged out: they must sign up/login first

After login: the system checks email match

If match: mark participant JOINED, attach user_id, set joined_at, set token used_at

D) Gating model (Airbnb-style)

Before CONNECTED status:

Counterparty can see only:

Scenario summary (sanitized)

City/region (not exact address)

General terms (no legal details)

Do NOT show:

exact property address

full names

personal contact details

any files

After CONNECTED:

Reveal:

exact address (if you have it)

full scenario details

both parties’ names (first name + last initial ok)

This prevents off-platform negotiation too early.

E) Deal workspace UI (core screens)

Create routes:

/deals

list of deals user participates in

shows:

title

status badge

last activity

role

/deals/[id]
Deal workspace page with tabs:

Overview

scenario highlights

status

participants

next steps (role-specific)

gating indicator (“Details unlock when both parties join”)

Terms Summary

read-only view of latest scenario version linked to this deal

show floors/caps/timing notes

show early/standard/late outcomes

Activity

audit log of major events (not chat)

events include:

deal created

invite sent

invite accepted

status changed

scenario version updated/attached

No chat yet.

F) Deal status transitions (manual-first but controlled)

Allow only these actions (MVP):

Initiator can:

create deal

invite counterparty

FractPath admin can:

move status forward/backward

attach newer scenario version to deal

Participants can:

view deal

accept invite

request help (support CTA)

Status change UI can be admin-only to reduce risk.

G) Audit logging (minimal implementation)

Create deal_events model/table:

id

deal_id

actor_user_id (nullable for system)

event_type (text)

event_payload_json (json)

created_at

Log at minimum:

DEAL_CREATED

INVITE_SENT

INVITE_ACCEPTED

STATUS_CHANGED

SCENARIO_VERSION_ATTACHED

These logs support your “auditable record” requirement without building full messaging.

Acceptance Criteria (Definition of Done)

User can create a deal from a scenario

User can invite a counterparty by email

Invite link works:

requires login

matches invited email

joins deal successfully

Deal status becomes CONNECTED when both buyer and homeowner have joined

Gating works:

sanitized view before CONNECTED

fuller details after CONNECTED

/deals list and /deals/[id] workspace render cleanly

Deal activity log shows key events

No off-platform leakage (no full details before CONNECTED)

QA Checklist

 Invite token expires correctly

 Invite can only be used once

 Wrong-email user cannot accept invite

 Participants only see deals they belong to

 Admin can view all (if implemented)

 Deal events are appended, never edited/deleted

Deliverables

Tables/models: deals, deal_participants, deal_invites, deal_events

UI routes: /deals, /deals/[id], /invite/[token]

Controlled invite acceptance flow

Deal workspace with Overview/Terms Summary/Activity tabs

Basic gating behavior
