# WGT-031 — Widget Gating Semantics (Marketing vs App) — Render/Emit Rules

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 9 (implementation foundation)

---

# Objective

Define strict, unambiguous gating rules for what the widget may **render** and **emit** in:

- `mode="marketing"` (unauthenticated, illustrative)
- `mode="app"` (authenticated, authoritative rendering of persisted snapshots)

These rules prevent interpretation drift across repos and enforce the separation between:

- **persuasive projection** (marketing)
- **auditable, permissioned deal review/edit** (app)

This ticket governs **what may be shown and emitted**, not styling (WGT-030) or interface wiring (WGT-INT-001 / WGT-040 / WGT-020).

---

# Context (Locked Decisions)

- Widget compute engine is canonical (single source of truth for economic math).
- Marketing embeds widget and performs **no calculator math**.
- App owns:
  - deal creation
  - persistence
  - versioning
  - permissions
  - share tokens (deal-backed)
- Marketing operates on **illustrative drafts** only.
- App operates on **saved deal snapshots** tied to `deal_id` and `version_id`.
- App persisted snapshots are computed server-side using the same compute module (APP-002).

---

# Definitions

## Basic Results (Marketing)
A strictly limited, non-binding subset of the canonical compute outputs intended to communicate directional value only.

Rules:
- Basic Results must map directly to fields in the canonical compute output.
- Widget must not introduce marketing-only math or derived metrics outside the engine.

## Full Deal Outputs (App)
Any outputs that reveal:
- pricing mechanics (TF/FM/CM/CPW)
- fee waterfalls
- schedules / tables that look contractual
- version history
- acceptance state
- anything that could be interpreted as binding terms

## DraftSnapshot
A widget-produced, non-binding transport payload that includes:
- canonical inputs
- explicit assumptions
- metadata

It exists to resume in app where the server recomputes and persists version 1.

DraftSnapshot is not a deal.

## ShareSummary
Marketing-safe payload for marketing share only (WGT-020). Not deal-backed.

---

# Mode Semantics

## A) mode="marketing" (Unauthenticated, illustrative)

### Allowed (Render)
- Persona selector UX.
- Input capture via modal (WGT-030).
- Render **Basic Results only** (explicit list below).
- Render disclaimers and disclosures.

### Allowed (Emit)
- Emit `onDraftSnapshot(draft: DraftSnapshot)` on Save & Continue intent (host handles email + token).
- Emit `onShareSummary(summary: ShareSummary)` for marketing share.
- Emit `onEvent(name,payload)` telemetry events.

### Prohibited
- Rendering Full Deal Outputs.
- Rendering schedules/tables that look like deal terms (payment schedules, payout schedules, fee breakdown tables).
- Creating or referencing real Deal IDs.
- Any persistence or API calls from widget.
- Any “unlocking” of outputs beyond Basic Results.
- Displaying anything that could reasonably be construed as a binding quote.

**Alignment correction:** Marketing DraftSnapshots are not authoritative results.
Marketing mode may compute for UI preview, but app must recompute server-side before persisting.

---

## B) mode="app" (Authenticated, authoritative rendering)

### Allowed (Render)
- Render full outputs from the **persisted snapshot** provided by the host app.
- Render objective review surfaces (charts, terms sheet sections, tables).
- Render role-gated actions driven by host app (Apply, Share, etc.).

### Allowed (Emit)
- Emit `onApplyRequest(nextInputs)` to request a new version (OWNER-only, enforced by host).
- Emit `onEvent(name,payload)` telemetry.

### Prohibited
- Marketing lead capture CTAs.
- Marketing persuasion copy/gates (email blur, Save & Continue).
- Draft-token semantics.
- Client-side persistence of snapshots.
- Any host-unknown recompute being treated as authoritative.

**Important:** In app mode, the widget should ideally render from `snapshot.outputs_json` supplied by app, not silently recompute on mount. Any recompute is preview-only unless host persists a server-computed version.

---

# Basic Results (Marketing) — Explicit, Exhaustive Render List

In `mode="marketing"`, widget may render only:

## 1) Headline KPIs (Persona-Framed, Illustrative)
Must be clearly labeled “Illustrative estimate”.

- Homeowner (examples):
  - Upfront cash estimate
  - Monthly contribution summary (if applicable)
  - High-level retained ownership estimate at horizon (non-binding)

- Buyer (examples):
  - Contribution summary (upfront/monthly)
  - Directional ownership path headline (non-binding)
  - Simple “paid X to earn ~Y% by year N” framing

- Realtor (examples):
  - Referral/commission potential (illustrative, labeled “example”)
  - No fee waterfall table

## 2) Directional Ranges
- Future value range (if engine provides it)
- Holding period / horizon summary
- High-level “early/standard/late” as ranges only (no settlement payout tables)

## 3) Visualizations (Max Two)
- Simple ownership/value over time chart
- Optional secondary chart, but must not expose hidden detailed schedules

No interactive “exportable” tables in marketing.

## 4) Assumptions & Disclosures (Read-only)
- Appreciation assumption
- Equity availability constraint disclosure (FMV − mortgage)
- General disclaimer: “Illustrative; not a binding offer”
- Disclaimer key/copy reference

## 5) Display-Safe Metadata
- persona
- calculator schema version
- engine/terms version identifiers (display-safe)

---

# Explicitly Excluded (Marketing)

If a field/concept is not listed above, it must not render in marketing mode.

Marketing mode must NOT render:

- payment schedule tables
- settlement payout tables
- fee waterfalls
- APR / implied rates presented as contractual
- editable advanced assumptions
- version history comparisons
- legal/contractual clause language
- anything that implies a committed offer

---

# Save & Continue Flow (Marketing)

Marketing host owns gating and network.

Widget flow:

1) User edits inputs
2) User clicks Apply → widget computes preview → renders Basic Results only
3) User clicks Save & Continue → widget emits `onDraftSnapshot(draft)`
4) Host captures email and mints resume token via `/api/lead` (MKT-006)
5) Host redirects into app resume

---

# Marketing Share Flow

1) User clicks Share → widget emits `onShareSummary(summary)` (WGT-020)
2) Host sends branded email + marketing magic link
3) No deal access granted, no app share tokens involved

---

# App Share Flow (Deal-Backed)

- Widget may show share UI state in app mode.
- All share token mint/redeem logic and access control is app-owned.
- Only OWNER may mint new app share tokens.
- Any user may distribute an existing app share token URL.

---

# Acceptance Criteria

- Basic Results are explicitly enumerated and exhaustive.
- Marketing renders no outputs outside the list.
- DraftSnapshot is emitted as transport payload (inputs + assumptions + meta).
- App mode renders authoritative snapshot outputs provided by host app.
- No silent unlocks, no widget networking, no persistence.
- ShareSummary is marketing-safe and non-binding (WGT-020).

---

# Dependencies

- WGT-030 — Widget UI surface + mode behavior
- WGT-020 — Share semantics
- WGT-040 — DraftSnapshot schema
- WGT-INT-001 — Locked public interface

