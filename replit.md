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
- **Share Link Flow:** Enables generation of shareable URLs for read-only deal viewing with token validation and access management.
- **Access Control (RLS):** Supabase Row Level Security governs access to data based on user roles (OWNER, VIEWER, COUNTERPARTY).
- **Rate Limiting:** In-memory IP rate limiting protects pre-authentication endpoints.
- **User Profiles:** Stores user details, marketing preferences, and EULA acceptance.
- **Properties:** Manages multiple properties per user with status tracking and verification workflow.
- **Property Verification Pipeline:** Defines the lifecycle of property statuses (`unverified` to `verified`) with admin-controlled transitions and an immutable audit trail.
- **Feature Specifications:**
    - **Homeowner Intake:** Core data collection form.
    - **User Dashboard:** Role-specific content displaying deal cards and next steps.
    - **Deal Resume:** Converts marketing drafts into authenticated deals, generating initial snapshots and audit events.
    - **Marketing Lead:** Endpoint for marketing integrations to create draft snapshots.
    - **Offer/Counter-Offer/Accept/Reject:** Functionality to manage deal negotiation states.
    - **Snapshot Comparison:** Allows comparison of two snapshots of the same deal.
    - **Historical Snapshot Mode:** Provides read-only view of past snapshots.
    - **Compute Endpoint:** Handles computation of deal snapshots for owners.
    - **Fork Endpoint:** Allows users with read access to create a new deal based on an existing one.
    - **Compute Adapter:** Integrates the canonical `@fractpath/compute` engine for all calculations.
    - **Default Scenario:** Provides baseline `deal_terms` and `scenario` for new deals.
    - **Recompute Button:** Enables owners to regenerate snapshots with current inputs.
    - **Create Deal Flow:** Supports creation of new deals via an authenticated endpoint and dedicated page.
    - **Snapshot KPI Extractor:** Extracts display data from snapshots for UI components.
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