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
- **Dashboard Greeting:** Shows user's nickname from profile when available, falls back to persona-based greeting.
- **Address Typeahead Loading:** Shows inline SVG spinner + status text in a fixed-height container during autocomplete API calls, plus "Resolving property…" during property resolution. Shows fallback message on API failure.
- **Login Branding:** Login page displays FractPath logo centered above the form.
- **Page-Level Loading Overlay:** `PageLoadingProvider` in `Providers.tsx` provides `usePageLoading()` hook (`show(msg)` / `hide()`) for async DB-backed actions. Used in RecomputeSnapshotButton, DealDetailWidgetPanel save, SubmitOfferModal submit, and CounterOfferModal counter-offer.
- **Shared Modal Shell:** `Modal` component (`src/components/ui/Modal.tsx`) renders via `createPortal` to `document.body` for reliable full-viewport overlay coverage. Provides consistent overlay/header/body/footer layout with `size` (sm/md/lg) and `footer` props. Used by EditDealNameModal, ArchiveDealModal, ShareDealModal, OwnerDecisionModal, DealTitleModal, SubmitOfferModal, and PropertyCaptureModal.

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
- **Property Documents:** Stores verification uploads in Supabase Storage with specific access controls and uses signed URLs for viewing. Doc types: `selfie`, `drivers_license`, `utility_bill` (one each, unique), and `secured_debt_statement` (multiple allowed per property).
- **Document Upload Hardening:** Server-side processing enforces file size limits, performs magic-byte content-type sniffing, transcodes images to JPEG, and computes fraud signals.
- **Secured Debt Underwriting (Sprint 15):** `properties` table carries private underwriting columns: `has_secured_property_debt`, `secured_property_debt_amount`, `secured_debt_certified_at`, `secured_debt_verification_status` (`pending`/`verified`/`stale`/`not_applicable`), `latest_verified_fmv`, `fmv_verified_at`, `fmv_verification_source`, `ltv_policy_ratio` (default 0.75), `max_accessible_cash_current`. Owners declare secured debt via `PropertyForm` (owner mode) at submission time; debt statement files are uploaded as `secured_debt_statement` docs. `property_underwriting_snapshots` is an append-only table capturing financially material inputs at key lifecycle points (RLS: service-client only). Admin property detail page shows full underwriting panel + snapshot history.
- **Sprint 16 Triage (R3):** `deals` table carries three triage metadata columns: `triage_status` (`ready_for_deposit` / `triage_in_progress` / `more_info_needed` / `ineligible`), `triage_reason_tags` (text[]: `co_owner`, `trust_estate`, `debt_unclear`, `lien_risk`, `value_confidence_low`, `condition_issue`, `taxes_or_judgment_disclosed`, `unusual_property`, `missing_information`, `hard_stop`), and `fmv_plausibility_flag` (`green` / `yellow` / `red`). Triage is evaluated deterministically at offer-acceptance time by `src/lib/dealTriage.ts`, persisted on the deal, and logged to `deal_events` as `DEAL_TRIAGE_READY_FOR_DEPOSIT`, `DEAL_TRIAGE_EVALUATED`, `DEAL_TRIAGE_MORE_INFO_NEEDED`, or `DEAL_TRIAGE_INELIGIBLE`. Triage is orthogonal to property verification status. Internal A/B/C/D labels are never exposed to end users. Admin triage queue at `/admin/deals`. `dealTimeline.ts` maps triage events to neutral user-facing labels.
- **Sprint 16 Intake Fields:** `properties` table carries 16 homeowner-entered pre-review intake columns: `ownership_type`, `occupancy_use`, `occupancy_use_other`, `major_condition_issue`, `major_condition_issue_details`, `known_liens_and_claims` (text[]), `total_known_debt_amount`, `total_known_debt_confidence`, `debt_statement_availability`, `title_claims_known`, `title_claims_details`, `owner_stated_fmv`, `owner_stated_fmv_confidence`, `owner_stated_fmv_source`, `owner_stated_fmv_source_other`, `willing_to_proceed_formal_review`. All nullable with check constraints. Admin-only in projections (excluded from `PublicPropertyShape` and `ClaimablePropertyShape`). Included in `HomeownerPropertyShape` for edit-mode reload via API fetch in `PropertyForm`. `PropertyForm` (owner mode) collects all fields with conditional display logic. POST and PATCH property routes persist all intake fields. Admin property detail page shows a "Homeowner intake (Sprint 16)" panel when any field is populated.
- **Property Data Projections:** `src/lib/property/projections.ts` enforces three tiers: `PublicPropertyShape` (buyer-facing, 4 fields only), `HomeownerPropertyShape` (owner's own properties, includes debt declaration status but not LTV/FMV/max-cash outputs), `ClaimablePropertyShape` (cross-user claimable, no underwriting data). `GET /api/me/properties` uses `OWNED_SELECT` (includes homeowner debt fields) for own properties and `CLAIMABLE_SELECT` (no underwriting) for cross-user claimable properties. `GET /api/properties/[propertyId]` projects through `toPublicProperty()`.
- **Deal Header Persistence:** `DEAL_HEADER_UPDATED` events in `deal_events` are the canonical source for deal property identity, ensuring data consistency across the application.
- **Deal Page (buyer/participant path):** Loads deal data via RLS and renders `DealHeader`, `DealDetailWidgetPanel`, and `DealActivityFeed`.
- **Feature Specifications:**
    - **Homeowner Intake:** Core data collection form.
    - **User Dashboard:** Role-specific content displaying deal cards and next steps.
    - **Deal Resume:** Converts marketing drafts into authenticated deals.
    - **Marketing Lead:** Endpoint for marketing integrations.
    - **Offer/Counter-Offer/Accept/Reject:** Functionality to manage deal negotiation states, enforcing turn-based actions.
    - **Transactional Email:** `sendTemplateEmail` (`src/lib/email/sendTemplateEmail.ts`) sends HTML emails via Resend API with inline-generated content from template variables. Logs `resend_send_attempt` (with redacted URLs) and `resend_send_ok`/`resend_send_error`. Used by offer-submitted, offer-accepted, offer-rejected, and deal-shared flows. `sendShareLinkEmail` is a re-export alias.
    - **Submit Offer Flow:** Supports direct submission, inviting via email, or outreach.
    - **Counter-Offer Flow:** Creates new proposals from modified terms, updates thread status, and ensures turn-based negotiation.
    - **Snapshot Comparison:** Allows comparison of two snapshots.
    - **Historical Snapshot Mode:** Provides read-only view of past snapshots.
    - **Compute Endpoint:** Handles computation of deal snapshots.
    - **Fork Endpoint:** Allows creation of new deals from existing ones.
    - **Manage Access:** OWNERs can list and revoke access grants with audit logging.
    - **Compute Adapter:** Calls `computeDeal` from `@fractpath/compute` directly (resolved via webpack alias to `fractpath-calculator-widget/packages/compute/dist`). Previous adapter used the marketing `computeScenario` function which had a materially different economic model. All routes use the canonical v10.2 engine.
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
- **Calculator Widget Package:** Provides React UI components (`DealSnapshotView`, `DealEditModal`) and utilities. Note: the exported `DealEditModal` is a raw controlled component expecting `(draft, errors, preview, setField, onBlurCompute, onSave, onClose)`. The app's `useDealDraftState` hook (`src/lib/useDealDraftState.ts`) manages draft state and provides these props, replicating the widget's internal `EditModalMount` pattern.
- **Canonical Compute Package:** The core `@fractpath/compute` engine, serving as the single source of truth for deal calculations and versioning.

## External Dependencies
- **Next.js:** Application framework.
- **Supabase:** Database, authentication, and RLS.
- **HubSpot:** Sales follow-up integration.
- **@fractpath/compute:** Canonical compute engine.
- **fractpath-calculator-widget:** UI components and compute utilities.
- **sharp:** Server-side image processing for document uploads.
- **DocuSign (scaffolding only):** Server-side JWT auth and API client in `src/lib/docusign/`. Health check at `GET /api/admin/docusign/health` (admin-gated). Env vars: `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_BASE_PATH`, `DOCUSIGN_AUTH_SERVER`, `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_PRIVATE_KEY`, `DOCUSIGN_ENV`. No envelope/webhook/UI logic yet.