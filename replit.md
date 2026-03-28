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
- **Unified Property Form:** A single `PropertyForm` modal handles property addition for both profile and deal contexts.
- **Page-Level Loading Overlay:** Provides a `usePageLoading()` hook for async DB-backed actions.
- **Shared Modal Shell:** `Modal` component renders via `createPortal` for consistent overlay/header/body/footer layout.

**Technical Implementations:**
- **Authentication:** Supabase manages user authentication, roles, and metadata.
- **Data Handling:** DraftSnapshots are captured, validated, and stored. They convert to `Deal` objects and `FullDealSnapshotV1` records upon authentication. Calculator snapshots are append-only, immutable, and versioned.
- **Access Control (RLS):** Supabase Row Level Security (RLS) with active-grant checks governs data access based on user roles.
- **Share Link Flow:** Enables generation of shareable URLs for read-only deal viewing with token validation.
- **Rate Limiting:** In-memory IP rate limiting protects pre-authentication endpoints.
- **Properties Management:** Handles multiple properties per user with structured address fields, status tracking, and a verification workflow. `normalized_address` serves as the canonical deduplication key.
- **Property Verification Pipeline:** Defines the lifecycle of property statuses (`unverified` → `under_review` → `verified` → `archived`) with admin-controlled transitions and an immutable audit trail.
- **Property Documents:** Stores verification uploads in Supabase Storage with specific access controls and uses signed URLs for viewing. Server-side processing enforces file size limits, performs content-type sniffing, transcodes images, and computes fraud signals.
- **Secured Debt Underwriting:** `properties` table carries private underwriting columns related to secured property debt and fair market value (FMV). Owners declare secured debt via `PropertyForm`. `property_underwriting_snapshots` is an append-only table.
- **Deal Triage:** `deals` table carries triage metadata columns (`triage_status`, `triage_reason_tags`, `fmv_plausibility_flag`). Triage is evaluated deterministically at offer-acceptance time.
- **Homeowner Intake Fields:** `properties` table carries 16 homeowner-entered pre-review intake columns related to property details, condition, debt, and title claims.
- **Property Data Projections:** `src/lib/property/projections.ts` enforces three tiers of data visibility: `PublicPropertyShape`, `HomeownerPropertyShape`, and `ClaimablePropertyShape`.
- **Deal Header Persistence:** `DEAL_HEADER_UPDATED` events in `deal_events` ensure data consistency for deal property identity.
- **Feature Specifications:**
    - **Homeowner Intake:** Core data collection form.
    - **User Dashboard:** Role-specific content displaying deal cards and next steps.
    - **Deal Resume:** Converts marketing drafts into authenticated deals.
    - **Offer/Counter-Offer/Accept/Reject:** Functionality to manage deal negotiation states with turn-based actions.
    - **Transactional Email:** `sendTemplateEmail` sends HTML emails via Resend API, logging attempts and outcomes.
    - **Submit Offer Flow:** Supports direct submission, inviting via email, or outreach.
    - **Counter-Offer Flow:** Creates new proposals from modified terms, updates thread status, and ensures turn-based negotiation.
    - **Compute Endpoint:** Handles computation of deal snapshots using the canonical v10.2 engine.
    - **Fork Endpoint:** Allows creation of new deals from existing ones.
    - **Manage Access:** Owners can list and revoke access grants with audit logging.
    - **Recompute Button:** Enables owners to regenerate snapshots.
    - **Create Deal Flow:** Supports creation of new deals via an authenticated endpoint.
    - **Deal Review Request Workflow:** Manages structured missing-information requests for deals and properties, with admin and homeowner interfaces.
    - **Escalation Simulation:** `AdminEscalationSimPanel` simulates enhanced review deposit (`escalation_deposit_status`) and AVM (`escalation_avm_status`) workflows on the admin property page. AVM completion writes to `property_review_summary` and mirrors onto `properties.latest_verified_fmv`.
    - **Closing Review Workflow:** `AdminPropertyClosingPanel` manages property closing stages 7-9 (`closing_review_status`: pending/issue_found/ready). Route: `POST /api/admin/properties/[propertyId]/closing-review`. Logs to `property_status_audit`. Triggers customer notifications via `notifyMilestoneForProperty`.
    - **Deal Close & Servicing Workflow:** `AdminDealServicingPanel` manages deal stages 14-16 (close thread, `servicing_status`: active/issue). Routes: `POST /api/admin/deals/[dealId]/close` and `POST /api/admin/deals/[dealId]/servicing`. Logs `DEAL_WORKFLOW_STAGE_CHANGED` to `deal_events`. Triggers notifications via `notifyMilestoneForDeal`.
    - **Milestone Derivation:** `src/lib/workflow/milestones.ts` defines 16 simplified stages (1-9 property-owned, 10-16 deal-owned), a `deriveWorkflowStage` function, and `CUSTOMER_MILESTONES` for end-user display.
    - **Milestone Notifications:** `src/lib/workflow/notifyMilestone.ts` sends inline HTML emails via Resend and logs `DEAL_WORKFLOW_NOTIFICATION_SENT` events to `deal_events`. Resolves owner contact from thread→auth→profile. Non-blocking (errors are logged, not propagated).
    - **DealMilestoneTracker:** Customer-facing `src/components/deal/DealMilestoneTracker.tsx` shows plain-language progress milestones on the homeowner deal page. Only renders when current stage has a customer-visible label. Uses `CUSTOMER_MILESTONES` to mark completed/current/upcoming states.
- **Thread Status Values:** Canonical values for `deal_threads.status` are `draft`, `pending_owner`, `negotiating`, `decision_pending`, `accepted`, `closed`.
- **Proposal Status Values:** Canonical values for `deal_proposals.status` are: `draft`, `submitted`, `accepted`, `rejected`, `withdrawn`.
- **Calculator Widget Package:** Provides React UI components (`DealSnapshotView`, `DealEditModal`) and utilities.
- **Canonical Compute Package:** The core `@fractpath/compute` engine, serving as the single source of truth for deal calculations and versioning.

## External Dependencies
- **Next.js:** Application framework.
- **Supabase:** Database, authentication, and RLS.
- **HubSpot:** Sales follow-up integration.
- **@fractpath/compute:** Canonical compute engine.
- **fractpath-calculator-widget:** UI components and compute utilities.
- **sharp:** Server-side image processing for document uploads.
- **DocuSign (scaffolding only):** Server-side JWT auth and API client.