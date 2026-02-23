# FractPath

## Overview
FractPath is a minimal homeowner intake application built with Next.js, designed to collect exploratory scenario information from homeowners and provide a deterministic, non-binding summary. This summary is then integrated with HubSpot for sales follow-up. The platform supports Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), offers a user dashboard, and includes a deal resume flow that converts marketing DraftSnapshots into authenticated deals with immutable calculator snapshots. It also features a share-link capability for read-only deal viewing. The project aims to streamline initial homeowner engagement, providing clear, non-committal exploratory tools that lead to qualified sales opportunities.

## User Preferences
- Language must be neutral and exploratory (no deal/commitment language in user-facing copy)
- DraftSnapshot inputs/results are stored verbatim — no recomputation or normalization
- Calculator snapshots are immutable and append-only
- Errors must be explicit and blocking (fail-closed)

## System Architecture
FractPath is a Next.js application that utilizes API routes for backend logic and Supabase for database and authentication.

**UI/UX Decisions:**
- **Role-based onboarding:** Users select a role during signup, influencing their dashboard content.
- **Deal Viewing:** Deals emphasize immutable calculator snapshots and an audit trail. Shared deals display a read-only banner.
- **Snapshot History:** Multiple snapshots for a deal are navigable via URL parameters, with an option to return to the latest.

**Technical Implementations:**
- **Authentication:** Supabase handles user authentication, including sign-in, sign-up, password reset, and email verification, storing role information in user metadata.
- **Data Handling:**
    - **DraftSnapshots:** Initial scenario data from marketing widgets is captured, validated for schema and hash integrity, and stored without recomputation.
    - **Deal Creation:** DraftSnapshots convert to `Deal` objects and `FullDealSnapshotV1` records via the `/api/deals/resume` endpoint upon user authentication and resume action.
    - **Snapshots:** Calculator snapshots are append-only, immutable, and versioned (`FullDealSnapshotV1`). Display logic renders these without recomputation.
    - **Deal Versions:** A `deal_versions` table tracks deal changes (OFFER, COUNTER, ACCEPT, REJECT) referencing snapshots.
    - **Deal Events:** An audit trail of deal activities (e.g., `DEAL_CREATED`, `DEAL_SNAPSHOT_CREATED`) is maintained.
- **Share Link Flow:** Owners can generate shareable URLs for deals. The `/share` page validates tokens, manages authentication, grants `VIEWER` access, and redirects to a read-only view.
- **Access Control (RLS):** Supabase Row Level Security (RLS) governs access to deals, snapshots, events, and share tokens based on `deal_access_grants` (OWNER, VIEWER, COUNTERPARTY roles).
- **Rate Limiting:** In-memory IP rate limiting is implemented for pre-authentication endpoints.

**Feature Specifications:**
- **Homeowner Intake:** Primary data collection form.
- **User Dashboard:** Role-specific content and access to scenarios.
- **Deal Resume:** `POST /api/deals/resume` — Converts marketing drafts into authenticated deals. Always recomputes via `computeDeal` adapter (no canonical passthrough). Creates deal record, OWNER access grant, canonical `FullDealSnapshotV1` snapshot, DEAL_CREATED + DEAL_SNAPSHOT_COMPUTED audit events. Marks draft token as redeemed with conditional `.is("redeemed_at", null)`. Idempotent on already-redeemed tokens (returns existing deal). Returns `{ ok, deal_id, snapshot_id, redirect_url }` with 201.
- **Marketing Lead:** `POST /api/lead` — Marketing-facing adapter that accepts `{ email, home_address, equity_owned, funding_method, sale_timeline }`, constructs a DraftSnapshotV1-compatible payload with stable hashes, mints a draft token, returns `{ ok, token, resumeUrl }`. Includes IP rate limiting.
- **Share Deal:** Enables generation of read-only share links.
- **Snapshot Ingestion:** Allows owners to ingest new snapshots for their deals.
- **Offer/Counter-Offer Creation:** Owners can create OFFER versions; Owners or Counterparties can create COUNTER versions.
- **Accept/Reject Decisions:** Owners can accept or reject specific deal versions, recorded as new ACCEPT/REJECT versions.
- **Snapshot Comparison:** A read-only comparison view at `/deal/[dealId]/compare?a=<id>&b=<id>` shows field-level diffs between two snapshots of the same deal.
- **Historical Snapshot Mode:** Viewing a historical snapshot hides the calculator and shows an amber banner with a "Back to latest" link. Uses `computeHistoricalState` pure helper.
- **Counterparty Counter Flow:** COUNTERPARTY users see the calculator widget on latest snapshot view. Submitting creates a snapshot via `/api/deals/[dealId]/snapshot/propose` (COUNTERPARTY-only), then creates a COUNTER deal_version via existing `/api/deals/[dealId]/counter`. VIEWER never sees calculator. Base snapshot ID auto-selected from current view.
- **Compute Endpoint:** `POST /api/deals/[dealId]/snapshot/compute` — OWNER-only. Accepts `{ inputs }` with `deal_terms` + `scenario`, runs canonical compute via `@fractpath/compute`, persists full snapshot (inputs + outputs with `{ results: DealResults }` + `compute_version`) atomically via `insertDealSnapshot`, records `DEAL_SNAPSHOT_COMPUTED` audit event. Uses `ensureScenario()` for defensive defaults.
- **Fork Endpoint:** `POST /api/deals/[dealId]/fork` — Any authenticated user with read access (VIEWER, COUNTERPARTY) can fork a deal they don't own. Creates a new deal owned by requester, copies latest baseline snapshot, records `DEAL_CREATED` event with fork provenance. OWNER self-fork is blocked (use compute instead).
- **Compute Adapter:** `src/lib/computeAdapter.ts` — Imports `computeDeal` from `@fractpath/compute` (local package at `packages/compute`). Accepts `{ deal_terms, scenario }`, returns `{ ok, result: { compute_version, results } }`. Returns `COMPUTE_FAILED` on invalid inputs.
- **Default Scenario:** `src/lib/defaultScenario.ts` — `getDefaultScenario()` provides baseline `deal_terms` and `scenario` for new deals. `ensureScenario()` defensively injects missing fields to prevent compute failures.
- **Recompute Button:** `src/components/deal/RecomputeSnapshotButton.tsx` — Client component visible to OWNER on latest snapshot. Calls compute endpoint to regenerate snapshot with current inputs.
- **Deal Snapshot View (APP-001):** `src/components/deal/DealSnapshotView.tsx` — Read-only display of canonical snapshot inputs (deal_terms, scenario) and computed results. Server-compatible component.
- **Deal Edit Modal (APP-001):** `src/components/deal/DealEditModal.tsx` — Client component. Modal overlay with form fields for editing deal_terms + scenario. Local state only — does not live-update the read-only view while typing.
- **Deal Detail Widget Panel (APP-001):** `src/components/deal/DealDetailWidgetPanel.tsx` — Client component. Wires DealSnapshotView + "Edit terms" button + DealEditModal. On save: POSTs to `/api/deals/[dealId]/snapshot/compute`, then calls `router.refresh()`. Edit gated to OWNER + non-realtor + latest snapshot only.
- **Version Timeline Cards:** VERSION entries in the timeline render as styled cards with type-specific color badges (Offer=blue, Counter=purple, Accepted=green, Rejected=red), version number, note, timestamp, and compare link when both snapshots exist. SNAPSHOT and EVENT entries retain original rendering.

