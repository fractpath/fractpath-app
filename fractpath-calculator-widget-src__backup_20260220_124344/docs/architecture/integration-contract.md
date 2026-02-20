# FractPath Calculator Widget — Integration Contract

**Contract Version**: `1.0.0`
**Schema Version**: `1.0.0`
**Status**: Active
**Ticket Reference**: WGT-INT-001, WGT-030, WGT-031, WGT-020, WGT-040, WGT-050

---

## 1. Overview

The FractPath Calculator Widget is a self-contained React component that performs deterministic scenario calculations for fractional home equity transactions. It emits structured payloads (DraftSnapshot, ShareSummary, SavePayload) via callback props — it never calls external APIs, handles authentication, or persists data.

## 2. Widget Modes

| Mode        | Description                                             |
|-------------|---------------------------------------------------------|
| `marketing` | Gated view showing only Basic Results; CTAs emit DraftSnapshot and ShareSummary |
| `app`       | Full view with all outputs; persistence hook via onSave |

## 3. Basic Results (Marketing Mode Allowlist)

Per WGT-031, the following fields are the ONLY outputs rendered in marketing mode:

- **Hero metric**: persona-driven net payout (standard settlement)
- **Settlement timing**: `settlementMonth` for early, standard, late
- **Settlement net payout**: `netPayout` for early, standard, late

Fields NOT shown in marketing mode:
- `rawPayout`, `clampedPayout`, `transferFeeAmount`, `transferFeeRate`
- `equityPctAtSettlement`, `homeValueAtSettlement`
- `clamp` details (floor, cap, applied)
- Full time series data

## 4. DraftSnapshot Schema (WGT-040)

Emitted via `onDraftSnapshot` callback when user clicks "Save & Continue" in marketing mode.

```typescript
type DraftSnapshot = {
  contract_version: string;       // e.g. "1.0.0"
  schema_version: string;         // e.g. "1.0.0"
  persona: CalculatorPersona;
  mode: "marketing";
  inputs: {
    homeValue: number;
    initialBuyAmount: number;
    termYears: number;
    annualGrowthRate: number;
  };
  basic_results: {
    standard_net_payout: number;
    early_net_payout: number;
    late_net_payout: number;
    standard_settlement_month: number;
    early_settlement_month: number;
    late_settlement_month: number;
  };
  input_hash: string;             // deterministic SHA-256 hex of sorted inputs JSON
  output_hash: string;            // deterministic SHA-256 hex of sorted basic_results JSON
  created_at: string;             // ISO 8601 timestamp
};
```

### Determinism Guarantee

Given identical `inputs` and `persona`, the `input_hash` and `output_hash` MUST produce identical values across any environment. Hashing uses SHA-256 over JSON with keys sorted alphabetically.

## 5. ShareSummary Schema (WGT-020)

Emitted via `onShareSummary` callback when user clicks "Share" in marketing mode.

```typescript
type ShareSummary = {
  contract_version: string;
  schema_version: string;
  persona: CalculatorPersona;
  inputs: {
    homeValue: number;
    initialBuyAmount: number;
    termYears: number;
    annualGrowthRate: number;
  };
  basic_results: {
    standard_net_payout: number;
    early_net_payout: number;
    late_net_payout: number;
  };
  created_at: string;
};
```

### Field Allowlist

ShareSummary MUST NOT contain: `input_hash`, `output_hash`, `mode`, settlement months, or any app-mode fields.

## 6. SavePayload Schema (App Mode)

Emitted via `onSave` callback in app mode.

```typescript
type SavePayload = {
  contract_version: string;
  schema_version: string;
  persona: CalculatorPersona;
  mode: "app";
  inputs: ScenarioInputs;
  outputs: ScenarioOutputs;
  input_hash: string;
  output_hash: string;
  created_at: string;
};
```

## 7. Widget Props (Public API)

```typescript
type FractPathCalculatorWidgetProps = {
  persona: CalculatorPersona;
  mode?: CalculatorMode;              // "marketing" (default) | "app"
  onDraftSnapshot?: (snapshot: DraftSnapshot) => void;
  onShareSummary?: (summary: ShareSummary) => void;
  onSave?: (payload: SavePayload) => void;
  onEvent?: (event: WidgetEvent) => void;
};
```

## 8. Versioning Policy (WGT-050)

- `contract_version` tracks the integration contract version (this document).
- `schema_version` tracks the DraftSnapshot/ShareSummary/SavePayload schema version.
- Both follow semver. Breaking changes increment the major version.
- Widget consumers MUST check `contract_version` compatibility before processing payloads.
- Deprecated fields are marked for removal with at least one minor version of advance notice.

## 9. Hard Prohibitions

- Widget MUST NOT call marketing or app APIs.
- Widget MUST NOT implement email capture, routing, redirects, auth, or persistence.
- Widget MUST NOT add fields to DraftSnapshot or ShareSummary beyond the explicit allowlists above.
- Widget MUST NOT change Basic Results enumeration or meanings.
