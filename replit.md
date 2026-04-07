# FractPath

## Overview
FractPath is a Next.js application designed to engage homeowners by collecting exploratory scenario information and providing deterministic, non-binding summaries. These summaries integrate with HubSpot for sales follow-up, generating qualified sales opportunities. The platform features Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), a user dashboard, and a deal resume flow that converts marketing DraftSnapshots into authenticated deals with immutable calculator snapshots. It also includes a share-link capability for read-only deal viewing.

## User Preferences
- Language must be neutral and exploratory (no deal/commitment language in user-facing copy)
- DraftSnapshot inputs/results are stored verbatim — no recomputation or normalization
- Calculator snapshots are immutable and append-only
- Errors must be explicit and blocking (fail-closed)

## System Architecture
FractPath is built with Next.js, utilizing API routes for backend logic and Supabase for database and authentication.

**UI/UX Decisions:**
- **Role-based Onboarding:** User experience adapts based on selected role during signup.
- **Deal Viewing:** Emphasizes immutable calculator snapshots and an audit trail, with share links providing read-only access.
- **Unified Property Form:** A single modal handles property addition for both profile and deal contexts.
- **Page-Level Loading Overlay:** Provides a hook for async DB-backed actions.
- **Shared Modal Shell:** Consistent overlay/header/body/footer layout for modals.

**Technical Implementations:**
- **Authentication:** Supabase manages user authentication, roles, and metadata.
- **Data Handling:** DraftSnapshots are captured, validated, and stored, converting to `Deal` objects and immutable `FullDealSnapshotV1` records upon authentication. Calculator snapshots are append-only and versioned.
- **Access Control (RLS):** Supabase Row Level Security (RLS) with active-grant checks governs data access.
- **Share Link Flow:** Enables generation of shareable URLs for read-only deal viewing with token validation.
- **Rate Limiting:** In-memory IP rate limiting protects pre-authentication endpoints.
- **Properties Management:** Handles multiple properties per user with structured address fields, status tracking, and a verification workflow using `normalized_address` for deduplication.
- **Property Verification Pipeline:** Defines the lifecycle of property statuses (`unverified` → `under_review` → `verified` → `archived`) with admin control and an immutable audit trail.
- **Property Documents:** Stores verification uploads in Supabase Storage with signed URLs, server-side processing for file size, content-type sniffing, image transcoding, and fraud signal computation.
- **Secured Debt Underwriting:** `properties` table carries private underwriting columns related to secured property debt and fair market value (FMV). Owners declare secured debt via `PropertyForm`, and `property_underwriting_snapshots` is an append-only table.
- **Deal Triage:** `deals` table carries triage metadata columns (`triage_status`, `triage_reason_tags`, `fmv_plausibility_flag`), evaluated deterministically at offer-acceptance time.
- **Homeowner Intake Fields:** `properties` table carries 16 homeowner-entered pre-review intake columns.
- **Property Data Projections:** Enforces three tiers of data visibility: `PublicPropertyShape`, `HomeownerPropertyShape`, and `ClaimablePropertyShape`.
- **Deal Header Persistence:** `DEAL_HEADER_UPDATED` events ensure data consistency for deal property identity.
- **Feature Specifications:**
    - **Homeowner Intake:** Core data collection form.
    - **User Dashboard:** Role-specific content displaying deal cards and next steps.
    - **Deal Resume:** Converts marketing drafts into authenticated deals.
    - **Offer/Counter-Offer/Accept/Reject:** Functionality for managing deal negotiation states.
    - **Transactional Email:** Sends HTML emails via Resend API, logging attempts and outcomes.
    - **Compute Endpoint:** Handles computation of deal snapshots using the canonical engine.
    - **Fork Endpoint:** Allows creation of new deals from existing ones.
    - **Manage Access:** Owners can list and revoke access grants with audit logging.
    - **Deal Review Request Workflow:** Manages structured missing-information requests.
    - **Escalation Simulation:** Simulates enhanced review deposit and AVM workflows on the admin property page.
    - **Owner-Facing Valuation UI:** Renders distinct valuation sections with live state badges and owner-initiated request buttons.
    - **Property Activity Timeline:** Displays property status audit entries as a chronological timeline.
    - **Ineligible Deal Blocks:** Provides UI for renegotiation and appraisal challenge CTAs when deals are ineligible.
    - **Closing Review Workflow:** Manages property closing stages.
    - **Deal Close & Servicing Workflow:** Manages deal stages, including close thread and servicing status.
    - **Milestone Derivation:** Defines 16 simplified stages and a `deriveWorkflowStage` function for user and admin display.
    - **Milestone Notifications:** Sends inline HTML emails via Resend for workflow milestones.
    - **DealMilestoneTracker:** Customer-facing progress milestones on the homeowner deal page.
    - **Canonical Lifecycle Engine:** Single source of truth for workflow status, returning detailed `CanonicalLifecycleResult`.
    - **Admin Control Tower Panels:** Unified stage badge, blocker, next action, and owning surface derived from the canonical lifecycle on admin pages.
    - **Customer Hero Status:** Homeowner deal page displays a hero status card with current milestone label and description.
