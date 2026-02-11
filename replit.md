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
- **Deal Resume:** Converts marketing drafts into authenticated deals.
- **Share Deal:** Enables generation of read-only share links.
- **Snapshot Ingestion:** Allows owners to ingest new snapshots for their deals.
- **Offer/Counter-Offer Creation:** Owners can create OFFER versions; Owners or Counterparties can create COUNTER versions.
- **Accept/Reject Decisions:** Owners can accept or reject specific deal versions, recorded as new ACCEPT/REJECT versions.
- **Snapshot Comparison:** A read-only comparison view at `/deal/[dealId]/compare?a=<id>&b=<id>` shows field-level diffs between two snapshots of the same deal.

## External Dependencies
- **Next.js:** React framework for server-side rendering and API routes.
- **Supabase:** Provides PostgreSQL database, authentication services, and Row Level Security (RLS).
- **HubSpot:** Integrates for sales follow-up and scenario summary distribution.