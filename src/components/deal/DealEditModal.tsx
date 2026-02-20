"use client";

import { useState, useCallback } from "react";

type AnyRecord = Record<string, unknown>;

type DealEditModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialInputs: { deal_terms: AnyRecord; scenario: AnyRecord };
  onSave: (nextInputs: { deal_terms: AnyRecord; scenario: AnyRecord }) => void;
  saving?: boolean;
};

type FieldDef = {
  key: string;
  label: string;
  type: "number" | "select";
  step?: number;
  options?: Array<{ value: string; label: string }>;
};

const DEAL_TERM_FIELDS: FieldDef[] = [
  { key: "property_value", label: "Property Value", type: "number", step: 1000 },
  { key: "upfront_payment", label: "Upfront Payment", type: "number", step: 1000 },
  { key: "monthly_payment", label: "Monthly Payment", type: "number", step: 100 },
  { key: "number_of_payments", label: "Number of Payments", type: "number", step: 1 },
  { key: "contract_maturity_years", label: "Contract Maturity (yrs)", type: "number", step: 1 },
  { key: "payback_window_start_year", label: "Payback Window Start (yr)", type: "number", step: 1 },
  { key: "payback_window_end_year", label: "Payback Window End (yr)", type: "number", step: 1 },
  { key: "timing_factor_early", label: "Timing Factor (Early)", type: "number", step: 0.1 },
  { key: "timing_factor_late", label: "Timing Factor (Late)", type: "number", step: 0.1 },
  { key: "floor_multiple", label: "Floor Multiple", type: "number", step: 0.1 },
  { key: "ceiling_multiple", label: "Ceiling Multiple", type: "number", step: 0.1 },
  { key: "downside_mode", label: "Downside Mode", type: "select", options: [
    { value: "HARD_FLOOR", label: "Hard Floor" },
    { value: "NO_FLOOR", label: "No Floor" },
  ]},
  { key: "liquidity_trigger_year", label: "Liquidity Trigger (yr)", type: "number", step: 1 },
  { key: "minimum_hold_years", label: "Minimum Hold (yrs)", type: "number", step: 1 },
  { key: "platform_fee", label: "Platform Fee", type: "number", step: 100 },
  { key: "servicing_fee_monthly", label: "Servicing Fee (monthly)", type: "number", step: 10 },
  { key: "exit_fee_pct", label: "Exit Fee %", type: "number", step: 0.01 },
];

const SCENARIO_FIELDS: FieldDef[] = [
  { key: "annual_appreciation", label: "Annual Appreciation", type: "number", step: 0.005 },
  { key: "closing_cost_pct", label: "Closing Cost %", type: "number", step: 0.01 },
  { key: "exit_year", label: "Exit Year", type: "number", step: 1 },
];

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  if (field.type === "select" && field.options) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{field.label}</label>
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{field.label}</label>
      <input
        type="number"
        step={field.step ?? 1}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(field.key, raw === "" ? 0 : Number(raw));
        }}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
    </div>
  );
}

export function DealEditModal({ isOpen, onClose, initialInputs, onSave, saving }: DealEditModalProps) {
  const [dealTerms, setDealTerms] = useState<AnyRecord>({ ...initialInputs.deal_terms });
  const [scenario, setScenario] = useState<AnyRecord>({ ...initialInputs.scenario });

  const handleDealTermChange = useCallback((key: string, val: unknown) => {
    setDealTerms((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleScenarioChange = useCallback((key: string, val: unknown) => {
    setScenario((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = useCallback(() => {
    onSave({ deal_terms: dealTerms, scenario });
  }, [dealTerms, scenario, onSave]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-12">
      <div className="relative w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Scenario Terms</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-1">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Deal Terms</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DEAL_TERM_FIELDS.map((f) => (
                <FieldInput key={f.key} field={f} value={dealTerms[f.key]} onChange={handleDealTermChange} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Scenario Assumptions</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SCENARIO_FIELDS.map((f) => (
                <FieldInput key={f.key} field={f} value={scenario[f.key]} onChange={handleScenarioChange} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving\u2026" : "Save & Recompute"}
          </button>
        </div>
      </div>
    </div>
  );
}
