# FractPath

## Overview
FractPath is a Next.js application designed to streamline homeowner engagement by collecting exploratory scenario information and providing a deterministic, non-binding summary. This summary is then integrated with HubSpot for sales follow-up. The platform features Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), a user dashboard, and a deal resume flow that converts marketing DraftSnapshots into authenticated deals with immutable calculator snapshots. It also includes a share-link capability for read-only deal viewing. The project's vision is to generate qualified sales opportunities through clear and non-committal exploratory tools.

## User Preferences
- Language must be neutral and exploratory (no deal/commitment language in user-facing copy)
- DraftSnapshot inputs/results are stored verbatim — no recomputation or normalization
- Calculator snapshots are immutable and append-only
- Errors must be explicit and blocking (fail-closed)

## System Architecture
FractPath is built with Next.js, leveraging API routes for backend logic and Supabase for database and authentication.

**UI/UX Decisions:**
- **Role-based Onboarding:** User experience adapts based on selected role during signup.
- **Deal Viewing:** Emphasizes immutable calculator snapshots and an audit trail, with share links providing read-only access.
- **Snapshot History:** Navigable multiple snapshots for a deal with an option to revert to the latest.

**Technical Implementations:**
- **Authentication:** Supabase manages user authentication, roles, and metadata.
- **Data Handling:**
    - **DraftSnapshots:** Initial scenario data is captured, validated, and stored without recomputation.
    - **Deal Creation:** DraftSnapshots convert to `Deal` objects and `FullDealSnapshotV1` records upon user authentication.
    - **Snapshots:** Calculator snapshots are append-only, immutable, and versioned.
    - **Deal Versions & Events:** Tracks deal changes and maintains an audit trail of activities.
- **Share Link Flow:** Enables generation of shareable URLs for read-only deal viewing with token validation and access management. Uses `mint_deal_share_token_v2` / `redeem_deal_share_token_v2` RPCs (migration-managed as of Sprint 11.5).
- **Access Control (RLS):** Supabase Row Level Security governs access to data based on user roles (OWNER, VIEWER, COUNTERPARTY). All deal-related RLS policies (deals, deal_snapshots, deal_events, deal_versions) enforce active-grant checks: `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`. The `deal_access_grants` table includes `revoked_at` and `expires_at` columns (Sprint 12). App-side queries also filter `revoked_at IS NULL` as belt-and-suspenders.
- **Rate Limiting:** In-memory IP rate limiting protects pre-authentication endpoints.
- **User Profiles:** Stores user details, marketing preferences, and EULA acceptance.
- **Properties:** Manages multiple properties per user with structured address fields (`address_line1`, `address_line2`, `city`, `state`, `postal_code`), status tracking, and verification workflow. Properties table uses `owner_user_id` (not `client_id`) and `is_private` boolean. Sprint 12 adds `normalized_address` (partial unique index), `ownership_status` (unclaimed/claimed/verified), `created_by_user_id`, `claimed_by_user_id`, `last_activity_at` for address convergence. `POST /api/properties/resolve` does get-or-create by normalized address (service-role, race-safe via unique index conflict handling).
- **Property Verification Pipeline:** Defines the lifecycle of property statuses (`unverified` → `under_review` → `verified` → `archived`) with admin-controlled transitions and an immutable audit trail.
- **Property Documents:** `property_documents` table stores verification uploads (selfie, drivers_license, utility_bill) with references to Supabase Storage bucket `property-verification`. Files stored at path `{user_id}/{property_id}/{doc_type}.{ext}`. RLS allows owner read/insert/update only when property is unverified. Admin access via service-role client. Signed URLs (10 min TTL) used for viewing. Meta columns: `byte_size`, `sha256`, `width`, `height`, `original_content_type`, `phash` (all nullable).
- **Document Upload Hardening:** Server-side pipeline via `src/lib/uploads/documentProcessing.ts`. Enforces 12MB max per file (413), magic-byte content-type sniffing (rejects HEIC/HEIF with 415, rejects unknown types), transcodes all images (JPEG/PNG/WebP) to JPEG via `sharp` (rotates per EXIF, max 2400px long edge, quality 82, strips metadata). PDFs pass through as-is. Computes fraud signals (sha256, byte_size, width, height) and persists to `property_documents`. Original untrusted bytes are never stored.
- **Add Property Flow (Sprint 13 unified):** Single `PropertyForm` modal used by both Profile (`context="profile"`) and Deal header (`context="deal"`). Features Geoapify `AddressTypeahead` (min 4 chars, 350ms debounce, AbortController, max 6 suggestions, lock-on-select), Investor/Owner segmented toggle (Investor hides doc uploads, Owner shows them), and stateful resolve status messaging (verified/unclaimed/pending/added/blocked). Resolve endpoint (`POST /api/properties/resolve`) returns `property_exists`, `has_blocking_deal`, `blocking_reason` flags by checking `deal_threads`. Edit flow (PATCH) allowed only for unverified properties. Archive allowed for unverified and verified.
- **Address Identity (Sprint 0 stabilization):** `normalized_address` is the canonical dedup key (partial unique index on `properties`). Geoapify autocomplete returns structured fields (`address_line1`, `city`, `state`, `state_code`, `postal_code`) which flow through `AddressTypeahead` → resolve endpoint → `getOrCreatePropertyByAddress`. All property creation paths (resolve, owner form POST, edit PATCH) compute and store `normalized_address`. PropertyForm populates edit fields from server-returned structured data, not client-side string parsing. Purge script at `scripts/purge-test-data.sql` clears all lifecycle/property data (uses TRUNCATE CASCADE for immutable tables).
- **Deal Header Persistence:** `DealHeader` persists title + property to server via `PATCH /api/deals/[dealId]/header` (stores as `DEAL_HEADER_UPDATED` deal_event, auth via `deal_access_grants` OWNER role). Additionally, header data (title, display_address, property_id, property_status, ownership_status) is written into `snapshot_json.meta.header` on every snapshot POST/compute/create. Client-side callers (DealDetailWidgetPanel, RecomputeSnapshotButton, NewDealClient) read header from localStorage and include it in snapshot payloads. Deal page uses deal_events header as primary source (fallback: snapshot header), ensuring shared/read-only mode displays persisted title + property without relying on localStorage. Dashboard deal cards read from `snapshot_json.meta.header` for title and address display.
- **Deal Page (buyer/participant path):** `src/app/deal/[dealId]/page.tsx` first loads deal via user's Supabase client (RLS-gated by `deal_access_grants`). If found, renders full workspace: `DealHeader` (with server-fetched title/property from DEAL_HEADER_UPDATED events), `DealDetailWidgetPanel` (latest snapshot), `DealActivityFeed` (deal events). Owner fallback path (via thread+property chain) still exists for property owners not yet granted direct access.
- **Feature Specifications:**
    - **Homeowner Intake:** Core data collection form.
    - **User Dashboard:** Role-specific content displaying deal cards and next steps.
    - **Deal Resume:** Converts marketing drafts into authenticated deals, generating initial snapshots and audit events.
    - **Marketing Lead:** Endpoint for marketing integrations to create draft snapshots.
    - **Offer/Counter-Offer/Accept/Reject:** Functionality to manage deal negotiation states.
    - **Submit Offer Flow (Sprint 13):** Deal page detects active threads (status=pending_owner) and locks calculator editing. `SubmitOfferModal` supports three modes: verified_owner (direct submit), known_email (invite via email), outreach (FractPath finds owner). `POST /api/deals/[dealId]/submit-offer` creates thread + proposal + optional invite atomically (with cleanup on failure). `ActiveThreadBanner` shows locking message with withdraw button. `POST /api/threads/[threadId]/withdraw` sets status to withdrawn (buyer-only). `GET /api/properties/[propertyId]` returns property status/owner info for modal lookups.
    - **Snapshot Comparison:** Allows comparison of two snapshots of the same deal.
    - **Historical Snapshot Mode:** Provides read-only view of past snapshots.
    - **Compute Endpoint:** Handles computation of deal snapshots for owners.
    - **Fork Endpoint:** Allows users with read access to create a new deal based on an existing one.
    - **Manage Access:** OWNER can list active grants, revoke VIEWER/COUNTERPARTY grants, with audit logging via deal_events (ACCESS_REVOKED).
    - **Compute Adapter:** Integrates the canonical `@fractpath/compute` engine for all calculations.
    - **Default Scenario:** Provides baseline `deal_terms` and `scenario` for new deals.
    - **Recompute Button:** Enables owners to regenerate snapshots with current inputs.
    - **Create Deal Flow:** Supports creation of new deals via an authenticated endpoint and dedicated page.
    - **Snapshot KPI Extractor:** Extracts display data from snapshots for UI components.
