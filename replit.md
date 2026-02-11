# FractPath

## Overview
FractPath is a minimal homeowner intake application built with Next.js. Its primary purpose is to collect exploratory scenario information from homeowners and provide a deterministic, non-binding scenario summary. This summary is then sent to HubSpot for internal sales follow-up. The platform supports Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), includes a user dashboard, and features a deal resume flow that converts marketing DraftSnapshots into authenticated deals with immutable calculator snapshots. It also offers a share-link flow for read-only viewing of deals. The business vision is to streamline the initial homeowner engagement process, offering clear, non-committal exploratory tools that can lead to qualified sales opportunities.

## User Preferences
- Language must be neutral and exploratory (no deal/commitment language in user-facing copy)
- DraftSnapshot inputs/results are stored verbatim — no recomputation or normalization
- Calculator snapshots are immutable and append-only
- Errors must be explicit and blocking (fail-closed)

## System Architecture
FractPath is a Next.js application leveraging API routes for backend logic and Supabase for database and authentication services.

**UI/UX Decisions:**
- **Role-based onboarding:** Users select a role (Homeowner, Buyer, Realtor) during signup, which influences their dashboard content.
- **Deal Viewing:** Deals are presented with a focus on immutable calculator snapshots and an audit trail of events. A read-only banner is displayed for shared deals.
- **Snapshot History:** When multiple snapshots exist for a deal, a history section allows selection via URL parameters, with a "Back to latest" option.

**Technical Implementations:**
- **Authentication:** Supabase is used for user authentication, including sign-in, sign-up, password reset, and email verification. Role information is stored in Supabase user metadata.
- **Data Handling:**
    - **DraftSnapshots:** Initial scenario data (from a marketing widget) is captured as `DraftSnapshot` objects. These are validated for schema, required fields, and hash integrity but are not recomputed.
    - **Deal Creation:** `DraftSnapshots` are converted into `Deal` objects and associated `FullDealSnapshotV1` records upon user authentication and "resume" action. Deals are created exclusively via the `/api/deals/resume` endpoint.
    - **Snapshots:** Calculator snapshots are append-only, immutable, and versioned. They are stored as `FullDealSnapshotV1` objects. Display logic fetches and renders these snapshots without recomputation.
    - **Deal Versions:** A `deal_versions` table tracks changes to deals, with `version_type` (OFFER, COUNTER, ACCEPT, REJECT) and references to snapshots.
    - **Deal Events:** An audit trail for deals (e.g., `DEAL_CREATED`, `DEAL_SNAPSHOT_CREATED`) is maintained via `deal_events`.
- **Share Link Flow:**
    - Owners can generate shareable URLs for their deals via `/api/deals/[dealId]/share`.
    - The `/share` page validates tokens, handles authentication, and grants `VIEWER` access to the recipient, redirecting them to a read-only view of the deal.
- **Access Control (RLS):** Supabase Row Level Security (RLS) is extensively used to manage access to deals, snapshots, events, and share tokens based on `deal_access_grants` (OWNER, VIEWER, COUNTERPARTY roles). Ownership is determined by `owner_user_id` or `OWNER` grant. COUNTERPARTY can submit COUNTER versions only.
- **Rate Limiting:** In-memory IP rate limiting is implemented to prevent abuse of pre-authentication endpoints.

**Feature Specifications:**
- **Homeowner Intake Form:** Main entry point for data collection.
- **User Dashboard:** Role-specific content and access to personal scenarios.
- **Deal Resume Flow:** Converts marketing drafts into authenticated deals.
- **Share Deal Functionality:** Allows deal owners to generate read-only share links for others.
- **Snapshot Ingestion:** Owners can ingest new snapshots for their deals via `/api/deals/[dealId]/snapshot`.
- **Offer Creation:** Owners can create OFFER deal_versions referencing snapshots via `/api/deals/[dealId]/offer`.
- **Counter-Offer Creation:** Owners or counterparties can create COUNTER deal_versions via `/api/deals/[dealId]/counter`.
- **Accept/Reject Decisions:** Owners can accept or reject a specific deal_version via `/api/deals/[dealId]/versions/[versionId]/decision`. Decisions are recorded as new ACCEPT/REJECT version rows referencing the target version, preventing duplicate decisions on the same version.
- **Snapshot Comparison:** A read-only comparison view at `/deal/[dealId]/compare?a=<id>&b=<id>` shows field-level diffs between two snapshots of the same deal, grouped by metadata, inputs, and outputs. No recomputation; values displayed as-is.

