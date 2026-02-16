export type Kpi = {
  label: string;
  value: string;
};

export type DealSummaryViewModel = {
  kpis: Kpi[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeMoney(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
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

  const maybeResults = (outputs as any).results;
  if (isRecord(maybeResults)) {
    return maybeResults;
  }

  if (
    "invested_capital_total" in outputs ||
    "isa_settlement" in outputs ||
    "projected_fmv" in outputs ||
    "investor_multiple" in outputs ||
    "investor_irr_annual" in outputs
  ) {
    return outputs;
  }

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

  const invested = safeMoney(results.invested_capital_total);
  if (invested !== null) {
    kpis.push({ label: "Invested capital", value: fmtMoney(invested) });
  }

  const fmv = safeMoney(results.projected_fmv);
  if (fmv !== null) {
    kpis.push({ label: "Projected FMV", value: fmtMoney(fmv) });
  }

  const settlement = safeMoney(results.isa_settlement);
  if (settlement !== null) {
    kpis.push({ label: "ISA settlement", value: fmtMoney(settlement) });
  }

  const multiple = safeMoney(results.investor_multiple);
  if (multiple !== null && multiple >= 0 && multiple <= 10) {
    kpis.push({ label: "Investor multiple", value: fmtNum(multiple, 2) + "\u00d7" });
  }

  const irr = safeMoney(results.investor_irr_annual);
  if (irr !== null && Math.abs(irr) <= 1) {
    kpis.push({ label: "Investor IRR (annual)", value: fmtPct(irr, 2) });
  }

  const profit = safeMoney(results.investor_profit);
  if (profit !== null) {
    kpis.push({ label: "Investor profit", value: fmtMoney(profit) });
  }

  const vested = safeMoney(results.vested_equity_percentage);
  if (vested !== null) {
    kpis.push({ label: "Vested equity", value: fmtPct(vested, 2) });
  }

  if (kpis.length === 0) {
    return {
      kpis: [{ label: "Status", value: "Computed (insufficient data)" }],
    };
  }

  return { kpis };
}
