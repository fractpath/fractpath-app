TICKET OPS-001 — Back-office workflow + CRM discipline (manual-first)
Ticket ID

OPS-001

Title

Back-office workflow, CRM discipline, and audit trail (manual-first, automation-ready)

Objective

Design and document a simple, defensible back-office workflow so FractPath can:

manage inbound leads from marketing

track outreach, negotiations, and deal stages

maintain an auditable record of interactions

operate safely before full portal automation exists

This ticket does not build product UI.
It establishes the operating system you’ll use as a solo founder to run deals without chaos or legal risk.

Non-goals

No automation-heavy pipelines

No custom admin dashboards

No complex permissions system

No financial transaction processing

No contract execution tooling

Preconditions

HubSpot lead capture is live (MKT-006)

Personas are tagged correctly

Calculator outputs are stored in HubSpot

You are comfortable doing some work manually early on

Core Principle (important)

Every meaningful interaction must be traceable.
If something isn’t logged somewhere durable, it didn’t happen.

This ticket enforces that principle with minimal overhead.

Implementation Requirements
A) Define the FractPath Deal Lifecycle (single source of truth)

Create a simple deal lifecycle that applies to all personas.

Document this lifecycle in:

docs/ops/deal-lifecycle.md


Required stages (in order):

Lead Captured

Contact exists in HubSpot

Persona known

Scenario modeled

Initial Outreach

You (or FractPath) contacted the lead

Email or call logged

Exploratory Conversation

Parties asked questions

No terms committed

Still “scenario only”

Terms Shaping

Buyer + Homeowner both engaged

Calculator outputs referenced

Draft terms discussed

Pre-Contract

Intent to proceed

Title/appraisal partners identified

Still no signatures

Contracted (Manual)

Contract executed outside platform

Stored reference to signed doc

Active Agreement

Equity relationship live

Monitoring only

Exited

Sale, refinance, or buyback completed

⚠️ Important:

Marketing site only reaches Stage 1

Secure portal will start at Stage 3+ later

B) HubSpot as system of record (MVP)

For MVP, HubSpot is your primary system of record.

Required discipline:

Every meaningful step updates either:

Contact properties

Contact notes

Associated deal (optional, if using HubSpot Deals)

Required fields to maintain per contact:

Persona

Current lifecycle stage (as text property or note)

Last contact date

Free-text “Internal Notes” (what happened, by whom)

C) Create a lightweight “Deal Tracker” (manual-friendly)

Create one of the following (your choice):

Option A (recommended): Airtable base

Option B: Google Sheet

Name it:

FractPath Deal Tracker

Minimum columns:

Contact Email

Persona

Deal Stage (matches lifecycle above)

Buyer Name (if applicable)

Homeowner Name (if applicable)

Property (address or “TBD”)

Last Action Taken

Next Action Required

Owner (you)

Linked HubSpot Contact URL

Linked Contract (URL, if any)

This is not customer-facing.
It’s your operational memory.

Document this in:

docs/ops/deal-tracker.md

D) Interaction logging rules (audit safety)

Create and document these rules:

All substantive conversations must be logged

Email → HubSpot note

Call → HubSpot note (date + summary)

Zoom → HubSpot note

No off-platform commitments

Never agree to terms without referencing:

“This is illustrative; final terms are documented in writing.”

Calculator outputs are references, not offers

Always refer to them as:

“Scenario”

“Illustrative terms”

“Non-binding”

Contract files

Store signed contracts as:

PDF link

Referenced in HubSpot note

Referenced in Deal Tracker

E) Manual outreach templates (save time, reduce risk)

Create 3 outreach templates and store them in:

docs/ops/outreach-templates.md


Required templates:

Post-calculator follow-up

Acknowledge scenario

Invite conversation

Reiterate non-binding nature

Realtor beta outreach

Explain referral role

Emphasize co-pilot positioning

Invite beta participation

Investor / partner intro

Share “Investor Preview” link

Invite feedback, not commitment

Templates should:

be friendly

avoid legal commitments

always invite next step (call, intro, etc.)

F) Title & appraisal partner handling (manual for now)

Document your manual process for:

identifying a title partner (e.g., Eagle Title)

requesting appraisal

storing results

referencing them in contracts

Create:

docs/ops/title-and-appraisal.md


Include:

what triggers appraisal

who pays (buyer/homeowner)

where docs are stored

how values are referenced vs calculator estimates

Acceptance Criteria (Definition of Done)

Deal lifecycle is clearly documented

You can answer: “What stage is this lead in?” in under 10 seconds

Every active conversation is logged somewhere durable

Outreach templates exist and are reusable

There is no reliance on memory to run the business

This system works even if zero automation exists

QA Checklist (self-check)

 Could I explain any deal to a lawyer if asked?

 Could I reconstruct who said what, when?

 Are calculator outputs clearly framed as non-binding?

 Do I know the next action for every active lead?

If all yes → system is working.

Deliverables

docs/ops/deal-lifecycle.md

docs/ops/deal-tracker.md

docs/ops/outreach-templates.md

docs/ops/title-and-appraisal.md

(No code changes required.)
