TICKET APP-002 — Scenario persistence + versioning (audit-safe, manual-first)
Ticket ID

APP-002

Title

Scenario persistence, versioning, and audit trail (read-only for users)

Objective

Create a durable, auditable system inside the secure portal to store, reference, and evolve scenarios that originate from the marketing calculator.

This ticket ensures:

scenarios don’t “disappear”

users can see what they modeled

FractPath can track how terms evolve over time

nothing can be silently changed

At this stage, scenarios are viewable, not editable by users.

Non-goals

No negotiation UI

No scenario editing by users

No real-time syncing with marketing calculator

No deal execution

No payments

Preconditions

APP-001 complete (auth, profiles, dashboard)

Marketing calculator produces a scenario payload

HubSpot stores scenario JSON

OPS-001 lifecycle and logging discipline defined

Core Design Principle (important)

Every scenario is immutable once saved.
If terms change, a new version is created.

This protects:

users

FractPath

future legal review

Implementation Requirements
A) Scenario data model (minimal, future-proof)

Create a scenarios model/table (or equivalent storage) with:

Required fields:

id (uuid)

user_id (owner of the scenario)

persona (homeowner | buyer | realtor)

version (integer, starting at 1)

source (marketing_calculator)

inputs_json (raw numeric inputs)

outputs_json (computed results)

summary_text (human-readable)

created_at

created_by (system | user | fractpath_admin)

parent_scenario_id (nullable; links versions)

Rules:

Once written, a scenario row is never mutated

Updates = new row with version + 1

B) Scenario creation flow (MVP-safe)

Scenarios are created when:

A user signs up with an email that exists in HubSpot
OR

A FractPath admin manually creates one (for now)

For MVP, it is acceptable to:

Pull scenario data from HubSpot once

Save it into the portal DB as version 1

Document this as:

“Initial scenario imported from marketing.”

C) Scenario ownership + visibility

Rules:

A scenario belongs to one primary user

It is visible only to:

that user

FractPath admins

No sharing yet (that’s APP-003)

If multiple scenarios exist:

Show the most recent version

Allow user to view older versions (read-only)

D) Dashboard updates (user-facing)

Update /dashboard to include:

“Your scenarios” section

For each scenario:

Version number

Created date

Short summary

Status badge:

“Imported”

“Under review”

“Superseded”

Clicking a scenario opens:

/scenarios/[id]

E) Scenario detail view (read-only)

Create:

/scenarios/[id]


This page should show:

Scenario header

Persona

Version

Created date

Source (marketing calculator)

Key inputs

Property value

Upfront

Monthly

Horizon

Appreciation assumption

Key outputs

Equity % over time (summary)

Standard / Early / Late outcomes

Floor / Cap / Timing notes

Version history

List of previous versions

Each with:

version #

date

created_by

Clickable to view

Next steps note

“To refine or negotiate terms, contact FractPath.”

F) Admin-only capabilities (manual-first)

Add a simple admin affordance (no UI complexity):

Admins can create a new version of a scenario by:

copying inputs

adjusting values

saving as version +1

This can be:

a hidden admin route

or a manual script

or a temporary UI gated by role

The key is:

version increments

parent scenario linkage maintained

user can see that a new version exists

G) Audit trail discipline

Every scenario version must implicitly answer:

who created it

when

from what prior version (if any)

No silent edits.

Acceptance Criteria (Definition of Done)

Scenario data is persisted in the portal DB

Scenarios are immutable once saved

New versions are created instead of edits

Users can:

see a list of scenarios

open a scenario

view version history

Admins can create a new version (manual-first)

No user can edit or delete a scenario

Portal still works if only one scenario exists

QA Checklist

 Import from marketing doesn’t duplicate scenarios

 Version numbers increment correctly

 Old versions remain accessible

 No scenario disappears after refresh

 Read-only enforcement holds

 Mobile rendering acceptable

Deliverables

Scenario data model

Scenario list UI

Scenario detail UI

Version history UI

Admin-only version creation mechanism
