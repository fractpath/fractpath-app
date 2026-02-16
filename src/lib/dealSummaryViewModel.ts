// src/lib/dealSummaryViewModel.ts
//
// Canonical-only view model.
// Canonical compute outputs live at:
//   snapshot_json.outputs.results (DealResults)
// This file no longer supports legacy widget shapes.

export type Kpi = {
  label: string;
  value: string;
};

export type DealSummaryViewModel = {
  kpis: Kpi[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && Array.isArray(v) === false;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function fmtPct(n: number, digits = 2): string {
  return (n * 100).toFixed(digits) + "%";
}

function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function extractCanonicalResults(
  outputs: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!outputs || !isRecord(outputs)) return null;

  // Canonical shape only: { results: DealResults }
  const results = (outputs as any).results;
  if (isRecord(results)) {
    return results as Record<string, unknown>;
  }

  // No legacy fallback support.
  return null;
}

export function buildDealSummaryViewModel(args: {
  contractVersion?: string | null;
  schemaVersion?: string | null;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
}): DealSummaryViewModel {
  const results = extractCanonicalResults(args.outputs);

  if (!results) {
    return {
      kpis: [{ label: "Status", value: "Not computed" }],
    };
  }

  const kpis: Kpi[] = [];

  const invested = asNumber((results as any).invested_capital_total);
  if (invested !== null) {
    kpis.push({
      label: "Invested capital",
      value: fmtMoney(invested),
    });
  }

  const fmv = asNumber((results as any).projected_fmv);
  if (fmv !== null) {
    kpis.push({
      label: "Projected FMV",
      value: fmtMoney(fmv),
    });
  }

  const settlement = asNumber((results as any).isa_settlement);
  if (settlement !== null) {
    kpis.push({
      label: "ISA settlement",
      value: fmtMoney(settlement),
    });
  }

  const multiple = asNumber((results as any).investor_multiple);
  if (multiple !== null) {
    kpis.push({
      label: "Investor multiple",
      value: fmtNum(multiple, 2) + "×",
    });
  }

  const irr = asNumber((results as any).investor_irr_annual);
  if (irr !== null) {
    kpis.push({
      label: "Investor IRR (annual)",
      value: fmtPct(irr, 2),
    });
  }

  const profit = asNumber((results as any).investor_profit);
  if (profit !== null) {
    kpis.push({
      label: "Investor profit",
      value: fmtMoney(profit),
    });
  }

  const vested = asNumber((results as any).vested_equity_percentage);
  if (vested !== null) {
    kpis.push({
      label: "Vested equity",
      value: fmtPct(vested, 2),
    });
  }

  if (kpis.length === 0) {
    kpis.push({ label: "Status", value: "Computed" });
  }

  return { kpis };
}
