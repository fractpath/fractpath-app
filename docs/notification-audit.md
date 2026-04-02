# Notification Audit

This document catalogues all customer-facing notifications sent by FractPath,
their trigger conditions, delivery path, and suppression rules.

Last updated: 2026-04-02

---

## Delivery Infrastructure

FractPath sends customer notifications via two paths, both backed by **Resend**:

1. **`sendInlineEmail`** (`src/lib/email/sendInlineEmail.ts`) — raw send helper.
2. **`sendWorkflowEmail`** (`src/lib/workflow/sendWorkflowEmail.ts`) — centralized
   workflow email helper that wraps `sendInlineEmail`. Supports owner and buyer
   audiences, event-keyed copy, and contact resolution from `propertyId` or `dealId`.
3. **`sendTemplateEmail`** (`src/lib/email/sendTemplateEmail.ts`) — used for
   offer/counter-offer/share-link flows; remains unchanged.

All sends are **non-blocking**: errors are logged to the console but never
propagated back to the calling request.  Successful milestone sends are logged
to `deal_events` with `DEAL_WORKFLOW_NOTIFICATION_SENT`.  Workflow email sends
are logged to the server console only (not yet persisted to `deal_events`).

---

## Milestone Notifications (`notifyMilestoneForProperty` / `notifyMilestoneForDeal`)

Source: `src/lib/workflow/notifyMilestone.ts`

Owner-only. Fire when an admin transitions a property or deal to a new workflow stage.

| Trigger | Stage | Subject / Body summary |
|---|---|---|
| Property under review | Stage 2 | "Your property is under review" |
| Property verified | Stage 3 | "Property verified — you can now accept deal terms." |
| ATTOM enhanced review ordered | Stage 4 | "Enhanced review ordered" |
| ATTOM enhanced review complete | Stage 5 | "Enhanced review complete" |
| Manual appraisal scheduled | Stage 6 | "Licensed appraisal scheduled" |
| Closing review started | Stage 7 | "Closing review has begun" |
| Closing issue found | Stage 8 | "A closing issue was found" |
| Property ready for closing | Stage 9 | "Your property is ready for closing" |
| Deal ready for signatures | Stage 11 | "Your deal is ready for signatures" |
| Deal signed | Stage 12 | "Signatures complete" |
| Deal accepted | Stage 13 | "Your deal has been accepted" |
| Deal closed | Stage 14 | "Your deal has closed" |
| Servicing active | Stage 15 | "Servicing is now active" |
| Servicing issue | Stage 16 | "A servicing issue was found" |

**Suppression:** Suppressed if the owner's email cannot be resolved.

---

## Workflow Email Notifications (`sendWorkflowEmail`)

Source: `src/lib/workflow/sendWorkflowEmail.ts`

### Owner events

| Event key | Trigger route | Condition | Subject |
|---|---|---|---|
| `PROPERTY_VERIFIED_APPRAISAL_READY` | `POST /api/admin/properties/[propertyId]/review/run-attom-screening` | `becameControlling = true` AND FMV changed AND no review flags | "Your property valuation has been updated" |
| `PROPERTY_VERIFICATION_REVIEW_REQUIRED` | Same | `becameControlling = false` AND review flags present | "Your property review requires additional attention" |
| `PROPERTY_VERIFICATION_UPDATED` | Same | `becameControlling = true` AND FMV changed AND review flags present | "Your property details have been updated" |
| `PROPERTY_MANUAL_REVIEW_COMPLETED` | `POST /api/admin/properties/[propertyId]/manual-appraisal` | `action = "complete"` | "Your independent appraisal review is complete" |
| `PROPERTY_DEBT_VERIFICATION_UPDATED` | `POST /api/admin/properties/[propertyId]/debt-basis` | `action = "adopt_owner_verified"` or `"keep_attom"` | "Your property's secured debt information has been reviewed" |
| `DEAL_TERMS_INELIGIBLE_OWNER` | `POST /api/admin/deals/[dealId]/set-review-state` | `state = "ineligible"` | "Your scenario is currently ineligible — action may be required" |
| `NEGOTIATION_REENGAGEMENT_REQUIRED_OWNER` | `POST /api/admin/deals/[dealId]/reopen-negotiation` | On successful reopen | "Your revised scenario is ready for review" |

### Buyer events

