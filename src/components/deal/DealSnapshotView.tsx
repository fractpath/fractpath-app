// src/components/deal/DealSnapshotView.tsx

import React from "react";

type AnyRecord = Record<string, unknown>;

type DealSnapshotViewProps = {
  inputs: AnyRecord | null;
  results: AnyRecord | null;
  computeVersion?: string | null;
};

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function safeMoney(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function humanLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

const DEAL_TERMS_DISPLAY: Array<{ key: string; label: string; format: "money" | "pct" | "num" | "text" }> = [
  { key: "property_value", label: "Property Value", format: "money" },
  { key: "upfront_payment", label: "Upfront Payment", format: "money" },
  { key: "monthly_payment", label: "Monthly Payment", format: "money" },
  { key: "number_of_payments", label: "Number of Payments", format: "num" },
  { key: "contract_maturity_years", label: "Contract Maturity (yrs)", format: "num" },
  { key: "payback_window_start_year", label: "Payback Window Start (yr)", format: "num" },
  { key: "payback_window_end_year", label: "Payback Window End (yr)", format: "num" },
  { key: "timing_factor_early", label: "Timing Factor (Early)", format: "num" },
  { key: "timing_factor_late", label: "Timing Factor (Late)", format: "num" },
  { key: "floor_multiple", label: "Floor Multiple", format: "num" },
  { key: "ceiling_multiple", label: "Ceiling Multiple", format: "num" },
  { key: "downside_mode", label: "Downside Mode", format: "text" },
  { key: "liquidity_trigger_year", label: "Liquidity Trigger (yr)", format: "num" },
  { key: "minimum_hold_years", label: "Minimum Hold (yrs)", format: "num" },
  { key: "platform_fee", label: "Platform Fee", format: "money" },
  { key: "servicing_fee_monthly", label: "Servicing Fee (monthly)", format: "money" },
  { key: "exit_fee_pct", label: "Exit Fee", format: "pct" },
];

const SCENARIO_DISPLAY: Array<{ key: string; label: string; format: "pct" | "num" | "money" }> = [
  { key: "annual_appreciation", label: "Annual Appreciation", format: "pct" },
  { key: "closing_cost_pct", label: "Closing Costs", format: "pct" },
  { key: "exit_year", label: "Exit Year", format: "num" },
];

const RESULTS_DISPLAY: Array<{ key: string; label: string; format: "money" | "pct" | "num" }> = [
  { key: "invested_capital_total", label: "Invested Capital", format: "money" },
  { key: "projected_fmv", label: "Projected FMV", format: "money" },
  { key: "isa_settlement", label: "ISA Settlement", format: "money" },
  { key: "investor_profit", label: "Investor Profit", format: "money" },
  { key: "investor_multiple", label: "Investor Multiple", format: "num" },
  { key: "investor_irr_annual", label: "Investor IRR (Annual)", format: "pct" },
  { key: "vested_equity_percentage", label: "Vested Equity", format: "pct" },
  { key: "base_equity_value", label: "Base Equity Value", format: "money" },
  { key: "gain_above_capital", label: "Gain Above Capital", format: "money" },
  { key: "floor_amount", label: "Floor Amount", format: "money" },
  { key: "ceiling_amount", label: "Ceiling Amount", format: "money" },
];

function formatField(value: unknown, format: string): string {
  if (value == null) return "\u2014";
  if (typeof value === "string") return value;
  const n = safeMoney(value);
  if (n === null) return String(value);
  switch (format) {
    case "money": return fmtMoney(n);
    case "pct": return fmtPct(n);
    case "num": return fmtNum(n);
    default: return String(n);
  }
}

function FieldGrid({ title, fields, data }: { title: string; fields: typeof DEAL_TERMS_DISPLAY; data: AnyRecord | null }) {
  if (!data) return null;

  const visibleFields = fields.filter((f) => data[f.key] !== undefined && data[f.key] !== null);
  if (visibleFields.length === 0) return null;

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {visibleFields.map((f) => (
          <div key={f.key} className="rounded-md border border-gray-100 px-3 py-2 dark:border-gray-800">
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{f.label}</div>
            <div className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">
              {formatField(data[f.key], f.format)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DealSnapshotView({ inputs, results, computeVersion }: DealSnapshotViewProps) {
  const dealTerms = inputs?.deal_terms as AnyRecord | undefined;
  const scenario = inputs?.scenario as AnyRecord | undefined;

  const hasData = !!(dealTerms || scenario || results);

  if (!hasData) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
        <p className="text-sm text-gray-500 dark:text-gray-400">No snapshot data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Scenario Details
        </h3>
        {computeVersion ? (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            compute v{computeVersion}
          </span>
        ) : null}
      </div>

      <div className="space-y-5">
        <FieldGrid title="Deal Terms" fields={DEAL_TERMS_DISPLAY} data={dealTerms ?? null} />
        <FieldGrid title="Scenario Assumptions" fields={SCENARIO_DISPLAY} data={scenario ?? null} />
        <FieldGrid title="Computed Results" fields={RESULTS_DISPLAY} data={results ?? null} />
      </div>
    </div>
  );
}
