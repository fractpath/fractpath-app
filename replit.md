# FractPath

## Overview
FractPath is a Next.js application designed to engage homeowners by collecting exploratory scenario information and providing deterministic, non-binding summaries. These summaries integrate with HubSpot for sales follow-up, generating qualified sales opportunities. The platform features Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), a user dashboard, and a deal resume flow that converts marketing DraftSnapshots into authenticated deals with immutable calculator snapshots. It also includes a share-link capability for read-only deal viewing. The project's vision is to streamline property transaction processes, enhance user engagement through clear, non-committal informational summaries, and efficiently generate qualified leads for sales teams, ultimately transforming how homeowners explore their property options.

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
- **Shared Modal Shell:** Consistent overlay/header/body/footer layout for modals.
- **Enriched Property Preview:** A shared, audience-aware component for displaying property details, including images, stats, and address, with graceful fallback for missing enrichment data.
- **Buyer-Facing Discovery Page:** Displays verified, public-visibility properties with enrichment thumbnails, key stats, and clear CTAs, without exposing private owner details or internal IDs.

**Technical Implementations:**
- **Authentication & Authorization:** Supabase manages user authentication, roles, and metadata, with Row Level Security (RLS) governing data access.
- **Data Handling:** DraftSnapshots are captured, validated, and stored, converting to `Deal` objects and immutable `FullDealSnapshotV1` records upon authentication. Calculator snapshots are append-only and versioned.
- **Properties Management:** Supports multiple properties per user, with structured address fields, status tracking, and a verification workflow using `normalized_address` for deduplication.
- **Property Documents:** Stores verification uploads in Supabase Storage with signed URLs, server-side processing for file size, content-type sniffing, image transcoding, and fraud signal computation.
- **Secured Debt Underwriting:** `properties` table carries private underwriting columns for secured property debt and fair market value (FMV). Owners declare secured debt, and `property_underwriting_snapshots` is an append-only table.
- **Deal Triage:** `deals` table carries triage metadata columns (`triage_status`, `triage_reason_tags`, `fmv_plausibility_flag`), evaluated deterministically at offer-acceptance time.
- **Canonical Lifecycle Engine:** A single source of truth for workflow status, returning detailed `CanonicalLifecycleResult` to drive user and admin displays.
- **Milestone Tracking & Notifications:** Defines simplified stages for customer-facing progress and sends inline HTML emails via Resend for workflow milestones.
- **Contract Versioning:** `CONTRACT_VERSION` and `SCHEMA_VERSION` are stamped at snapshot persistence boundaries.
- **Property Enrichment:** Integrates with third-party providers (Mashvisor, RentCast) to enrich property data, storing raw and summarized payloads in `property_enrichments`.
- **RentCast Facts Migration (Phase 2/3):** `PropertyFacts` type (`src/lib/property/propertyFacts.ts`) drives address/beds/baths/sqft/lot/year display across owner, public, admin pages from persisted `property_review_runs` rows. `PropertyAvm` and `PropertyReviewedBasis` types added; `EnrichedPropertyPreview` redesigned with hero → address → facts row → value section (AVM estimate + range + reviewed basis) → gallery → admin metadata. `valuationLabel` deprecated.
- **Full RentCast Property Record (Phase 4):** `RentcastPropertyRecord` expanded with HOA, features, taxAssessments, propertyTaxes, history, assessorID, legalDescription, subdivision, zoning. `NormalizedPropertyProfile` and `normalizeRentcastPropertyProfile()` updated to persist all fields. `PropertyRecord` display type (`src/lib/property/propertyRecord.ts`) with `rentcastRecordToPropertyRecord()` and `normalizedProfileToRecord()` converters. `PropertyRecordSections` server component renders Property overview tiles (beds/baths/sqft/lot/year), Property Details, Home Features, Sale History, Tax & Assessment History sections. Wired into owner, public, and admin pages from `property_review_runs.normalized_payload` (sole canonical source). No new external API calls at render time.
- **Property Status Lanes:** Provides pure derivation functions for three property status lanes: Participation, Valuation, and Closing Readiness, displayed consistently across admin, owner, and public interfaces.
- **Phase 4 Full Redesign:** Unified property page layout across all three surfaces. `PropertyPageHeader` — H1 address + badge row (Status, Owner Verified, Appraisal) with tooltip states. `PropertyHeroMedia` — hero image carousel or map-fallback for owner, public, and admin audiences. `ValuationCashSection` — tabbed client component (RentCast / ATTOM review / Manual appraisal) with summary tiles (Estimated value, Range, Reviewed basis, Secured debt, Eligible cash); audience-aware (buyer hides debt/cash; admin shows secured debt). `PropertyDetailClient` gains `hideAddressCard`, `hideWorkflowWidget`, `hideValuationCards` suppression props. `PropertyRecordSections` `PropertyDetailsSection` filters assessor ID and legal description for buyer audience. All three property pages follow the canonical hierarchy: Header → Owner verification status (admin only) → Hero → Valuation summary → Secured debt section (owner/admin only) → PropertyRecordSections → operational panels. Admin page removes `AdminVendorReviewPanel`, `AdminMashvisorPanel`, and the Linked deal block. Owner verification controls moved to top of admin page (below badge row). Duplicate address/status card removed from admin page. Public page excludes assessor ID and legal description from PropertyDetailsSection.
- **Owner Photo Management:** `property_photos` table (UUID PK, soft-delete via `removed_at`, sort_order, is_hero flag, public_url). Public Supabase storage bucket `property-photos`. API routes: GET/POST photos, DELETE (soft), PATCH hero, PATCH reorder. `PropertyHeroMedia` updated with `ownerPhotos` + `onManagePhotos` props; priority: owner hero → first owner photo → vendor images → map fallback. `PropertyMediaSection` client component wraps hero + `ManagePhotosModal` for owner/admin pages. Hero badge and star thumbnail indicators for hero photo.
- **Owner Property Settings Modal:** `PropertySettingsModal` client component (visibility: private/public, proposal interest status: not_interested/interested/open). PATCH `/api/me/properties/[id]/settings`. `OwnerPropertyEditControls` bar below hero on owner page shows current settings + two action buttons (Settings, Suggest correction).
- **Owner Fact Correction Suggestions:** `property_fact_corrections` table (field_key, canonical_value, owner_submitted_value, review_status: pending/approved/rejected). Unique index prevents duplicate active corrections per field. `SuggestPropertyDetailUpdateModal` lets owners suggest values for 6 correctable fields (beds, baths, sqft, lot, year_built, owner_occupied). Blocked fields shown as disabled in select.
- **Admin Fact Correction Review:** `AdminFactCorrectionPanel` client component shows pending/resolved corrections grouped by status. Approve/reject with optional reviewer note via POST `/api/admin/properties/[id]/corrections/[corrId]/review`. Added to admin page after PropertyRecordSections.
- **Immutable Audit Trail:** `property_edit_audit` table with UPDATE/DELETE triggers that raise exceptions (append-only). Covers: photo_uploaded, photo_removed, photo_hero_set, photo_reordered, settings_updated, correction_submitted, correction_approved, correction_rejected.
- **Legal Document Publishing (Version 2):** Privacy Policy and Terms of Use (Version 2, effective April 12, 2026) stored verbatim as TypeScript constants in `src/lib/policies/content.ts`. `EULA_VERSION = "v2"` in `src/lib/eula.ts` gates re-acceptance. `policy_acceptances` table (user_id, policy_type, terms_of_use|privacy_policy, policy_version, accepted_at, ip_address, user_agent, device_metadata) stores per-policy acceptance with metadata. `/api/me/eula` POST atomically inserts both policy acceptance rows + updates `profiles.eula_version`. `OnboardingGate` shows a tabbed modal (Privacy Policy / Terms of Use) with full scrollable legal text and "Accept both" / "Decline and sign out" actions. Public `/privacy` and `/terms` routes serve the full policy text. `/eula-required` updated with links to both policy pages.

