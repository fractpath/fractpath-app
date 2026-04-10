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
- **Property Status Lanes:** Provides pure derivation functions for three property status lanes: Participation, Valuation, and Closing Readiness, displayed consistently across admin, owner, and public interfaces.

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