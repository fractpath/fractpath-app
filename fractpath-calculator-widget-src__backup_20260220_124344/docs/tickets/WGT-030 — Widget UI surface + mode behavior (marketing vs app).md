# WGT-030 — Widget UI surface + mode behavior (marketing vs app)

## Sprint
Sprint 0 (alignment-only rewrite) → Sprint 5 (implementation)

## Objective
Define the widget’s rendered UI surface and behavioral differences by mode:
- `mode="marketing"` (unauthenticated, persuasive framing)
- `mode="app"` (authenticated, objective deal editing + review)

This ticket specifies **what UI elements exist, where they appear, and what events they emit**.
It does NOT define gating rules (WGT-031), share semantics (WGT-020), or schema/contract definitions (WGT-INT-001 / WGT-040 / WGT-050).

## Context (Locked Decisions)
- Widget is the canonical owner of **calculator math** and **schema validation**.
- Persona-specific **framing** exists in the widget for marketing, but the app renders results **objectively** (no marketing language).
- Marketing embeds the widget via tight package import; **no calculator compute logic exists in marketing**.
- App embeds the widget in authenticated contexts only.
- Widget supports two modes with different surfaces and CTAs.
- Host applications own routing, persistence, and API calls.
- Input capture is performed via a **modal overlay** (darkened background) with explicit **Apply** semantics (no silent recompute/save on every keystroke).

## Definitions
- **Persona (Day 1):** Homeowner, Buyer, Realtor
  - Homeowner + Buyer are primary.
  - Realtor is available Day 1 but accessed via a **tertiary entry** (link/button) rather than a third tab in the primary toggle.
- **Apply semantics:** User changes inputs inside the modal and clicks **Apply** to update the projection/output. No “live” projection updates while typing.
- **Result framing vs math:** Math engine output is objective; marketing mode adds persona-specific labels/cards/disclosures as a **presentation layer**.

---

## UI Surface (Shared Contract Across Modes)

### Shared: Layout Structure (All Modes)
The widget must render three regions in this order:
1) **Persona header**
   - Primary toggle: **Homeowner** and **Buyer**
   - Tertiary entry: **“Realtor (beta)”** (opens Realtor flow)
2) **Output Region**
   - Empty-state output (before first Apply)
   - After Apply: persona-specific output cards + charts (marketing) or objective output sections (app)
3) **Input Modal Trigger**
   - A single button that opens the input modal (label differs by mode)

### Shared: Input Capture Modal (All Modes)
Inputs must be captured in a modal overlay with:
- darkened backdrop
- focus trap + ESC to close
- scrollable content if needed
- **Apply** button (primary)
- Cancel/Close (secondary)
- inputs grouped by sections:
  - **Required inputs** (persona-specific)
  - **Assumptions** (accordion)

**Assumptions accordion behavior**
- `mode="marketing"`: assumptions are **read-only** with a note: “Editable after signup in your account.”
- `mode="app"`: assumptions are **editable** (same layout, editable controls).

### Shared: Apply + Recompute Rules
- The widget must not recompute the displayed projection until **Apply** is clicked.
- On Apply:
  - widget runs compute using canonical engine
  - widget updates output region
  - widget emits an event with the applied inputs + result (event differs by mode)
- Persona changes (including switching to Realtor):
  - must **invalidate** the current output (return to empty-state output)
  - must trigger a new modal capture (immediately open modal OR require user to click the modal trigger—implementation choice, but outcome is explicit)
  - must NOT “reframe” prior persona’s computed results

### Shared: Determinism
- Output rendering must be deterministic based on:
  - applied inputs
  - persona (marketing framing only)
  - contract/schema version
  - engine version
- No host-side math. No API calls from widget.

---

## mode="marketing" (Unauthenticated, persuasive framing)

### Must Render
- Persona header:
  - Toggle: Homeowner / Buyer
  - Tertiary: Realtor (beta) entry
- Output region:
  - Empty state output that clearly indicates: “Enter details to see your estimate”
  - After Apply: **persona-framed results** with:
    - **Headline KPI cards** (persona-specific)
    - **Primary chart(s)** (1–2 max, persuasive, lightweight)
    - **Assumptions disclosure** (read-only):
      - base appreciation assumption (e.g. “Assumes 4%/yr”)
      - fee model disclosure (“Includes platform fee assumptions”)
      - disclaimer (“Illustrative estimate”)
      - equity constraint disclosure: “You can only sell the portion of equity you own (FMV − mortgage).”
