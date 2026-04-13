# FractPath

## Overview
FractPath is a Next.js application designed to engage homeowners by collecting exploratory scenario information and providing deterministic, non-binding summaries. It integrates with HubSpot for sales follow-up, generating qualified sales opportunities. The platform features Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), a user dashboard, a deal resume flow, and a share-link capability for read-only deal viewing. Its vision is to streamline property transaction processes, enhance user engagement, and efficiently generate qualified leads for sales teams, transforming how homeowners explore property options.

## User Preferences
- Language must be neutral and exploratory (no deal/commitment language in user-facing copy)
- DraftSnapshot inputs/results are stored verbatim — no recomputation or normalization
- Calculator snapshots are immutable and append-only
- Errors must be explicit and blocking (fail-closed)

## System Architecture
FractPath is built with Next.js, utilizing API routes for backend logic and Supabase for database and authentication.

**UI/UX Decisions:**
- Role-based onboarding and adaptive user experience.
- Immutable calculator snapshots and an audit trail for deal viewing, with share links for read-only access.
- Unified modal for property addition, ensuring consistent UI elements.
- Enriched property preview component with graceful fallback for missing data.
- Buyer-facing discovery page for public properties, omitting private owner details.
- Unified property page layout across admin, owner, and public interfaces, including header, hero media, valuation/cash sections, and detailed property record sections.

**Technical Implementations:**
- **Authentication & Authorization:** Supabase handles user authentication, roles, and Row Level Security (RLS).
- **Data Handling:** DraftSnapshots are validated and stored, converting to `Deal` objects and immutable `FullDealSnapshotV1` records. Calculator snapshots are append-only and versioned.
- **Properties Management:** Supports multiple properties per user, with structured address fields, status tracking, and verification using `normalized_address`.
- **Property Documents:** Stores verification uploads in Supabase Storage with server-side processing for image transcoding and fraud signal computation.
- **Secured Debt Underwriting:** `properties` table includes private underwriting columns for secured property debt and fair market value (FMV).
- **Deal Triage:** `deals` table carries triage metadata columns evaluated at offer-acceptance.
- **Canonical Lifecycle Engine:** Single source of truth for workflow status and `CanonicalLifecycleResult` generation.
- **Milestone Tracking & Notifications:** Defines simplified stages for customer progress and sends inline HTML emails via Resend.
- **Contract Versioning:** `CONTRACT_VERSION` and `SCHEMA_VERSION` are stamped at snapshot persistence boundaries.
- **Property Enrichment:** Integrates with third-party providers (Mashvisor, RentCast) to enrich property data, storing raw and summarized payloads. `PropertyFacts`, `PropertyAvm`, and `PropertyReviewedBasis` types are used for consistent display.
- **Owner Photo Management:** `property_photos` table supports soft-delete, sorting, and hero photo selection. API routes manage photos in Supabase Storage.
- **Owner Property Settings:** `PropertySettingsModal` allows owners to manage property visibility and proposal interest status.
- **Owner Fact Correction Suggestions:** `property_fact_corrections` table records owner-submitted corrections for specific fields with a review workflow.
- **Owner-Initiated Deal Creation:** Owners can create deals from their property page, with a specific UI variant for sending to potential buyers.
- **Immutable Audit Trail:** `property_edit_audit` table tracks property modifications via triggers.
- **Legal Document Publishing:** Versioned Privacy Policy and Terms of Use are stored as TypeScript constants, with user acceptance tracked in `policy_acceptances`.
- **Public Property Map:** `/map` page uses MapLibre GL JS to display public properties, including enriched data like AVM, beds, baths, sqft, and hero photos.
- **Verified Properties Discovery Surface:** `/verified-properties` page combines map and cards for discovery, allowing search, sort, and interactive map/card highlighting.
- **Property Detail Page Location Map:** Displays a server-rendered Mapbox Static Images API map with a pin for property location.

**Feature Specifications:**
- **Homeowner Intake:** Core data collection.
- **User Dashboard:** Role-specific content and deal cards.
- **Deal Resume:** Converts marketing drafts to authenticated deals.
- **Offer/Counter-Offer/Accept/Reject:** Deal negotiation states.
- **Transactional Email:** Sends HTML emails via Resend.
- **Compute Endpoint:** Calculates deal snapshots using the canonical engine.
- **Share Link Flow:** Generates shareable, read-only deal URLs.
- **Deal Terms Modal:** Configures deal specifics across payments, exit terms, assumptions, and fees.
- **Owner Debt Challenge:** Allows owners to submit debt discrepancy statements.

## External Dependencies
- **Next.js:** Application framework.
- **Supabase:** Database, authentication, and Row Level Security.
- **HubSpot:** Sales follow-up integration.
- **@fractpath/compute:** Canonical compute engine.
- **fractpath-calculator-widget:** React UI components and compute utilities.
- **Resend:** Transactional email service.
- **sharp:** Server-side image processing.
- **ATTOM:** Property data and AVM services.
- **Mashvisor:** Property data enrichment.
- **RentCast:** Property data enrichment.
- **DocuSign:** (Scaffolding only) Server-side JWT auth and API client.