**Feature Specifications:**
- **Homeowner Intake:** Core data collection form.
- **User Dashboard:** Role-specific content displaying deal cards and next steps.
- **Deal Resume:** Converts marketing drafts into authenticated deals.
- **Offer/Counter-Offer/Accept/Reject:** Functionality for managing deal negotiation states.
- **Transactional Email:** Sends HTML emails via Resend API, logging attempts and outcomes.
- **Compute Endpoint:** Handles computation of deal snapshots using the canonical engine.
- **Share Link Flow:** Enables generation of shareable URLs for read-only deal viewing with token validation.
- **Deal Terms Modal:** Custom 4-tab modal (Payments, Exit Terms, Assumptions, Fees) for configuring deal specifics.
- **Owner Debt Challenge:** Allows owners to submit statements regarding debt discrepancies.

## External Dependencies
- **Next.js:** Application framework.
- **Supabase:** Database, authentication, and Row Level Security.
- **HubSpot:** Sales follow-up integration.
- **@fractpath/compute:** Canonical compute engine for deal calculations.
- **fractpath-calculator-widget:** React UI components and compute utilities.
- **Resend:** Transactional email service.
- **sharp:** Server-side image processing.
- **ATTOM:** Property data and AVM services.
- **Mashvisor:** Property data enrichment.
- **RentCast:** Property data enrichment.
- **DocuSign:** (Scaffolding only) Server-side JWT auth and API client.