## Project Structure (Key Files)

```
src/
├── api/deals/
│   ├── resume/route.ts                  # POST: resume DraftSnapshot → Deal
│   └── [dealId]/
│       ├── share/route.ts               # POST: create share link (OWNER only)
│       ├── snapshot/route.ts            # POST: owner-only snapshot ingestion
│       ├── offer/route.ts              # POST: create OFFER version (OWNER only)
│       ├── counter/route.ts           # POST: create COUNTER version (OWNER or COUNTERPARTY)
│       └── versions/[versionId]/
│           └── decision/route.ts     # POST: ACCEPT/REJECT a version (OWNER only)
├── components/deal/
│   ├── DealSummary.tsx                  # Orchestrator: friendly deal summary renderer
│   ├── DealKpiCard.tsx                  # Headline + supporting KPI cards
│   ├── DealExitTable.tsx                # Early/standard/late exit outcomes table
│   └── DealAssumptionsSummary.tsx       # Collapsible key assumptions list
├── lib/
│   ├── dealSnapshot.ts                  # FullDealSnapshotV1 validation
│   ├── dealSnapshotDb.ts               # insertDealSnapshot + getDealSnapshots helpers
│   ├── dealSnapshotDisplay.ts          # Pure display + selectSnapshot helpers
│   ├── snapshotCompare.ts              # compareSnapshotDisplay pure diff helper
│   ├── dealSummaryViewModel.ts          # buildDealSummaryViewModel pure view-model helper
│   ├── dealTimeline.ts                 # getDealEvents + buildDealTimeline merge/sort helper
│   ├── dealVersionDb.ts                # getDealVersions + getLatestDealVersion + version_type validation
│   ├── draftToDealSnapshot.ts          # DraftSnapshotV1 → FullDealSnapshotV1 mapping
│   └── __tests__/
│       ├── dealSnapshotValidation.test.ts  # 14 tests
│       ├── dealSnapshotDisplay.test.ts     # 14 tests (display + selection)
│       ├── draftToDealSnapshot.test.ts     # 5 tests
│       ├── snapshotIngestion.test.ts       # 14 tests
│       ├── dealVersionDb.test.ts           # 15 tests (version_type + ordering)
│       ├── offerRoute.test.ts             # 15 tests (body parsing, ownership, snapshot validation)
│       ├── counterRoute.test.ts          # 13 tests (body parsing, role gating, snapshot validation)
│       ├── decisionRoute.test.ts        # 21 tests (body parsing, role gating, version validation, duplicate prevention)
│       ├── snapshotCompare.test.ts     # 14 tests (diff logic, missing keys, null handling, nested objects)
│       ├── dealTimeline.test.ts       # 17 tests (ordering, labeling, links, missing fields)
│       └── dealSummaryViewModel.test.ts # 15 tests (KPI extraction, exits, assumptions, flags)
supabase/migrations/
├── 20260210_app_060_deal_snapshots.sql
├── 20260211_app_070_deal_versions.sql
├── 20260211_app_072_counterparty_role.sql
└── (earlier migrations...)
```

## Sprint Status

### APP-080 — Friendly Deal Summary Renderer (Complete)
- [x] Pure view-model helper: src/lib/dealSummaryViewModel.ts — buildDealSummaryViewModel
- [x] Extracts 1 headline + up to 4 supporting KPIs from outputs/inputs
- [x] Exit outcomes table from settlements or exit_early/standard/late keys
- [x] Collapsible assumptions from known input keys (capped at 6)
- [x] Graceful degradation: null display, null outputs, missing keys all handled
- [x] Components: DealSummary, DealKpiCard, DealExitTable, DealAssumptionsSummary
- [x] Deal page updated: raw snapshot dump replaced with friendly summary
- [x] isHistorical banner shown for older snapshots
- [x] Snapshot history + timeline sections untouched
- [x] Tests: 15 pure logic tests (KPI extraction, exits, assumptions, flags, fallbacks)
- [x] npm run build passes

### APP-075 — Unified deal timeline (Complete)
- [x] Server helper: src/lib/dealTimeline.ts — getDealEvents + buildDealTimeline
- [x] Merges deal_snapshots, deal_versions, deal_events into unified chronological list
- [x] Sorted by created_at desc, missing dates pushed to end
- [x] Human-readable labels for all version types and event types
- [x] Smart links: snapshots → snapshot view, OFFER/COUNTER with both snapshots → compare view
- [x] Type badges (SNAP/VER/EVT) with color coding
- [x] Replaces old "Deal events" section on deal detail page
- [x] Tests: 17 pure logic tests (ordering, missing created_at, type labeling, link construction, subtitles, empty inputs)
- [x] npm run build passes