| Event key | Trigger route | Condition | Subject |
|---|---|---|---|
| `DEAL_VERIFICATION_REVIEW_COMPLETED` | `POST /api/admin/properties/[propertyId]/review/run-attom-screening` | `becameControlling = true` AND FMV changed AND no review flags | "Property verification for this deal is complete" |
| `DEAL_UNDER_VERIFICATION_REVIEW` | Same | FMV changed with review flags, or review flags with no FMV change | "This deal is under verification review" |
| `DEAL_VERIFICATION_REVIEW_COMPLETED` | `POST /api/admin/properties/[propertyId]/manual-appraisal` | `action = "complete"` | "Property verification for this deal is complete" |
| `DEAL_TERMS_NO_LONGER_ELIGIBLE_BUYER` | `POST /api/admin/deals/[dealId]/set-review-state` | `state = "ineligible"` | "This deal is no longer eligible under current terms" |
| `NEGOTIATION_REENGAGEMENT_REQUIRED_BUYER` | `POST /api/admin/deals/[dealId]/reopen-negotiation` | On successful reopen | "Revised terms are available for this deal" |

### Suppression rules

- **Silent ATTOM reruns:** If `becameControlling = false` AND no review flags in `limitingFactors`,
  no email is sent.  Logged as `ATTOM_NOTIFICATION_SILENT_RERUN`.
- **Debt-basis informational actions:** `request_mortgage_docs`, `request_heloc_docs`,
  `mark_attom_stale`, `escalate_title` do **not** trigger owner notification.
  Only resolved-basis decisions (`adopt_owner_verified`, `keep_attom`) notify.
- **Buyer debt isolation:** Buyers are **never** notified for debt-basis updates.
  Provider names, debt amounts, and admin rationale are never included in buyer emails.
- **Contact resolution failure:** If owner or buyer email cannot be resolved from
  `deal_threads`, the notification is silently skipped (logged at WARN level).
- **ATTOM reruns with unchanged FMV:** `becameControlling = true` but
  `controllingFmvCandidate === prevFmv` → treated as silent rerun.

### Contact resolution

Both owner and buyer contacts are resolved from `deal_threads` via
`resolveWorkflowContacts(svc, { propertyId | dealId })`.  Active thread
statuses checked: `accepted`, `negotiating`, `pending_owner`, `decision_pending`,
`closed`.  Auth email resolved via `svc.auth.admin.getUserById`; display name
from `profiles.first_name / last_name`.

---

## Transactional Email (`sendTemplateEmail`)

Source: `src/lib/email/sendTemplateEmail.ts`

Template-backed offer/share flows — **unchanged by workflow email work**.

### Counter-offer submitted
**Trigger:** `POST /api/me/deals/[dealId]/counter-offer`
**Recipients:** Other party on the deal thread
**Subject:** "Revised terms submitted on your deal"

### Offer accepted
**Trigger:** `POST /api/me/deals/[dealId]/accept`
**Recipients:** Buyer (notified that owner accepted)
**Subject:** "Your offer has been accepted"

### Offer rejected
**Trigger:** `POST /api/me/deals/[dealId]/reject`
**Recipients:** Submitting party
**Subject:** "Your offer was not accepted at this time"

### Deal review request (admin → owner)
**Trigger:** `POST /api/admin/properties/[propertyId]/review-request`
**Recipients:** Property owner
**Subject:** "Additional information needed for your property review"
**Suppression:** Only fires when `send_notification: true` is passed.

---

## Non-Email Audit Events

- **Renegotiation Intent Log:** `POST /api/me/deals/[dealId]/log-renegotiation`
  logs `DEAL_RENEGOTIATION_REQUESTED` to `deal_events`. No email sent.
- **Debt Challenge Statement:** `POST /api/me/properties/[propertyId]/debt-challenge`
  logs to `property_status_audit`. No email sent.

---

## Coverage Gaps / Intentionally Deferred

| Gap | Status | Notes |
|---|---|---|
| `NEGOTIATION_CLOSED_AFTER_VERIFICATION` (buyer) | Deferred | No clear single trigger in current routes; placeholder in copy catalog |
| Workflow email sends not persisted to `deal_events` | Low priority | Currently console-logged only; can be added when auditing is required |
| DocuSign webhook → `DEAL_SIGNED` event not wired to notification | Deferred | Requires live DocuSign integration |
| Branded templates replacing inline HTML | Deferred | Trigger logic is cleanly separated; templates can slot in later |
| No email on debt challenge statement submitted (owner) | Low | Admin sees it in property audit trail |
| Servicing issue email body is generic | Low | Can be refined when servicing partner is onboarded |
