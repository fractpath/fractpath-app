# WGT-INT-001 — Lock widget public interface (Integration Contract Mirror)

## Sprint
Sprint 0 (alignment-only) → enables Sprint 5 execution

## Objective
Make the widget repo the **audited implementation reference** for the widget’s public API and cross-repo payloads by
mirroring the canonical integration contract:

- Canonical contract: `docs/architecture/integration-contract.md` (project-level source of truth)
- Widget repo: maintains a **verbatim mirror** used by widget engineers and Sprint 5 agents

This ticket establishes a controlled change process that prevents silent mutation across repos.

---

## Clarification (Canonical vs Mirror)
- The **canonical contract file** lives at the project level (`docs/architecture/integration-contract.md`).
- This repo must contain a **verbatim mirror** of that file (or a direct reference mechanism) so widget work is contract-driven.
- The widget is canonical for:
  - calculator math + schema validation (`CalculatorInputsV1`, `CalculatorResultV1`)
  - marketing persona presentation framing (marketing mode only)
  - producing DraftSnapshot and ShareSummary payloads (host delivers)
- The widget repo is not allowed to diverge from the canonical contract without coordinated versioning (WGT-050).

---

## Non-Goals
- No code execution in Sprint 0.
- No marketing or app code changes here.
- No UI implementation changes (WGT-030).
- No gating logic changes (WGT-031).
- No share delivery logic (WGT-020 defines payload shape; delivery is host-owned).
- No persistence semantics here (app tickets govern DB/API).

---

## Deliverables (Docs Only)

### 1) Contract mirror
Add:
- `docs/architecture/integration-contract.md` in this repo as a **verbatim mirror** of the canonical contract.

Requirements:
- Include a header stating:
  - this file is a mirror
  - it must remain identical to canonical
  - changes must follow WGT-050 and OPS-INT-001

### 2) Versioning + deprecation policy reference
Add:
- `docs/architecture/contract-versioning.md` that references and aligns with WGT-050.

Must include:
- version identifiers and what they govern:
  - `contract_version`
  - `calculator_schema_version`
  - payload `schema_version` (DraftSnapshot/ShareSummary/app save payload)
- semantic versioning rules (MAJOR/MINOR/PATCH)
- compatibility window and deprecation policy
- coordinated release requirements (OPS-INT-001)
- “no silent mutation” statement

### 3) Public API reference (widget integration surface)
Add:
- `docs/architecture/public-api.md` summarizing the widget’s integration surface.

Must include:
- exported component(s) and name(s)
- prop signatures (including `mode="marketing" | "app"`)
- callback/event signatures and when they fire:
  - marketing:
    - `onMarketingSnapshot(snapshot)` (Save & Continue)
    - `onShareSummary(summary)` (optional)
  - app:
    - `onAppSaveRequest(payload)` (Apply in app mode)
- payload schema references and where to find them:
  - DraftSnapshot (WGT-040)
  - ShareSummary (WGT-020)
  - calculator contract schemas (WGT-040 + WGT-050)
- mode semantics pointers:
  - WGT-030 (UI surface + modal Apply semantics)
  - WGT-031 (gating and marketing-safe output rules)

---

## Stability Guarantees (Hard Rules)
Any change to public props/callbacks or payload shapes requires:
1) canonical contract update
2) version bump per WGT-050
3) widget repo mirror update (this ticket)
4) coordinated cross-repo update governed by OPS-INT-001
5) release notes entry in widget repo

No silent mutation:
- payloads emitted by the widget must remain redeemable/usable by marketing/app within the compatibility window.
- compute determinism must not depend on persona (persona affects marketing framing only).

---

## Resolved Parameters (Locked Now)
To prevent interpretive drift:

- Initial `contract_version`: **1.0.0**
- Initial `calculator_schema_version`: **1.0.0**
- Compatibility window (minimum):
  - Receivers (marketing/app) must support:
    - current MAJOR of `contract_version`
    - at least one prior MINOR within that MAJOR
  - App must redeem DraftSnapshots for:
    - current MAJOR of DraftSnapshot `schema_version`
    - at least one prior MINOR within that MAJOR
  - App must render persisted calculator snapshots for:
    - current MAJOR of `calculator_schema_version`
    - at least one prior MINOR within that MAJOR

(Any widening of the window is allowed; any narrowing requires explicit OPS coordination.)

---

## Acceptance Criteria
- Widget repo contains:
  - the canonical contract mirror
  - versioning/deprecation policy reference aligned with WGT-050
  - public API reference sufficient for Sprint 5 agents
- Contract updates cannot occur without coordinated version bump and OPS governance.
- Docs explicitly encode:
  - marketing persona framing exists only in marketing mode
  - app outputs are objective and snapshot-based

---

## Dependencies
- WGT-050 — Contract versioning + deprecation policy
- OPS-INT-001 — Multi-repo orchestration governor
- Canonical contract: `docs/architecture/integration-contract.md` (project-level)

## Notes
This ticket defines governance and documentation artifacts only.
Implementation work remains in WGT-030/WGT-031/WGT-020/WGT-040 and Sprint 5 execution.