### APP-074 — Read-only snapshot comparison view (Complete)
- [x] Pure diff helper: src/lib/snapshotCompare.ts — compareSnapshotDisplay(a, b)
- [x] Shallow compare on inputs, outputs, and meta keys (contract_version, schema_version, input_hash, output_hash)
- [x] Handles null/undefined snapshots, missing keys, nested objects defensively
- [x] UI route: /deal/[dealId]/compare?a=<id>&b=<id>
- [x] Validates both snapshots exist and belong to dealId
- [x] Header with snapshot A vs B metadata (version, schema, created_at)
- [x] Changed fields grouped by Metadata / Inputs / Outputs
- [x] "Back to deal" and "Swap A / B" links
- [x] Tests: 14 pure logic tests (identical, changed input/output, missing keys, null, nested objects, meta diffs)
- [x] npm run build passes

### APP-073 — Accept/reject deal versions (Complete)
- [x] POST /api/deals/[dealId]/versions/[versionId]/decision — auth + OWNER-only
- [x] Body: { decision: "ACCEPT" | "REJECT", note?: string }
- [x] Validates version belongs to deal
- [x] Prevents duplicate decisions on same version (409)
- [x] Inserts new deal_version with version_type=ACCEPT or REJECT, meta: { target_version_id }
- [x] Logs DEAL_VERSION_DECIDED event
- [x] Returns { ok: true, decision_version_id, version_number } on 201
- [x] Tests: 21 pure logic tests (body parsing, role gating incl. COUNTERPARTY/VIEWER denied, version validation, duplicate prevention)
- [x] npm run build passes

### APP-072 — Counter-offer endpoint + COUNTERPARTY role (Complete)
- [x] Migration: Updated deal_versions INSERT RLS to allow COUNTERPARTY for COUNTER versions
- [x] POST /api/deals/[dealId]/counter — auth + OWNER or COUNTERPARTY
- [x] Body: { proposed_snapshot_id, base_snapshot_id?, note? }
- [x] Validates snapshot IDs belong to the same deal
- [x] Inserts deal_versions row with version_type=COUNTER
- [x] Logs DEAL_COUNTER_CREATED event
- [x] VIEWER remains read-only (denied)
- [x] Tests: 13 pure logic tests (body parsing, role gating incl. VIEWER denied, snapshot validation)
- [x] npm run build passes

### APP-071 — Create offer version endpoint (Complete)
- [x] POST /api/deals/[dealId]/offer — auth + OWNER-only
- [x] Body: { proposed_snapshot_id, base_snapshot_id?, note? }
- [x] Validates snapshot IDs are UUIDs and belong to the same deal
- [x] Computes version_number monotonically from latest existing version
- [x] Inserts deal_versions row with version_type=OFFER
- [x] Logs DEAL_OFFER_CREATED event with snapshot IDs + version_number
- [x] Returns { ok: true, deal_version_id, version_number } on 201
- [x] Tests: 15 pure logic tests (UUID, body parsing, snapshot ownership, version numbering)
- [x] npm run build passes

### APP-070 — Deal versions schema (Complete)
- [x] Migration: deal_versions table (append-only, immutable)
- [x] RLS: SELECT via any grant, INSERT OWNER only, no UPDATE/DELETE
- [x] Helpers: getDealVersions, getLatestDealVersion, isValidVersionType
- [x] Tests: 15 tests

### APP-063 — Owner-only snapshot ingestion endpoint (Complete)
- [x] POST /api/deals/[dealId]/snapshot — auth + OWNER-only
- [x] Tests: 14 tests

### APP-062 — Snapshot history & selection (Complete)
- [x] Read-only history viewer with URL-based selection
- [x] Tests: 14 tests

## External Dependencies
- **Next.js:** React framework for server-side rendering and API routes.
- **Supabase:**
    - Database (PostgreSQL) for storing user data, deals, snapshots, events, and access grants.
    - Authentication services (email/password, OAuth callbacks).
    - Row Level Security (RLS) for fine-grained access control.
- **HubSpot:** Destination for deterministic, non-binding scenario summaries for sales follow-up.