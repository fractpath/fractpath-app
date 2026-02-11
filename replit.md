# FractPath

## Overview
FractPath is a minimal homeowner intake application built with Next.js. Its primary purpose is to collect exploratory scenario information from homeowners and provide a deterministic, non-binding scenario summary. This summary is then sent to HubSpot for internal sales follow-up. The platform supports Supabase authentication with role-based onboarding (Homeowner, Buyer, Realtor), includes a user dashboard, and features a deal resume flow that converts marketing DraftSnapshots into authenticated deals with immutable calculator snapshots. It also offers a share-link flow for read-only viewing of deals. The business vision is to streamline the initial homeowner engagement process, offering clear, non-committal exploratory tools that can lead to qualified sales opportunities.

## User Preferences
- Language must be neutral and exploratory (no deal/commitment language in user-facing copy)
- DraftSnapshot inputs/results are stored verbatim — no recomputation or normalization
- Calculator snapshots are immutable and append-only
- Errors must be explicit and blocking (fail-closed)

## System Architecture
FractPath is a Next.js application leveraging API routes for backend logic and Supabase for database and authentication services.

**UI/UX Decisions:**
- **Role-based onboarding:** Users select a role (Homeowner, Buyer, Realtor) during signup, which influences their dashboard content.
- **Deal Viewing:** Deals are presented with a focus on immutable calculator snapshots and an audit trail of events. A read-only banner is displayed for shared deals.
- **Snapshot History:** When multiple snapshots exist for a deal, a history section allows selection via URL parameters, with a "Back to latest" option.

**Technical Implementations:**
- **Authentication:** Supabase is used for user authentication, including sign-in, sign-up, password reset, and email verification. Role information is stored in Supabase user metadata.
- **Data Handling:**
    - **DraftSnapshots:** Initial scenario data (from a marketing widget) is captured as `DraftSnapshot` objects. These are validated for schema, required fields, and hash integrity but are not recomputed.
    - **Deal Creation:** `DraftSnapshots` are converted into `Deal` objects and associated `FullDealSnapshotV1` records upon user authentication and "resume" action. Deals are created exclusively via the `/api/deals/resume` endpoint.
    - **Snapshots:** Calculator snapshots are append-only, immutable, and versioned. They are stored as `FullDealSnapshotV1` objects. Display logic fetches and renders these snapshots without recomputation.
    - **Deal Versions:** A `deal_versions` table tracks changes to deals, with `version_type` (OFFER, COUNTER, ACCEPT, REJECT) and references to snapshots.
    - **Deal Events:** An audit trail for deals (e.g., `DEAL_CREATED`, `DEAL_SNAPSHOT_CREATED`) is maintained via `deal_events`.
- **Share Link Flow:**
    - Owners can generate shareable URLs for their deals via `/api/deals/[dealId]/share`.
    - The `/share` page validates tokens, handles authentication, and grants `VIEWER` access to the recipient, redirecting them to a read-only view of the deal.
- **Access Control (RLS):** Supabase Row Level Security (RLS) is extensively used to manage access to deals, snapshots, events, and share tokens based on `deal_access_grants` (OWNER, VIEWER roles). Ownership is determined by `owner_user_id` or `OWNER` grant.
- **Rate Limiting:** In-memory IP rate limiting is implemented to prevent abuse of pre-authentication endpoints.

**Feature Specifications:**
- **Homeowner Intake Form:** Main entry point for data collection.
- **User Dashboard:** Role-specific content and access to personal scenarios.
- **Deal Resume Flow:** Converts marketing drafts into authenticated deals.
- **Share Deal Functionality:** Allows deal owners to generate read-only share links for others.
- **Snapshot Ingestion:** Owners can ingest new snapshots for their deals via `/api/deals/[dealId]/snapshot`.

## External Dependencies
- **Next.js:** React framework for server-side rendering and API routes.
- **Supabase:**
    - Database (PostgreSQL) for storing user data, deals, snapshots, events, and access grants.
    - Authentication services (email/password, OAuth callbacks).
    - Row Level Security (RLS) for fine-grained access control.
- **HubSpot:** Destination for deterministic, non-binding scenario summaries for sales follow-up.