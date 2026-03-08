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
- **Unified Property Form:** A single `PropertyForm` modal handles property addition for both profile and deal contexts, featuring address typeahead and investor/owner toggles.

**Technical Implementations:**
- **Authentication:** Supabase manages user authentication, roles, and metadata.
- **Data Handling:**
    - **DraftSnapshots:** Initial scenario data is captured, validated, and stored verbatim.
    - **Deal Creation:** DraftSnapshots convert to `Deal` objects and `FullDealSnapshotV1` records upon user authentication.
    - **Snapshots:** Calculator snapshots are append-only, immutable, and versioned, ensuring data integrity.
    - **Deal Versions & Events:** Tracks deal changes and maintains an audit trail.
- **Access Control (RLS):** Supabase Row Level Security (RLS) with active-grant checks governs data access based on user roles (OWNER, VIEWER, COUNTERPARTY), ensuring secure and role-appropriate data visibility.
- **Share Link Flow:** Enables generation of shareable URLs for read-only deal viewing with token validation.
- **Rate Limiting:** In-memory IP rate limiting protects pre-authentication endpoints.
- **User Profiles:** Stores user details and marketing preferences.
- **Properties Management:** Handles multiple properties per user with structured address fields, status tracking, and a verification workflow. `normalized_address` serves as the canonical deduplication key.
- **Property Verification Pipeline:** Defines the lifecycle of property statuses (`unverified` → `under_review` → `verified` → `archived`) with admin-controlled transitions and an immutable audit trail.
- **Property Documents:** Stores verification uploads in Supabase Storage with specific access controls and uses signed URLs for viewing.
- **Document Upload Hardening:** Server-side processing enforces file size limits, performs magic-byte content-type sniffing, transcodes images to JPEG, and computes fraud signals.
- **Deal Header Persistence:** `DEAL_HEADER_UPDATED` events in `deal_events` are the canonical source for deal property identity, ensuring data consistency across the application.
- **Deal Page (buyer/participant path):** Loads deal data via RLS and renders `DealHeader`, `DealDetailWidgetPanel`, and `DealActivityFeed`.
- **Feature Specifications:**
    - **Homeowner Intake:** Core data collection form.
    - **User Dashboard:** Role-specific content displaying deal cards and next steps.
    - **Deal Resume:** Converts marketing drafts into authenticated deals.
    - **Marketing Lead:** Endpoint for marketing integrations.
    - **Offer/Counter-Offer/Accept/Reject:** Functionality to manage deal negotiation states, enforcing turn-based actions.
    - **Submit Offer Flow:** Supports direct submission, inviting via email, or outreach.
    - **Counter-Offer Flow:** Creates new proposals from modified terms, updates thread status, and ensures turn-based negotiation.
    - **Snapshot Comparison:** Allows comparison of two snapshots.
    - **Historical Snapshot Mode:** Provides read-only view of past snapshots.
    - **Compute Endpoint:** Handles computation of deal snapshots.
    - **Fork Endpoint:** Allows creation of new deals from existing ones.
    - **Manage Access:** OWNERs can list and revoke access grants with audit logging.
    - **Compute Adapter:** Integrates the `@fractpath/compute` engine for all calculations.
    - **Default Scenario:** Provides baseline `deal_terms` and `scenario` for new deals, merging user inputs with defaults.
    - **Recompute Button:** Enables owners to regenerate snapshots.
    - **Create Deal Flow:** Supports creation of new deals via an authenticated endpoint.
    - **Snapshot KPI Extractor:** Extracts display data from snapshots for UI.
    - **Widget Save Merge:** Merges widget output with existing seed snapshot terms to prevent data regression.
- **Thread owner_user_id Lifecycle:** `owner_user_id` in `deal_threads` is backfilled when the property owner makes an accept/reject decision.
- **Thread Status Values:** Canonical values for `deal_threads.status` are `draft`, `pending_owner`, `negotiating`, `decision_pending`, `accepted`, `closed`. Counter-offers transition threads from `pending_owner` to `negotiating`. Both `pending_owner` and `negotiating` are active negotiation states.
- **Proposal Status Values:** Canonical values for `deal_proposals.status` are: `draft`, `submitted`, `accepted`, `rejected`, `withdrawn`. A `submitted` proposal is the active one. When a counter-offer is sent, the previous proposal is set to `withdrawn` (the CHECK constraint does NOT allow `countered` or `superseded`).
- **Performance & Stability:** Optimized queries, pre-computed view models, and enforced fetch limits.
- **Role Gating:** Centralized authorization ensures role-specific access and UI elements.
- **Calculator Widget Package:** Provides React UI components (`DealSnapshotView`, `DealEditModal`) and utilities.
- **Canonical Compute Package:** The core `@fractpath/compute` engine, serving as the single source of truth for deal calculations and versioning.

## External Dependencies
- **Next.js:** Application framework.
- **Supabase:** Database, authentication, and RLS.
- **HubSpot:** Sales follow-up integration.
- **@fractpath/compute:** Canonical compute engine.
- **fractpath-calculator-widget:** UI components and compute utilities.
- **sharp:** Server-side image processing for document uploads.