- **Thread Status Values:** Canonical values for `deal_threads.status` are `draft`, `pending_owner`, `negotiating`, `decision_pending`, `accepted`, `closed`.
- **Proposal Status Values:** Canonical values for `deal_proposals.status` are: `draft`, `submitted`, `accepted`, `rejected`, `withdrawn`.
- **Contract Versioning:** `CONTRACT_VERSION` and `SCHEMA_VERSION` are stamped at snapshot persistence boundaries.
- **Deal Terms Modal (custom):** `src/components/deal/DealTermsModal.tsx` — custom 4-tab modal (Payments, Exit Terms, Assumptions, Fees) replacing the opaque `DealEditModal` from the `fractpath-calculator-widget` package. Exit Terms tab shows editable minimum hold (default 1 yr) and expected exit timing, plus static fixed extension structure (1st: 12 mo / 6%, 2nd: 12 mo / 12%), contract maturity language with explicit buyout alternative, and a dynamic "What this means" section. Both `DealWidgetShell` and `CounterOfferModal` use this modal. Extension windows are auto-derived from `target_exit_window_end_year` when not explicitly stored in deal terms.
- **Calculator Widget Package:** Provides React UI components and utilities.
- **Canonical Compute Package:** The core `@fractpath/compute` engine for deal calculations and versioning.
- **ATTOM Enhanced Screening:** Orchestrates ATTOM API calls for property screening, normalizing results, and applying canonical fields to properties.
- **Proposal Preferences:** `properties` table carries `proposal_interest_status`, `visibility_preference`, and `proposal_preferences_acknowledged_at`.
- **ATTOM Always Controlling Policy (T001):** AVM value unconditionally controls the `becameControlling` flag.
- **Debt Basis Management (T002/T004):** `properties` table carries `current_controlling_secured_debt_basis`, `current_controlling_secured_debt_amount`, `secured_debt_basis_reason`, `secured_debt_basis_updated_at`, with an admin panel to adopt an authoritative debt basis.
- **Manual Appraisal Reframe (T003):** Relabeling of escalation panels to manual appraisal payment/result.
- **Ineligible Owner UX Dedup (T005):** Consolidates counter-offer UI within the `IneligibleDealOwnerBlock`.
- **Owner Debt Challenge (T007):** Allows owners to submit a plain-text statement to the review team regarding debt discrepancies.
- **`liveIneligiblePhase` fix:** Correctly derives `liveIneligiblePhase` when ATTOM or manual appraisal is the controlling basis.
- **Notification Audit:** Documentation of all customer-facing notifications.
- **Mashvisor Enrichment System:** `property_enrichments` table stores `raw_payload`, `summary_payload`, `images_payload` per property+provider. Admin-gated `POST /api/admin/properties/[propertyId]/review/fetch-mashvisor` writes current enrichment row (partial unique index on property+provider+is_current).
- **Shared Enriched Property Preview:** `src/components/property/EnrichedPropertyPreview.tsx` — audience-aware (`"admin" | "owner" | "buyer"`) shared component rendering cover image, gallery strip, stats (beds/baths/sqft/source value), and address from stored enrichment. Admin sees provider ID, image count, fetched timestamp. Owner sees fetched timestamp. Buyer sees only the property preview — no provider branding, no internal IDs. `AdminMashvisorPanel` delegates its preview section to this shared component. Owner property page and deal page (both server paths) query enrichment non-fatally and render the shared preview. Falls back cleanly when no enrichment exists.
- **Gallery Lightbox (prev/next):** `src/components/admin/Lightbox.tsx` extended with gallery mode (`images[]`, `index`, `onNavigate` props); keyboard ←/→ navigation and on-screen prev/next buttons. Original single-image API remains backward-compatible via discriminated union.
- **Buyer-Facing Discovery Page (`/open-to-deals`):** Shows verified public-visibility properties with enrichment thumbnail, beds/baths/sqft/value_estimate stats, prominent Verified + Open to Deals badges, and a View Opportunity CTA. Enrichment fetched via batch query (no Mashvisor API calls at render time). Falls back gracefully when no enrichment exists. No owner private details, no provider branding, no internal IDs exposed to buyers.
- **CTA Cleanup (DealActionsBar / DealPageShell):** Submit Offer and Share buttons are hidden (not disabled) when `locked=true` (offer already submitted or thread active). Owner homeowners see Accept/Decline buttons in the top-right CTA bar when their thread is `pending_owner` and the proposal is `submitted`. Owner proposal ID and status are passed from both deal page paths to `DealPageShell` and on to `DealActionsBar`.
- **Badge Upgrades:** Verified badge now uses `emerald-100/emerald-800` with a circular checkmark SVG icon and `border border-emerald-200`. "Open to Deals" secondary badge shown on verified + interested properties. Consistent across `PropertyList` list cards and the discovery page.
- **PropertyList Thumbnail:** `GET /api/me/properties` batch-fetches `cover_image_url` from `property_enrichments` (non-fatally) and merges it into property rows. `PropertyList` renders a 64×96px thumbnail when `cover_image_url` is available.
- **Three-Lane Property Status (`PropertyStatusLanes`):** `src/lib/property/statusLanes.ts` provides pure derivation functions for three property status lanes: Participation (from `properties.status`), Valuation (from AVM/ATTOM/appraisal fields), and Closing Readiness (from `property_review_status` + accepted-deal flag; always "Not started" pre-acceptance). `src/components/properties/PropertyStatusLanes.tsx` is the shared display component rendering these lanes with tooltips. Used on admin property detail (replaces the contradictory "Verification status: verified + Under review" block), owner property detail (after the summary card), and public property detail (two-lane: Participation + Valuation only, `showClosingReadiness={false}`). `PropertyWorkflowWidget` fixed: `propertyStatus === 'verified'` check now comes first so a stale `property_review_status=under_review` no longer overrides it with a contradictory "Under review" card.

## External Dependencies
- **Next.js:** Application framework.
- **Supabase:** Database, authentication, and RLS.
- **HubSpot:** Sales follow-up integration.
- **@fractpath/compute:** Canonical compute engine.
- **fractpath-calculator-widget:** UI components and compute utilities.
- **sharp:** Server-side image processing for document uploads.
- **DocuSign:** Server-side JWT auth and API client (scaffolding only).