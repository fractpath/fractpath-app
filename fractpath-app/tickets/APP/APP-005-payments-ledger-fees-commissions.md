# APP-005 — Payments (manual-first) + fee ledger + realtor commission hooks (snapshot-aligned)

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 5 (implementation)

## Objective
Enable FractPath to **record, audit, and explain** all deal-related money flows—without processing payments in-app yet—
so you can:

- define platform fees / outreach fees / servicing fees / exit fees (record first)
- mark what actually happened (manual confirmation)
- produce an auditable, append-only ledger
- model and track realtor commission accruals and payouts
- later “swap in” Stripe with minimal rework

This is the financial operating layer for the deal workflow and the data backbone for APP-011 analytics.

---

## Non-Goals
- No automated Stripe payments in MVP (APP-006)
- No escrow handling
- No bank account linking
- No secondary market investor payouts
- No tax documents

---

## Preconditions
- APP-001..004 complete
- Deals exist and can reach `PRE_CONTRACT` / `CONTRACTED_MANUAL`
- Deal events audit log exists (APP-003)
- Admin role exists
- Accepted terms may exist (APP-008) for fee schedule derivation
- Calculator snapshots exist (APP-002) for transparent assumptions/context

---

## Core Design Principles (Locked)
1) **Ledger-first**
   - record what should happen, then mark what did happen
2) **Append-only**
   - no silent changes; corrections create new entries
3) **Party clarity**
   - every fee is itemized with payer + payee roles
4) **Upgradeable**
   - later attach Stripe payment IDs to existing ledger entries
5) **Snapshot-aligned transparency**
   - ledger entries may reference the snapshot/terms version that created them (metadata only)

---

## A) Ledger Data Model (Append-Only)

Create table/model: `ledger_entries`

### Required Fields
- `id` (uuid)
- `deal_id`
- `entry_type` (enum/text)
- `status` (enum/text)
- `payer_role` (`buyer | homeowner | realtor | fractpath | partner`)
- `payer_user_id` (nullable; payer may be external initially)
- `payee_role` (`fractpath | realtor | partner | buyer | homeowner`)
- `payee_user_id` (nullable)
- `amount_cents` (integer; may be 0 for planned percentage-based items, see metadata)
- `currency` (default `USD`)
- `due_at` (datetime, nullable)
- `paid_at` (datetime, nullable)
- `description` (string)
- `metadata_json` (json)
- `external_ref` (string; Stripe charge ID later, or manual reference)
- `created_at`
- `created_by_user_id` (admin/system)

### Append-Only Rules
- Do not update amounts after creation
- If correction is needed:
  - create a new entry with `entry_type=ADJUSTMENT`
  - reference prior entry in `metadata_json.previous_entry_id`
- No deletions

---

## B) Ledger Entry Types (MVP List)

FractPath revenue:
- `PLATFORM_FEE_UPFRONT`
- `OUTREACH_FEE`
- `SERVICING_FEE_MONTHLY`
- `EXIT_FEE`

Realtor commissions:
- `REALTOR_REFERRAL_FLAT`
- `REALTOR_SHARE_PLATFORM`
- `REALTOR_SHARE_SERVICING`
- `REALTOR_SHARE_EXIT`

Partner fees (manual now):
- `TITLE_FEE`
- `APPRAISAL_FEE`
- `LEGAL_REVIEW_FEE`

Ledger mechanics:
- `ADJUSTMENT`
- `REFUND`

---

## C) Ledger Statuses
- `PLANNED` — expected but not yet requested
- `DUE` — payment requested / invoice sent
- `PAID` — confirmed received
- `WAIVED` — explicitly waived (requires reason)
- `REFUNDED` — refund issued (link to refund entry)
- `FAILED` — attempted but not received (reserved for future Stripe)

Status transitions must be logged (see H).

---

## D) Deal Workspace UI: Payments Tab

Add a new tab to `/deals/[id]`:
**Payments**

### Admin View (Full)
Itemized table columns:
- Entry type
- Description
- Amount
- Payer → Payee
- Status
- Due / Paid dates
- External ref (optional)
- Created by / created at

