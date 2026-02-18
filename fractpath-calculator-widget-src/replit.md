# FractPath Calculator Widget

## Overview
A React-based embeddable widget (ES module) for the FractPath Scenario Tool. It supports persona-based views (buyer, homeowner, investor, realtor, ops) with two modes (marketing/app), controlled calculator inputs, and structured payload emissions (DraftSnapshot, ShareSummary, SavePayload). Designed to be embedded in external sites.

## Project Architecture
- **Framework**: React 19 + TypeScript + Vite 7
- **Testing**: Vitest
- **Build output**: ES module (`dist/index.js`) for library consumption
- **Dev entry**: `index.html` → `src/main.tsx` (dev harness with persona/mode switcher)
- **Lib entry**: `src/lib/index.ts` (public exports for consumers)
- **Widget**: `src/widget/` (FractPathCalculatorWidget, wired calculator, persona config, formatting, snapshot builders, hashing)
- **Calc engine (widget)**: `src/calc/` (computeScenario, buildChartSeries, types, constants)
- **Canonical compute**: `packages/compute/` (@fractpath/compute v10.0.0 — single source of financial truth)
- **Components**: `src/components/EquityChart.tsx` (SVG line chart)
- **Contract docs**: `docs/architecture/integration-contract.md`
- **Sprint 10 specs**: `docs/financial-core/` (compute spec, runbook, integration specs)
- **Tests**: `src/__tests__/` (widget tests) + `packages/compute/tests/` (compute module tests)

## Key Files
- `vite.config.ts` - Vite config with ES lib build and dev server (port 5000)
- `src/lib/index.ts` - Public API exports (keep stable)
- `src/widget/wired.tsx` - Calculator UI with mode-gated outputs and CTAs
- `src/widget/types.ts` - All widget types (DraftSnapshot, ShareSummary, SavePayload, CalculatorMode, CalculatorPersona, WidgetEvent, etc.) + version constants
- `src/widget/hash.ts` - Deterministic SHA-256 hashing utility
- `src/widget/snapshot.ts` - Builders for DraftSnapshot, ShareSummary, SavePayload
- `src/widget/persona.ts` - Persona config (hero label, hero value selector, helper text)
- `src/widget/format.ts` - Formatting helpers (currency, percent, month)
- `src/calc/calc.ts` - Deterministic calc engine (computeScenario)
- `src/calc/constants.ts` - DEFAULT_INPUTS and default rates
- `src/main.tsx` - Dev harness entry point
- `docs/architecture/integration-contract.md` - Integration contract (WGT-INT-001)

## Widget Modes
- **marketing**: Shows Basic Results only (hero metric + settlement timing/net payout). Has "Save & Continue" (emits DraftSnapshot) and "Share" (emits ShareSummary) CTAs. No chart, no detailed fields.
- **app**: Full analysis with all outputs (raw payout, transfer fees, clamp details, equity chart). Has "Save" CTA (emits SavePayload with full ScenarioInputs/Outputs).

## Versioning
- `contract_version`: "1.0.0" — tracks integration contract version
- `schema_version`: "1.0.0" — tracks DraftSnapshot/ShareSummary/SavePayload schema version
- Both follow semver per WGT-050

## Development
- Dev server runs on port 5000 via `npm run dev`
- Build with `npm run build` → outputs to `dist/`
- Test with `npm test` → runs vitest (102 tests across 6 suites)
- Test compute only: `cd packages/compute && npm test` (72 tests across 3 suites)
- TypeScript build uses `tsconfig.build.json` for declarations

## @fractpath/compute (Sprint 10 AGENT-001)
- **Location**: `packages/compute/`
- **Version**: 10.0.0 (COMPUTE_VERSION)
- **Entry**: `computeDeal(terms: DealTerms, assumptions: ScenarioAssumptions): DealResults`
- **Pure functions only**: no DB, no network, no env vars, deterministic
- **Key files**:
  - `src/types.ts` — DealTerms, ScenarioAssumptions, DealResults
  - `src/computeDeal.ts` — all 11 financial steps per sprint-10-compute-spec
  - `src/irr.ts` — Newton-Raphson monthly IRR solver with bisection fallback
  - `src/rounding.ts` — roundMoney(2dp), roundIRRMonthly(6dp), roundIRRAnnual(4dp)
  - `src/version.ts` — COMPUTE_VERSION = "10.0.0"
- **Tests**: 72 tests covering standard/early/late/ceiling/floor/NO_FLOOR/zero-appreciation/FMV-override/determinism + IRR + rounding + DYF scenarios

## Recent Changes
- 2026-02-13: Sprint 10 AGENT-010 — Duration Yield Floor (DYF) feature: 3 optional DealTerms fields, 2 DealResults fields, applyDurationYieldFloor after standard clamp, 16 new tests (72 compute total, 102 repo total)
- 2026-02-12: Sprint 10 AGENT-001 — Canonical compute module (@fractpath/compute) with DealTerms/ScenarioAssumptions/DealResults, computeDeal(), IRR solver, rounding, 56 tests
- 2026-02-09: Sprint 5 implementation — marketing/app modes, DraftSnapshot, ShareSummary, SavePayload, deterministic hashing, mode-gated UI, integration contract doc, 30 vitest tests
- 2026-02-06: Implemented WGT-030 Calculator UI shell (controlled inputs, outputs panel, settlement rows, persona-driven hero, equity chart)
- 2026-02-06: Configured Vite dev server for Replit (port 5000, host 0.0.0.0, allowedHosts: true)