**Performance & Stability (APP-085 verified):**
- Deal query narrowed to `select("id, owner_user_id, mode")` — no unnecessary column serialization.
- Event payloads excluded from timeline construction (unused by `buildDealTimeline`).
- DealSummary view model pre-computed server-side and passed as lean props — no raw snapshot data in component props.
- Fetch limits enforced: snapshots=20, versions=50, events=50.
- Client/server boundaries verified: DealCalculatorEmbed, ShareDealCard, DealAssumptionsSummary are "use client"; DealSummary, DealKpiCard, DealExitTable, VersionTimelineCard are server components.
- No circular imports detected. No server-only imports in client components.

**Calculator Widget Package (`fractpath-calculator-widget` via Git tag):**
- v1.0.0 built from official GitHub repo (SHA 3ed0ee2b). Contains both compute engine and production React UI components.
- Exports React components: `DealSnapshotView` (read-only KPI strips, equity charts, tabbed detail views), `DealEditModal` (edit form with field validation and preview panels), `DealKpiStrip`, `EquityTransferChart`.
- Exports utilities: `computeScenario`, `normalizeInputs`, `buildChartSeries`, `buildDraftSnapshot`, `buildFullDealSnapshotV1`, `deterministicHash`.
- Types: `DraftCanonicalInputs`, `FullDealSnapshotV1`, `DraftSnapshot`, `CalculatorPersona`, `CalculatorMode`.
- App-side `useDealDraftState` hook (`src/hooks/useDealDraftState.ts`) provides draft/errors/preview state management for DealEditModal (widget's internal hook is not exported).
- `DealDetailWidgetPanel` imports `DealSnapshotView` and `DealEditModal` directly from this package.
- Installed via Git tag: `"fractpath-calculator-widget": "git+https://github.com/fractpath/fractpath-calculator-widget.git#v1.0.3"`.

**Canonical Compute Package (`packages/compute` / `@fractpath/compute`):**
- v10.2.0 canonical compute engine wrapping the widget package.
- Exports `computeDeal(terms: DealTerms, scenario: ScenarioAssumptions)` → `DealResults` with `compute_version: "10.2.0"`.
- Single source of truth for version constants: `packages/compute/src/version.ts` exports `CONTRACT_VERSION` ("10.2.0"), `SCHEMA_VERSION` ("1"), `COMPUTE_VERSION` ("10.2.0"), `ENGINE_VERSION` ("10.2.0").
- App re-exports these via `src/lib/contractVersion.ts` — all route files import from there.
- All new compute flows use this package exclusively; legacy widget patterns purged from production code.
- Sanity guards in view model: IRR clamped to |x| ≤ 1, multiples to 0-10x, all money fields must be finite.

## External Dependencies
- **Next.js:** React framework for server-side rendering and API routes.
- **Supabase:** Provides PostgreSQL database, authentication services, and Row Level Security (RLS).
- **HubSpot:** Integrates for sales follow-up and scenario summary distribution.
- **@fractpath/compute:** Local package providing canonical v10 compute engine (see above).
- **fractpath-calculator-widget:** Local package providing production React UI components + compute engine (see above).