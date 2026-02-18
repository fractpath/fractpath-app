# WGT-020 — Share Semantics (Marketing vs App) + Contract Payloads

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 9 (implementation foundation)

---

# Objective

Define share behavior and payload semantics distinctly for:

- **Marketing share**: unauthenticated, branded email summary + marketing magic link (illustrative only)
- **App share**: authenticated, permissioned, read-only access to real deals via share tokens

This ticket locks the share-related widget contracts and prevents marketing-visible shares from ever implying a binding deal.

**Key alignment:**  
The widget may produce share-safe summaries, but must never own share delivery, access control, persistence, or token minting.

---

# Definitions

- **ShareSummary**: widget-produced, unauthenticated-safe summary payload intended solely for marketing email sharing.
- **Marketing Share**: pre-auth, non-binding, informational only. Not connected to app deal access grants.
- **App Share**: post-auth, permissioned, deal-backed access using `deal_share_tokens` + `deal_access_grants`.

---

# A) Marketing Share (Prospect / mode="marketing")

## Widget Responsibilities (Locked)

Widget MUST:

- Produce a `ShareSummary` object containing only allowed fields below
- Emit `onShareSummary(summary: ShareSummary)`
- Treat ShareSummary as non-binding display-only information

Widget MUST NOT:

- Send emails
- Generate magic links
- Call APIs
- Persist share data
- Mint or redeem app share tokens
- Include deal identifiers or auth context

## ShareSummary — Required Fields (Exhaustive)

### Identity & Contract
- `summary_id`
  - opaque widget-generated identifier (uuid recommended)
- `contract_version`
  - integration contract version used to generate summary
- `created_at_iso`
  - ISO-8601 timestamp (UTC)
- `persona`
  - `"homeowner" | "buyer" | "realtor"`

### Display-Safe Headline Outputs (Basic Results Only)
(Subset governed by WGT-031; no advanced or sensitive fields)
- `estimated_cash_unlocked_usd`
- `estimated_equity_fraction_sold_pct`
- `estimated_future_value_range_usd` (e.g., { low, high })

### Input Highlights (Non-sensitive)
- `property_value_input_usd`
- `holding_period_years_input`

### Copy / Compliance
- `disclaimer_key`
  - pointer to known copy block/version
- `non_binding`
  - must be `true`

## Explicitly Prohibited Fields (Strict)

ShareSummary MUST NOT include:

- deal IDs
- draft tokens
- share tokens
- counterparty identifiers
- negotiation/version state
- user identifiers (email, user_id)
- authentication context
- legal clauses or binding quote language

If a field is not listed as required above, it is not permitted.

---

## Marketing Host Responsibilities (Locked)

Marketing MUST:

- Treat ShareSummary as opaque contract-defined data
- Forward it unchanged to `/api/share`
- Generate branded email + marketing magic link outside the widget
- Ensure email copy clearly indicates non-binding status

Marketing MUST NOT:

- Add, remove, or mutate ShareSummary fields
- Derive new metrics from ShareSummary
- Interpret ShareSummary as an offer/quote
- Attempt to connect marketing share to app-level deal permissions

---

## Marketing Magic Link Semantics (Clarified)

Marketing share links are **illustrative** and may point to:

- `/calculator?share=<opaque>` (marketing presentation mode), OR
- a marketing-safe landing that forwards into app onboarding

Marketing share links MUST NOT:

- grant access to real app deals
- mint or redeem `deal_share_tokens`
- create or modify `deal_access_grants`

---

# B) App Share (Authenticated / Deal-Backed)

App share is authoritative and permissioned.

## App Responsibilities (Locked)

The app:

- Mints share tokens server-side (only OWNER may mint)
- Redeems tokens authenticated
- Inserts VIEWER grants on redemption
- Enforces read-only view for recipients
- Supports token reuse distribution:
  - any user may distribute an existing token URL
  - only OWNER may mint new tokens

Marketing ShareSummary must never be reused for app-level sharing.

## Widget Role in App Mode (Optional)

When embedded in app mode, widget may:

- render share UI state, or
- emit a share intent event (no ShareSummary payload required)

But the app remains responsible for all token minting, redemption, and access control.

---

# C) Prohibitions (No Silent Mutation)

- Widget must not infer/enrich ShareSummary beyond allowed fields.
- Marketing must not “enhance” summaries.
- App must not treat ShareSummary as authoritative deal data.

Any violation requires contract review and WGT-050 version bump.

---

# Acceptance Criteria

- Marketing and app share semantics are strictly separated.
- ShareSummary schema is explicit and exhaustive.
- Marketing share cannot be mistaken for a binding deal.
- Widget never performs share delivery or access control.
- App share tokens remain OWNER-minted and permissioned.
- Token reuse distribution is explicitly allowed.

---

# Dependencies

- WGT-031 — Widget gating semantics
- WGT-040 — DraftSnapshot schema
- WGT-050 — Contract versioning + deprecation policy
- WGT-INT-001 — Public interface locked
- OPS-INT-001 — Multi-repo orchestration
- APP (Sprint 8+) — deal_share_tokens / deal_access_grants model