- **Property Identity Consistency:** The canonical property_id for any offer/deal/thread is `deal_threads.property_id`. Dashboard cards derive title/address from `DEAL_HEADER_UPDATED` deal_events (canonical), falling back to `snapshot_json.meta.header` (may be stale from localStorage). Deal page SSR queries live property status from the `properties` table, overriding cached snapshot/event status values. Verification gating always reads live `properties.status` via service client. Snapshot headers should NOT be trusted for property identity — they reflect localStorage state at snapshot creation time.
- **Thread owner_user_id Lifecycle:** In `known_email`/`outreach` modes, `deal_threads.owner_user_id` is NULL at creation. It is backfilled to the acting user's ID when the property owner makes an accept/reject decision via `POST /api/proposals/[proposalId]/owner-decision`. Dashboard queries for owner-side threads (pending, accepted) join through `properties.owner_user_id` to find threads even when `deal_threads.owner_user_id` is NULL.
- **Thread Status Values:** Canonical allowed values for `deal_threads.status` are: `draft`, `pending_owner`, `negotiating`, `decision_pending`, `accepted`, `closed`. The value `declined` is NOT valid — rejection uses `closed`.
- **Performance & Stability:** Optimized deal queries, pre-computed view models, enforced fetch limits, and verified client/server boundaries.
- **Role Gating:** Centralized authorization ensures role-specific access and UI elements, particularly restricting 'realtor' persona to view-only.
- **Calculator Widget Package:** Provides React UI components (`DealSnapshotView`, `DealEditModal`) and utilities for snapshot building.
- **Canonical Compute Package:** The core `@fractpath/compute` engine, serving as the single source of truth for deal calculations and versioning.

## External Dependencies
- **Next.js:** Framework for the application.
- **Supabase:** Database, authentication, and RLS.
- **HubSpot:** Integration for sales follow-up.
- **@fractpath/compute:** Canonical compute engine package.
- **fractpath-calculator-widget:** UI components and compute utilities package.
- **sharp:** Server-side image processing for document upload hardening (EXIF rotation, resize, JPEG transcode, metadata stripping).

## Coding Conventions
- **Route Handler Params (Next.js 16):** All API route handlers in `src/app/api/**/route.ts` MUST use the Promise params pattern: `ctx: { params: Promise<{ key: string }> }` with `const { key } = await ctx.params;`. Do NOT use the non-Promise `{ params }: { params: { key: string } }` pattern — it does not compile in Next.js 16. Run `npm run lint:route-params` to verify compliance.