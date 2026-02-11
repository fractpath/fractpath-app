import type { SnapshotDisplayData } from "./dealSnapshotDisplay";
import { formatValue, humanLabel } from "./dealSnapshotDisplay";

export interface KpiItem {
  label: string;
  value: string;
}

export interface ExitRow {
  label: string;
  netPayout: string;
  timing: string;
}

export interface AssumptionItem {
  label: string;
  value: string;
}

export interface DealSummaryViewModel {
  kpis: KpiItem[];
  exits: ExitRow[];
  assumptions: AssumptionItem[];
  flags: {
    isHistorical: boolean;
    hasOutputs: boolean;
    hasExits: boolean;
    hasAssumptions: boolean;
  };
}

const HEADLINE_OUTPUT_KEYS = [
  "net_at_exit",
  "net_payout",
  "total_return",
  "estimated_value",
  "headline_value",
];

const SUPPORTING_OUTPUT_KEYS = [
  "buy_amount",
  "purchase_price",
  "term",
  "term_years",
  "growth_rate",
  "annual_growth",
  "monthly_payment",
  "equity_share",
];

const EXIT_KEYS: { key: string; label: string }[] = [
  { key: "early", label: "Early exit" },
  { key: "standard", label: "Standard exit" },
  { key: "late", label: "Late exit" },
];

const ASSUMPTION_KEYS = [
  "home_value",
  "property_value",
  "appreciation_rate",
  "discount_rate",
  "holding_period",
  "term",
  "term_years",
  "inflation_rate",
];

export function buildDealSummaryViewModel(
  display: SnapshotDisplayData | null,
  isHistorical: boolean,
): DealSummaryViewModel {
  const empty: DealSummaryViewModel = {
    kpis: [{ label: "Status", value: "Scenario saved" }],
    exits: [],
    assumptions: [],
    flags: {
      isHistorical,
      hasOutputs: false,
      hasExits: false,
      hasAssumptions: false,
    },
  };

  if (!display) return empty;

  const outputs = display.outputs;
  const inputs = display.inputs;

  const kpis: KpiItem[] = [];

  if (outputs) {
    let headlineFound = false;
    for (const key of HEADLINE_OUTPUT_KEYS) {
      if (key in outputs && outputs[key] != null) {
        kpis.push({ label: humanLabel(key), value: formatValue(outputs[key]) });
        headlineFound = true;
        break;
      }
    }
    if (!headlineFound) {
      kpis.push({ label: "Status", value: "Scenario saved" });
    }

    for (const key of SUPPORTING_OUTPUT_KEYS) {
      if (key in outputs && outputs[key] != null) {
        kpis.push({ label: humanLabel(key), value: formatValue(outputs[key]) });
      }
      if (kpis.length >= 5) break;
    }

    if (kpis.length < 5 && inputs) {
      for (const key of SUPPORTING_OUTPUT_KEYS) {
        if (kpis.length >= 5) break;
        if (key in inputs && inputs[key] != null) {
          const alreadyAdded = kpis.some((k) => k.label === humanLabel(key));
          if (!alreadyAdded) {
            kpis.push({ label: humanLabel(key), value: formatValue(inputs[key]) });
          }
        }
      }
    }
  } else {
    kpis.push({ label: "Status", value: "Scenario saved" });
  }

  const exits: ExitRow[] = [];
  if (outputs) {
    const settlements =
      outputs.settlements && typeof outputs.settlements === "object" && !Array.isArray(outputs.settlements)
        ? (outputs.settlements as Record<string, unknown>)
        : null;

    if (settlements) {
      for (const { key, label } of EXIT_KEYS) {
        const caseData = settlements[key];
        if (caseData && typeof caseData === "object" && !Array.isArray(caseData)) {
          const c = caseData as Record<string, unknown>;
          exits.push({
            label,
            netPayout: formatValue(c.net_payout ?? c.net ?? c.payout ?? null),
            timing: formatValue(c.timing ?? c.year ?? c.exit_year ?? null),
          });
        }
      }
    }

    if (exits.length === 0) {
      for (const { key, label } of EXIT_KEYS) {
        const exitKey = `exit_${key}`;
        if (exitKey in outputs && outputs[exitKey] != null) {
          const val = outputs[exitKey];
          if (val && typeof val === "object" && !Array.isArray(val)) {
            const c = val as Record<string, unknown>;
            exits.push({
              label,
              netPayout: formatValue(c.net_payout ?? c.net ?? c.payout ?? null),
              timing: formatValue(c.timing ?? c.year ?? c.exit_year ?? null),
            });
          }
        }
      }
    }
  }

  const assumptions: AssumptionItem[] = [];
  if (inputs) {
    for (const key of ASSUMPTION_KEYS) {
      if (key in inputs && inputs[key] != null) {
        assumptions.push({ label: humanLabel(key), value: formatValue(inputs[key]) });
      }
      if (assumptions.length >= 6) break;
    }
  }

  return {
    kpis,
    exits,
    assumptions,
    flags: {
      isHistorical,
      hasOutputs: !!outputs,
      hasExits: exits.length > 0,
      hasAssumptions: assumptions.length > 0,
    },
  };
}
