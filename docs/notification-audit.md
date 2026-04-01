# Notification Audit

This document catalogues all customer-facing notifications sent by FractPath,
their trigger conditions, delivery path, and suppression rules.

---

## Delivery Infrastructure

All notifications are sent inline via **Resend** using the `sendTemplateEmail`
helper in `src/lib/email/sendTemplateEmail.ts`.  Calls are **non-blocking**:
errors are logged to the console (and optionally to `deal_events`) but are never
propagated back to the calling request.

Successful sends are logged to `deal_events` with event type
`DEAL_WORKFLOW_NOTIFICATION_SENT`.

---

## Milestone Notifications (`notifyMilestoneForProperty` / `notifyMilestoneForDeal`)

Source: `src/lib/workflow/notifyMilestone.ts`

These fire whenever an admin transitions a property or deal to a new workflow
stage.  The recipient is the **deal thread owner** resolved via:
`deal_thread → auth.users → profiles` (in that priority order).

| Trigger | Stage | Subject / Body summary |
|---|---|---|
| Property under review | Stage 2 | "Your property is under review — we'll notify you when complete." |
| Property verified | Stage 3 | "Property verified — you can now accept deal terms." |
| ATTOM enhanced review ordered | Stage 4 | "Enhanced review ordered — expect results within [N] business days." |
| ATTOM enhanced review complete | Stage 5 | "Enhanced review complete — see your property page for the verified value." |
| Manual appraisal scheduled | Stage 6 | "Licensed appraisal scheduled — you will be contacted by the appraiser." |
| Closing review started | Stage 7 | "Closing review has begun — our team is preparing closing documents." |
| Closing issue found | Stage 8 | "A closing issue was found — see your deal page for details." |
| Property ready for closing | Stage 9 | "Your property is ready for closing — your closer will be in touch." |
| Deal ready for signatures | Stage 11 | "Your deal is ready for signatures — DocuSign packet sent." |
| Deal signed | Stage 12 | "Signatures complete — closing is being scheduled." |
| Deal accepted | Stage 13 | "Your deal has been accepted — see your deal page for next steps." |
| Deal closed | Stage 14 | "Your deal has closed — see your deal page for servicing details." |
| Servicing active | Stage 15 | "Servicing is now active — see your deal page for details." |
| Servicing issue | Stage 16 | "A servicing issue was found — our team will be in touch." |

**Suppression rules:**
- Notifications are suppressed if the owner's email cannot be resolved.
- `DEAL_WORKFLOW_NOTIFICATION_SENT` events are checked for idempotency at the
  call site in admin panel handlers before triggering the send.

---

## Transactional Email (`sendTemplateEmail`)

Source: `src/lib/email/sendTemplateEmail.ts`

Generic helper wrapping Resend.  Sends inline HTML.  All callers pass:
- `to`: recipient email address
- `subject`: plain text subject
- `html`: full HTML body (callers are responsible for templating)

Logs outcome to `deal_events` with `{ emailTo, emailSubject, success, errorMsg }`.

---

## Deal Event Notifications

### Counter-offer submitted
**Trigger:** `POST /api/me/deals/[dealId]/counter-offer`  
**Recipients:** Other party on the deal thread  
**Subject:** "Revised terms submitted on your deal"  
**Suppression:** None — always fires on successful counter-offer creation.

### Offer accepted
**Trigger:** `POST /api/me/deals/[dealId]/accept`  
**Recipients:** Buyer (notified that owner accepted)  
**Subject:** "Your offer has been accepted"  
**Suppression:** None.

### Offer rejected
**Trigger:** `POST /api/me/deals/[dealId]/reject`  
**Recipients:** Submitting party  
**Subject:** "Your offer was not accepted at this time"  
**Suppression:** None.

### Deal review request (admin → owner)
**Trigger:** Admin creates a `deal_review_requests` row via
`POST /api/admin/properties/[propertyId]/review-request`  
**Recipients:** Property owner  
**Subject:** "Additional information needed for your property review"  
**Suppression:** Only fires when `send_notification: true` is passed in the
request body.

---

## Renegotiation Intent Log

**Not a notification** — `POST /api/me/deals/[dealId]/log-renegotiation` logs
a `DEAL_RENEGOTIATION_REQUESTED` event to `deal_events` and does **not** send
an email.  Admin is expected to monitor the event log and reach out proactively.

---

## Debt Challenge Statement

**Not a notification** — `POST /api/me/properties/[propertyId]/debt-challenge`
logs a `DEBT_CHALLENGE_STATEMENT` audit entry to `property_status_audit` and
does **not** send an email.  Admin sees it on the property review page.

---

## Coverage Gaps / TODOs

| Gap | Severity | Notes |
|---|---|---|
| No owner email on renegotiation intent | Low | Admin monitors `deal_events`; low urgency |
| No buyer email when deal marked ineligible | Medium | Owner-side action path exists; buyer relies on page state |
| No email on debt challenge statement submitted | Low | Admin sees it in property audit trail |
| DocuSign webhook → `DEAL_SIGNED` event not yet wired to notification | High | Requires live DocuSign integration |
| Servicing issue email body is generic | Low | Can be refined when servicing partner is onboarded |