Admin-only actions:
- Create ledger entry
- Mark as PAID (requires `paid_at`, optional `external_ref`)
- Mark as WAIVED (requires reason)
- Add ADJUSTMENT (requires reason + prior entry reference)

### Participant View (Buyer/Homeowner/Realtor)
- Read-only list of entries where they are payer or payee
- Only visible once deal is `CONNECTED`
- Totals:
  - Total due
  - Total paid
  - Total waived

---

## E) Fee Schedule Templating (Manual-First Presets)

Goal: reduce admin manual work without overbuilding.

Implement either:
- `fee_schedules` table, OR
- simple preset objects + generator action (acceptable for MVP)

### Minimum MVP Behavior
Admin action: **Generate fee schedule**
Creates baseline entries:
- `PLATFORM_FEE_UPFRONT` (if configured)
- `OUTREACH_FEE` (optional)
- `SERVICING_FEE_MONTHLY` (optional)
  - MVP can represent as a single PLANNED line item with metadata:
    `{ monthly_amount_cents, term_months }`
- `EXIT_FEE` (planned)
  - amount may be 0 until exit finalization
  - store rule in metadata:
    `{ exit_fee_pct, basis: "settlement" | "fmv" }`

---

## F) Realtor Commission Tracking Hooks (No Payout Automation)

Store realtor commission configuration per deal, either:
- as `deal_participants.metadata_json` (fast MVP), OR
- dedicated `deal_commissions` table (cleaner)

Must support:
- referral flat amount
- % of platform fee
- % of servicing fee
- % of exit fee

### Generation Rules
On **Generate fee schedule**:
- Create PLANNED commission entries corresponding to underlying FractPath fees:
  - `REALTOR_SHARE_PLATFORM` derived from platform fee
  - `REALTOR_SHARE_SERVICING` derived from servicing
  - `REALTOR_SHARE_EXIT` derived from exit fee rule

Commission entries remain `PLANNED` until the underlying revenue entry becomes `PAID`.

This enables:
- “Projected commission” vs “Paid commission”
- APP-011 realtor analytics without new math

---

## G) Exit Event Handling (Fee Finalization)

When a deal transitions to `EXITED` (admin-only in MVP):
Require entry of:
- FMV at exit
- buyer settlement amount (from accepted terms or manual)
- closing costs estimate (optional)

Then generate/finalize:
- `EXIT_FEE` amount (from configured rule; store rule in metadata)
- `REALTOR_SHARE_EXIT` derived from exit fee
- partner fees if applicable

Log `deal_event`: `DEAL_EXIT_RECORDED` with summary payload.

---

## H) Compliance & Audit Requirements

Every ledger entry creation and status change must log a `deal_event`:

- `LEDGER_ENTRY_CREATED`
- `LEDGER_ENTRY_STATUS_CHANGED`

Payload includes:
- `entry_id`
- `entry_type`
- `old_status` / `new_status` (for status changes)
- `amount_cents`
- `reason` (required for waive/adjust)
- optional linkage:
  - `terms_version_id` (if schedule derived from accepted terms)
  - `snapshot_id` (if derived from a calculator snapshot)

No deletions. No silent overwrites.

---

## Acceptance Criteria (Definition of Done)
- `ledger_entries` model exists and behaves append-only
- Deal workspace has a Payments tab
- Admin can:
  - create entries
  - mark paid/waived/adjusted with reasons
- Participants can see relevant entries read-only after CONNECTED
- Fee schedule generator reliably creates baseline entries
- Realtor commission config + planned entries are supported
- Exit finalization creates derived exit-related entries
- Audit events are written for all ledger mutations
- No sensitive payment instrument data is stored

---

## QA Checklist
- Amounts are stored as integer cents (no floats)
- Users can’t see other deals’ ledger entries
- Waive requires reason and logs event
- Adjustment links to original entry via metadata
- Exit finalization generates correct derived entries
- Mobile view is readable

---

## Deliverables
- `ledger_entries` table/model
- (optional) `deal_commissions` table/model OR documented metadata strategy
- Payments tab UI with admin controls + participant read-only view
- Fee schedule generator action
- Exit finalization admin action
- Audit events logged for ledger mutations
