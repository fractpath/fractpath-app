TICKET WGT-031 — Gating UI + lead payload (pure)

Objective
Implement inline reveal flow (tease → email → reveal) and produce lead payload for marketing to submit.

Non-goals
- No HubSpot token usage in widget
- No server routes in widget repo

Deliverables
- buildLeadPayload({ email, persona, inputs, outputs })
- Widget prop: onLeadSubmit?: (payload) => Promise<{ ok: boolean }>
- Inline gating UI states: teased, entering_email, unlocked

Acceptance Criteria
- Does not lose user inputs
- Minimal email validation
- If submission fails, still reveal with warning (conversion-friendly)
- deal_summary_text mentions TF + floor/cap
