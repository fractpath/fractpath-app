# Decision Checklists (Product Owner Review)

These checklists are designed for non-technical approval decisions. If any answer is "No" or "Unknown", request revision or escalate.

---

## 1) Data & Database Changes
- ☐ Does this add or change any stored data?
- ☐ Is any new personal or financial data introduced?
- ☐ Is access deny-by-default (no public read/write)?
- ☐ Can one user ever see another user’s data? (Must be NO)
- ☐ Are deletes/updates safe and intentional?
- ☐ Are failure modes safe (no leakage)?

Escalate if: any new PII/financial data, any uncertainty about cross-user visibility.

---

## 2) Authentication & Authorization
- ☐ Are protected pages/actions blocked when unauthenticated?
- ☐ Are role/persona boundaries preserved?
- ☐ Is there any “trusted client” assumption? (Must be NO)
- ☐ Are redirects safe (no open redirect)?
- ☐ Does auth failure deny safely?

Escalate if: any change touches access rules or roles.

---

## 3) External Integrations (HubSpot, webhooks, Stripe, etc.)
- ☐ Are retries safe (no duplicates / idempotency considered)?
- ☐ Are secrets stored only in environment variables?
- ☐ Is sensitive data minimized in outbound payloads?
- ☐ Are error/retry behaviors defined and safe?
- ☐ Is there logging without leaking payload contents?

Escalate if: payload contains PII/financial data or retry duplication risk.

---

## 4) User-Facing Behavior Changes
- ☐ Does the change align with INTENT_FREEZE?
- ☐ Does it change meaning (implied approval, eligibility, pricing)? (Must be NO unless ticketed)
- ☐ Are validation errors clear and non-misleading?
- ☐ Are empty/loading/error states safe and not confusing?

Escalate if: trust language, eligibility, or money semantics shift.
