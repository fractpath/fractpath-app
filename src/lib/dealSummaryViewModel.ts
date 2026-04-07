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

function extractCanonicalResults(
  outputs: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!outputs || !isRecord(outputs)) return null;

  const maybeResults = (outputs as any).results;
  if (isRecord(maybeResults)) {
    return maybeResults;
  }

  // v11 flat-results detection (no nested .results wrapper)
  if (
    "current_contract_value" in outputs ||
    "current_participation_value" in outputs ||
    "extension_adjusted_buyout_amount" in outputs ||
    "funding_completion_factor" in outputs ||
    "fractpath_revenue_to_date" in outputs
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

  const contractValue = safeMoney(results.current_contract_value);
  if (contractValue !== null) {
    kpis.push({ label: "Contract value", value: fmtMoney(contractValue) });
  }

  const participationValue = safeMoney(results.current_participation_value);
  if (participationValue !== null) {
    kpis.push({ label: "Participation value", value: fmtMoney(participationValue) });
  }

  const buyout = safeMoney(results.extension_adjusted_buyout_amount);
  if (buyout !== null) {
    kpis.push({ label: "Buyout amount", value: fmtMoney(buyout) });
  }

  const fundingCompletion = safeMoney(results.funding_completion_factor);
  if (fundingCompletion !== null && fundingCompletion >= 0 && fundingCompletion <= 1) {
    kpis.push({ label: "Funding completion", value: fmtPct(fundingCompletion, 1) });
  }

  const fractpathRevenue = safeMoney(results.fractpath_revenue_to_date);
  if (fractpathRevenue !== null) {
    kpis.push({ label: "FractPath revenue", value: fmtMoney(fractpathRevenue) });
  }

  if (kpis.length === 0) {
    return {
      kpis: [{ label: "Status", value: "Computed (insufficient data)" }],
    };
  }

  return { kpis };
}
