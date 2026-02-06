TICKET APP-009 — Contract packet generation (email summary + partner handoff)
Ticket ID

APP-009

Title

Contract packet: generate deal brief + terms summary + partner handoff (email-based, MVP)

Objective

When a deal reaches “accepted terms pending admin confirmation,” enable FractPath admin to generate a Contract Packet that:

packages the accepted term version into a clear, human-readable brief

includes required deal metadata (parties, property, partner assignments)

attaches or links to relevant documents (appraisal, title report, disclosures)

supports a manual handoff to title/legal partners (e.g., Eagle Title)

logs everything for auditability

This ticket replaces chaotic email threads with a repeatable, defensible process.

Non-goals

No automated PDF generation (optional later)

No Dropbox Sign automation (later)

No e-sign webhooks

No legal drafting engine

No escrow or lien recording automation

Preconditions

APP-004 documents tab exists

APP-007 email sending exists (AWS SES)

APP-008 accepted term snapshot exists with admin confirmation gate

Partner info can be recorded (title/appraisal/legal)

Admin role exists

Core Design Principles

Use the accepted term snapshot as source of truth

Human-readable over legalese (partners can draft legal docs)

Every packet is immutable (regenerate = new packet version)

Everything logged (who sent what to whom and when)

Implementation Requirements
A) Contract Packet model (versioned)

Create contract_packets table/model:

Fields:

id (uuid)

deal_id

term_version_id (must reference ACCEPTED version)

version (int, starts at 1)

status (DRAFT | SENT | SUPERSEDED)

generated_by_user_id (admin)

generated_at

sent_at (nullable)

recipients_json (list of emails + roles)

packet_summary_markdown (human-readable deal brief)

attachments_json (list of document ids/links included)

notes (admin-only)

Immutability:

Once sent, packet content cannot be edited—regenerate creates version+1, prior marked SUPERSEDED.

B) “Generate Packet” admin action (Deal workspace)

In /deals/[id] add admin-only action:

Generate contract packet

Requirements:

Only enabled if:

deal has an ACCEPTED term version

admin has confirmed acceptance (APP-008)

property address exists (or explicitly marked “TBD”)

title partner assigned OR admin chooses “send without partner”

On generate:

compose packet summary markdown using accepted term summary + computed highlights

include partner contact block

include checklist of next steps

create packet record (status DRAFT)

log deal_event:

CONTRACT_PACKET_GENERATED

C) Packet summary content (standard template)

The packet must include these sections:

Deal Identification

Deal ID

Date generated

Parties (buyer/homeowner names as available)

Location (city/state; address if available and CONNECTED)

Accepted Terms (from accepted snapshot)

Starting value, funding structure (upfront + monthly)

CPW window, TF early/late

Floor/Cap multipliers

Fees itemization (platform/servicing/exit fee pct)

Realtor commission schedule (if present)

Scenario outcomes (high level)

Early / Standard / Late snapshot results

Plain-language explanation:

“Timing affects payout, not FMV.”

Documents included

Appraisal (if present)

Title report (if present)

Disclosures (if present)

Other attachments

Partner handoff

Title partner contact + role

Appraisal partner contact + role

Legal partner contact + role

Next steps checklist

Title search / lien plan

Confirm settlement event definitions

Draft legal contract using packet as exhibit

E-sign plan (manual for MVP)

Disclaimers (short, non-alarming)

“This packet summarizes accepted terms for drafting purposes.”

“Not legal advice.”

“Final contract governs.”

D) “Send Packet” flow (email-based)

Admin-only action on a packet:

Send packet

UI should allow:

select recipients:

buyer

homeowner

realtor (optional)

title partner

appraisal partner

ops email (always CC)

optional message note (short)

Email sending rules:

Do not attach files for MVP (unless small and safe)

Provide secure links to portal documents:

link to /deals/[id]/documents

document links should require auth if parties; partners can receive time-limited signed links (see below)

On send:

send email via AWS SES

mark packet SENT

store recipients_json and sent_at

log deal_event:

CONTRACT_PACKET_SENT

E) Partner access strategy (MVP-safe)

Partners (title/legal/appraisal) may not have portal accounts yet.

For MVP, allow partners to receive:

packet summary in email body

time-limited signed URLs for specific documents (if needed)

Rules:

signed URLs expire (e.g., 7 days)

only include docs explicitly selected for the packet

log which docs were shared externally:

DOC_SHARED_EXTERNALLY event with doc_id + recipient email + expiry

If signed links are too complex initially:

fallback to “request via reply email,” but document it clearly.

F) “Packet History” page

Add:
/deals/[id]/packets

Shows:

Packet v1, v2, …

Status (DRAFT/SENT/SUPERSEDED)

Term version linked

Generated date

Sent date

Recipients

Click to view packet content (read-only).

Acceptance Criteria (Definition of Done)

Admin can generate a contract packet from accepted terms

Packet uses accepted term snapshot as source of truth

Packet is versioned and immutable once sent

Admin can send packet via email (AWS SES)

Packet send logs deal events and stores recipient list

Partners can receive packet content without portal login (email body + optional signed links)

Packet history is visible in deal workspace

No sensitive details are exposed before CONNECTED

QA Checklist

 Packet generation blocked if no accepted terms

 Regenerating creates v2 and supersedes v1

 Sent packet cannot be edited

 Links in email route correctly and are secure

 Signed links expire (if implemented)

 Events log every generate/send action

Deliverables

contract_packets table/model

Admin generate/send UI

Email template for contract packet

Packet history page

Event logging for packet lifecycle

Optional signed link generation for partner docs
