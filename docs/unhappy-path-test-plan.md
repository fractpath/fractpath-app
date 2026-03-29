# Unhappy-Path Test Plan — Ineligible Deal & Renegotiation Workflow

This document describes manual testing steps for the ineligible deal lifecycle, manual appraisal challenge, and renegotiation flows added in this session.

---

## Prerequisites

- Two test accounts: one **Homeowner** (`owner@test.local`) and one **Buyer** (`buyer@test.local`).
- An admin account with `is_admin=true` in `auth.users` metadata.
- A deal that has reached `triage_status = 'ineligible'` (set directly in Supabase if needed).
- The property linked to that deal must have `escalation_avm_status = 'complete'` (so ATTOM is considered done).

---

## A. Ineligible stage overrides closing/signature stages

**Goal:** Verify that `liveIneligible=true` pushes the canonical stage to `deal_terms_ineligible` even when other lifecycle fields (closing, signatures) are set.

| Step | Action | Expected |
|------|--------|----------|
| A1 | Set `deals.triage_status = 'ineligible'` and `properties.closing_review_status = 'ready'` for the test deal. | — |
| A2 | Visit the homeowner deal page (`/deal/[dealId]`). | Hero status card shows "Eligibility Review — Revised terms needed" (not a closing milestone). |
| A3 | Visit the admin deal page (`/admin/deals/[dealId]`). | "Overall process" section shows stage `deal_terms_ineligible`. |
| A4 | Visit the admin property page (`/admin/properties/[propertyId]`). | "Transaction status" section also shows `deal_terms_ineligible`. |

---

## B. Manual appraisal challenge initiation (Homeowner)

**Goal:** Homeowner can request a manual appraisal from their property page when ATTOM is complete.

| Step | Action | Expected |
|------|--------|----------|
| B1 | Sign in as Homeowner. Open the property page (`/me/properties/[propertyId]`). | Property Valuation section visible. |
| B2 | With `escalation_avm_status = 'complete'` and `manual_appraisal_status = null`, confirm "Initiate appraisal challenge" button is shown in the Manual Appraisal section. | Button visible. |
| B3 | Click "Initiate appraisal challenge". | Button disappears or shows success. `properties.manual_appraisal_status` → `'available'`. A `property_status_audit` entry is written with `actor_type='owner'` and `event_type='manual_appraisal_initiated'`. |
| B4 | Refresh the page. | Button is gone; section shows `available` state copy. |
| B5 | With `manual_appraisal_status = 'complete'` and a `manual_appraisal_fmv` value set, confirm the Manual Appraisal section renders the completed FMV. | FMV displayed. |

---

## C. Renegotiation request (Homeowner)

**Goal:** Homeowner can request renegotiation from the ineligible deal block.

| Step | Action | Expected |
|------|--------|----------|
| C1 | Sign in as Homeowner. Open deal page with `triage_status = 'ineligible'`. | `IneligibleDealOwnerBlock` visible with "Request renegotiation" CTA. |
| C2 | Click "Request renegotiation". | Button transitions to a disabled/confirmed state. `deal_events` receives a `DEAL_RENEGOTIATION_REQUESTED` entry. `deals.renegotiation_status` → `'requested'`. |
| C3 | Refresh the deal page. | Owner block shows "Renegotiation already requested" copy; CTA is suppressed. Hero status shows `renegotiation_requested` stage label. |
| C4 | Sign in as Buyer. Open same deal page. | `IneligibleDealBuyerBlock` is hidden (stage is `renegotiation_requested`, buyer block is gated on stage not being `renegotiation_requested`). Buyer sees "Revised terms being prepared" copy or no block at all. |

---

## D. Admin reopen-negotiation action

**Goal:** Admin can clear the renegotiation request so the deal flows back to negotiating.

| Step | Action | Expected |
|------|--------|----------|
| D1 | Sign in as Admin. Open deal page (`/admin/deals/[dealId]`) where `renegotiation_status = 'requested'`. | "Overall process" section shows amber "Renegotiation requested" notice with "Reopen negotiation" button. |
| D2 | Click "Reopen negotiation". | Button shows "Processing…" then the page refreshes. `deals.renegotiation_status` → `null`. A `deal_events` entry is written with `DEAL_RENEGOTIATION_REOPENED`. |
| D3 | After refresh, confirm the amber notice is gone. | Notice no longer rendered. Stage reverts to `deal_terms_ineligible` (or appropriate stage given updated triage). |

---

## E. Manual appraisal clears ineligible stage

**Goal:** When `manual_appraisal_status = 'complete'` and FMV now passes the AVM check, stage advances past `deal_terms_ineligible`.

| Step | Action | Expected |
|------|--------|----------|
| E1 | Set `properties.manual_appraisal_status = 'complete'` and `properties.manual_appraisal_fmv` to a value that makes the deal eligible (e.g., higher than `owner_stated_fmv`). | — |
| E2 | Open homeowner deal page. | Stage is `enhanced_review_complete` (not `deal_terms_ineligible`). Hero shows updated milestone label. |
| E3 | Open admin deal page. | "Overall process" shows `enhanced_review_complete`. Ineligible copy is absent. |
| E4 | Open admin property page. | "Transaction status" shows `enhanced_review_complete`. |

---

## F. liveIneligible vs. DB triage_status independence

**Goal:** If the deal's controlling FMV now passes the check (manual appraisal FMV > threshold), `liveIneligible` is `false` even though `triage_status` is still `'ineligible'` in the DB.

| Step | Action | Expected |
|------|--------|----------|
| F1 | Keep `triage_status = 'ineligible'` in DB. Set `manual_appraisal_fmv` to a value high enough that `computeAvmEligibility` returns `'eligible'`. | — |
| F2 | Open homeowner deal page. | `liveIneligible = false`, `manualAppraisalStatus = 'complete'` → stage is `enhanced_review_complete`. |
| F3 | Open admin deal and property pages. | Both show `enhanced_review_complete`. Admin sees no ineligible copy. |

---

## Error / edge cases

| Case | Expected |
|------|----------|
| Non-owner calls `POST /api/me/properties/[propertyId]/initiate-manual-appraisal` | 403 Forbidden |
| Owner calls initiate-manual-appraisal when `escalation_avm_status != 'complete'` | 400 with "ATTOM not complete" message |
| Owner calls log-renegotiation twice | Second call is idempotent — `renegotiation_status` stays `'requested'`; a second event is logged but UI still shows "already requested". |
| Non-admin calls `POST /api/admin/deals/[dealId]/reopen-negotiation` | 403 Forbidden |