- Primary CTA: **“Save & Continue”**
- Secondary CTA: **“Edit Inputs”** (opens modal)
- Optional tertiary: “Share” (only if already in scope; keep minimal)

### Persona Headline KPI Cards (Marketing)
These are presentation requirements; underlying values must come from canonical compute output.

**Homeowner**
- Upfront cash (A)
- Monthly cashflow (B) (only if applicable)
- Projected net at sale event (D)

**Buyer**
- Ownership % over time (A)
- Monthly contribution + timeline (B)
- Effective purchase price / discount vs FMV (C)

**Realtor (beta)**
- Immediate commission potential (A)
- Future sale commission potential (B)
- Total commission potential (C)

### CTA Behavior (Marketing)
**Save & Continue**
- Emits `onMarketingSnapshot(payload)`
- Widget does NOT:
  - do email capture
  - mint draft tokens
  - navigate
  - call APIs

`onMarketingSnapshot(payload)` MUST include:
- persona (homeowner|buyer|realtor)
- applied inputs (canonical schema)
- computed result (canonical schema)
- presentation highlights (optional): list of KPI keys/cards shown in marketing mode

**Edit Inputs**
- Opens input modal

**Share** (if present)
- Emits `onShareSummary(summary)`
- Widget does not send emails or create links (host owns share delivery)

### Must NOT Render (Marketing)
- Email input or gating UI (WGT-031 governs gating outside this ticket)
- Any authenticated-only affordances
- Deal persistence UI or deal history
- Negotiation/counter UI
- “Ops tab” internal controls (unless explicitly required for investor demo; default hidden)

---

## mode="app" (Authenticated, objective deal review/edit)

### Must Render
- No marketing persona framing language or persuasion copy
- Output region:
  - Empty state if no saved/applied snapshot exists (prompt to “Add details”)
  - After Apply: **objective** outputs:
    - KPI summary (same numbers, neutral labels)
    - Terms sheet / breakdown (grouped)
    - Charts (as available)
    - Ops / payout waterfall + fee structure (objective) if already part of compute output (existing “ops tab” intent)
- Input modal trigger:
  - Label: **“Edit Deal Inputs”** (or equivalent neutral label)

### CTA / Event Behavior (App)
- On Apply in app mode:
  - widget computes and updates output region
  - widget emits `onAppSaveRequest(payload)` (name finalized in WGT-INT-001)

`onAppSaveRequest(payload)` MUST include:
- applied inputs (canonical schema)
- computed result (canonical schema)
- engine/meta info needed for persistence

The host app is responsible for:
- persisting snapshot to Deal ID
- showing save success/failure
- any versioning UI

### Must NOT Render (App)
- Marketing lead capture flows
- Marketing-branded copy, CTAs, or share email affordances
- “Save & Continue” semantics tied to draft token minting

---

## Host Responsibilities (Explicit Non-Widget Scope)
The widget must **never**:
- Perform routing or redirects
- Call app or marketing APIs directly
- Handle email capture or authentication state
- Persist data outside emitted callbacks

The host (marketing or app) is responsible for:
- Email gating and lead capture
- Draft-token minting and redemption (if used)
- Navigation and resume flows
- Share delivery and access control
- Deal persistence and versioning semantics

---

## Accessibility & Stability Notes
- Mode switching must not alter underlying math.
- Persona changes must reset output state (no accidental cross-persona reuse).
- Any future UI changes that affect emitted event payloads require contract review (WGT-INT-001 + WGT-050).

## Acceptance Criteria
- Explicit list of UI elements per mode, including modal overlay input pattern.
- Persona handling is clear:
  - Homeowner/Buyer toggle + Realtor tertiary entry
  - persona change resets output and forces new input capture
- Marketing outputs are persona-framed; app outputs are objective.
- Apply semantics are explicit: projection updates only on Apply.
- Widget emits clear events; host owns routing/persistence/lead capture.

## Dependencies
- WGT-031 — Widget gating semantics
- WGT-020 — Share semantics
- WGT-040 — Draft snapshot schema + stability guarantees
- WGT-050 — Contract versioning + deprecation policy
- WGT-INT-001 — Locked public interface
