# APP-004 — Documents + manual contract upload + title/appraisal handoff (MVP)

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 5 (implementation)

## Objective
Add the minimum document and workflow infrastructure required to move a deal from:

TERMS_SHAPING → PRE_CONTRACT → CONTRACTED_MANUAL

while preserving:
- an auditable record of all documents
- clear operational “what’s next” visibility for parties and ops
- safe, permissioned access to sensitive files
- a manual-first handoff path to title/appraisal partners

This ticket makes the portal feel contract-ready without automating signing or title work.

---

## Non-goals
- No automated PDF generation
- No e-sign integration (Dropbox Sign later)
- No payments
- No automated title/appraisal APIs
- No OCR or document parsing

---

## Preconditions
- APP-001..003 complete
- Deals exist and can reach CONNECTED
- Deal events audit log exists
- Admin role (or admin-only routes) exists

---

## Core Design Principles
- **Documents are immutable references** (no silent edits)
- **Access is staged and permissioned** (unlocked only after CONNECTED)
- **Manual ops are first-class** (explicit steps + logging)
- **Evidence drives status** (documents unlock lifecycle progression)

---

## A) Document Data Model

Create `documents` table/model with:

Required fields:
- `id` (uuid)
- `deal_id`
- `uploaded_by_user_id` (nullable for system/admin)
- `doc_type` (enum/text)
- `file_name`
- `file_storage_path` (or opaque storage key)
- `mime_type`
- `size_bytes`
- `visibility` (enum: `ADMIN_ONLY` | `PARTIES_AFTER_CONNECTED`)
- `status` (enum: `UPLOADED` | `REVIEWED` | `SUPERSEDED`)
- `created_at`

### Doc types (MVP allowlist)
- `TERMS_SUMMARY`
- `APPRAISAL`
- `TITLE_REPORT`
- `SIGNED_CONTRACT`
- `DISCLOSURES`
- `OTHER`

Rules:
- Document rows are never edited.
- Updates = new row + prior row marked `SUPERSEDED`.

---

## B) File Storage (MVP-Safe)

Use private storage compatible with the app stack.

Requirements:
- Files are **not public**
- Access requires:
  - authenticated user
  - deal participant OR admin
- Use short-lived signed URLs or authenticated proxy download
- Never issue perpetual public URLs

---

## C) Deal Workspace — Documents Tab

Add a **Documents** tab to `/deals/[id]`.

It must display:
- document list with:
  - type
  - uploaded date
  - uploaded by (admin vs participant)
  - status badge
  - gated view/download action

### Visibility rules
- **Before CONNECTED**
  - Admin sees `ADMIN_ONLY` documents
  - Parties see:
    > “Documents unlock after both parties join.”
- **After CONNECTED**
  - Parties can see documents with `PARTIES_AFTER_CONNECTED`

---

## D) Admin Upload Workflow (Required)

Admin-only UI to upload documents:

- upload file
- select `doc_type`
- set `visibility`
- submit

On upload:
- create document record
- emit deal_event:
  - `DOCUMENT_UPLOADED`
  - payload includes: `doc_type`, `file_name`, `visibility`

---

## E) Party Upload Workflow (Optional but Recommended)

If implemented:

- Homeowner may upload: `APPRAISAL`, `OTHER`
- Buyer may upload: `OTHER`
- Realtor: none (MVP)

Rules:
- Party uploads default to `ADMIN_ONLY`
- Admin may later re-upload or mark reviewed (no edits)

Each upload emits `DOCUMENT_UPLOADED`.

---

## F) Contract Status Checklist (Manual-First UX)

Add a simple checklist to `/deals/[id]` → Overview.

Example items (role-aware display):
- ✅ Both parties connected
- ⬜ Appraisal received
- ⬜ Title search initiated
- ⬜ Terms confirmed
- ⬜ Contract sent for signature
- ⬜ Signed contract uploaded
- ⬜ Title/lien recorded (manual confirmation)

Checklist updates based on:
- deal status
- presence of key document types
- admin toggles (if needed)

This is **operational clarity**, not automation.

---

## G) Title / Appraisal Partner Handoff (Structured Record)

Create `deal_partners` table/model (or equivalent structured storage):

Fields:
- `id`
- `deal_id`
- `partner_type` (TITLE | APPRAISAL | LEGAL)
- `partner_name`
- `contact_email`
- `status` (e.g., INTRO_SENT | IN_PROGRESS | COMPLETED)
- `notes`
- `created_at`

Emit deal_events:
- `PARTNER_ASSIGNED`
- `PARTNER_STATUS_UPDATED`

---

## H) Deal Status Transitions (Admin-Only)

Admin-only controls to move:
- `TERMS_SHAPING → PRE_CONTRACT`
- `PRE_CONTRACT → CONTRACTED_MANUAL`

Rules:
- `CONTRACTED_MANUAL` requires:
  - a `SIGNED_CONTRACT` document exists
  - OR explicit admin override with logged reason

Every transition emits:
- `STATUS_CHANGED`
- payload includes: `from`, `to`, `reason`

---

## Acceptance Criteria (Definition of Done)
- Documents model exists and is enforced as immutable
- Admin can upload documents to a deal
- Parties can view documents only after CONNECTED (per visibility)
- Documents tab renders correctly
- Uploads and status changes create audit events
- Checklist reflects document presence and deal status
- Partner handoff records are stored and visible to admin
- Admin can move deal to CONTRACTED_MANUAL with evidence
- Vercel build succeeds

---

## QA Checklist
- Unauthorized users cannot access files
- Parties cannot see gated documents before CONNECTED
- Superceded documents remain accessible for audit
- Audit log records uploads and status changes
- Mobile Documents tab is usable

---

## Deliverables
- `documents` table/model + private storage rules
- Documents tab UI
- Admin upload UI
- (Optional) party upload UI
- Deal checklist UX
- Partner assignment records + UI
- Admin-only status transition controls + audit logging
