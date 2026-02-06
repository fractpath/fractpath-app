TICKET APP-004 — Documents + manual contract upload + title partner handoff
Ticket ID

APP-004

Title

Document placeholders, manual contract upload, and title/appraisal handoff (MVP)

Objective

Add the minimum document and workflow infrastructure so a deal can move from TERMS_SHAPING → PRE_CONTRACT → CONTRACTED_MANUAL while preserving:

an auditable record of documents

a clear “what’s next” checklist for each party

a safe handoff to title/appraisal partners (manual-first)

controlled access to sensitive files (only after CONNECTED)

This ticket makes the portal feel “real” for contract execution even if signing remains manual/off-platform.

Non-goals

No automated PDF generation

No e-sign integration (Dropbox Sign later)

No payments

No automated title API integrations

No OCR or parsing of appraisal PDFs

Preconditions

APP-001..003 complete

Deals exist and reach CONNECTED

Deal events audit log exists

Basic admin role exists (or admin-only routes exist)

Core Design Principles (important)

Documents are immutable references

Access is permissioned and staged (gated until CONNECTED)

Manual operations are first-class (clear steps + logging)

Implementation Requirements
A) Document data model

Create documents model/table:

Required fields:

id (uuid)

deal_id

uploaded_by_user_id (nullable if system/admin)

doc_type (enum/text)

file_name

file_storage_path (or URL)

mime_type

size_bytes

visibility (enum: ADMIN_ONLY | PARTIES_AFTER_CONNECTED)

status (enum: UPLOADED | REVIEWED | SUPERSEDED)

created_at

Doc types (MVP list):

TERMS_SUMMARY (human-readable)

APPRAISAL (PDF)

TITLE_REPORT (PDF)

SIGNED_CONTRACT (PDF)

DISCLOSURES (PDF)

OTHER

Rules:

Document rows are not edited; if updated, mark prior as SUPERSEDED and add a new row.

B) File storage approach (MVP)

Use a secure file storage system compatible with your stack:

(Preferred if using Supabase later): Supabase Storage buckets

Otherwise: a simple private bucket approach

Requirements:

Files are not public

Access requires:

authenticated user

participant in the deal OR admin

Avoid “signed URLs that never expire”

C) Deal workspace — Documents tab

Add a new tab to /deals/[id]:

Documents

It must show:

list of documents with:

type

uploaded date

uploaded by (admin vs participant)

status badge

download/view action gated by permissions

Visibility rules:

Before CONNECTED:

only ADMIN_ONLY docs visible to admin

parties see “Documents unlock after both parties join”

After CONNECTED:

parties can see documents with visibility=PARTIES_AFTER_CONNECTED

D) Admin upload workflow (MVP)

Admin-only ability to upload documents into a deal.

Must support:

upload file

choose doc type

set visibility:

admin only

parties after connected

Upon upload:

create document record

create deal event:

DOCUMENT_UPLOADED

payload includes doc_type + file_name + visibility

E) Party upload workflow (optional for MVP, recommended for appraisal)

Allow parties to upload only specific document types:

Homeowner can upload: APPRAISAL, OTHER

Buyer can upload: OTHER

Realtor: none for MVP

This is optional but useful to reduce email back-and-forth.

If implemented:

Uploads from parties default to ADMIN_ONLY until reviewed

Admin can re-upload or mark as REVIEWED (no direct edit; create event log)

F) Contract status checklist (manual-first UX)

In /deals/[id] Overview, add a simple checklist component:

Example checklist items (role-aware display):

✅ Both parties connected

⬜ Appraisal requested / received

⬜ Title search initiated

⬜ Terms confirmed

⬜ Contract sent for signature

⬜ Signed contract uploaded

⬜ Title/lien recorded (manual confirmation)

This is not automation; it’s operational clarity.

Update checklist based on:

deal status

existence of key doc types (e.g., SIGNED_CONTRACT present)

admin toggles (if needed)

G) Title partner handoff record (structured notes)

Create a deal_partners model/table (or embed as structured fields on deal) to store:

partner type: TITLE, APPRAISAL, LEGAL

partner name (e.g., Eagle Title of Annapolis)

contact email

status (e.g., “intro sent”, “in progress”, “completed”)

notes

This supports scale later without needing APIs.

Log events when updated:

PARTNER_ASSIGNED

PARTNER_STATUS_UPDATED

H) Deal status transitions (admin-only)

Add admin-only ability to move deal between these statuses:

TERMS_SHAPING → PRE_CONTRACT

PRE_CONTRACT → CONTRACTED_MANUAL

Rules:

CONTRACTED_MANUAL requires:

a SIGNED_CONTRACT document exists (or explicit admin override with logged reason)

Every status change logs:

STATUS_CHANGED event including from/to + reason string

Acceptance Criteria (Definition of Done)

Documents model exists and is used

Admin can upload documents to a deal

Parties can view documents after CONNECTED (per visibility rules)

Deal workspace shows a Documents tab

Upload actions create audit events

Deal checklist appears and updates based on doc presence/status

Title/appraisal partner assignment is recorded and visible to admin (and optionally to parties)

Admin can move deal to CONTRACTED_MANUAL with signed contract evidence

Vercel build succeeds; no console errors

QA Checklist

 Unauthorized users cannot access files

 Participants cannot see documents before CONNECTED

 Superceded documents are not deleted; they remain in history

 Audit log shows uploads and status changes

 Mobile Documents tab is usable

Deliverables

documents table/model + storage bucket rules

deal workspace Documents tab UI

admin upload UI (minimal)

optional party upload UI (if included)

deal checklist UX

partner assignment record + UI

status transition controls (admin-only) + event logging
