"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CANONICAL_DEAL_TERM_DEFAULTS,
  CANONICAL_SCENARIO_DEFAULTS,
} from "@/lib/canonicalDefaults";

type AnyRecord = Record<string, unknown>;

export type DealTermsModalProps = {
  initial?: { deal_terms?: AnyRecord; scenario?: AnyRecord } | null;
  persona?: string;
  onClose: () => void;
  onSaved: (saved: { deal_terms: AnyRecord; scenario: AnyRecord }) => Promise<void> | void;
};

const D = CANONICAL_DEAL_TERM_DEFAULTS;
const SD = CANONICAL_SCENARIO_DEFAULTS;

type TabId = "payments" | "exit_terms" | "assumptions" | "fees";

const TABS: { id: TabId; label: string }[] = [
  { id: "payments", label: "Payments" },
  { id: "exit_terms", label: "Exit Terms" },
  { id: "assumptions", label: "Assumptions" },
  { id: "fees", label: "Fees" },
];

function safeN(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeNPos(v: unknown, fallback: number): number {
  const n = safeN(v, 0);
  return n > 0 ? n : fallback;
}

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-foreground mb-1">
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
      {children}
    </p>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 pb-4 border-b border-border/60 last:border-0 last:pb-0">
      <Label>{label}</Label>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5 pb-3 border-b border-border/60 last:border-0 last:pb-0">
      <Label>{label}</Label>
      <p className="text-sm font-medium">{value}</p>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {prefix && (
        <span className="text-sm text-muted-foreground">{prefix}</span>
      )}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className={`rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${className ?? "w-32"}`}
      />
      {suffix && (
        <span className="text-sm text-muted-foreground">{suffix}</span>
      )}
    </div>
  );
}

function SliderInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 accent-foreground cursor-pointer"
    />
  );
}

function CurrencyField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <FieldRow label={label} hint={hint}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <NumberInput
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            step={step ?? 1000}
            prefix="$"
          />
          <span className="text-sm font-medium text-muted-foreground">
            {fmtCurrency(value)}
          </span>
        </div>
        <SliderInput
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step ?? 1000}
        />
      </div>
    </FieldRow>
  );
}

// ─── Summary tiles ────────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/25 px-3 py-2 flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] text-muted-foreground leading-tight truncate">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums leading-tight truncate">
        {value}
      </span>
      {sub && (
        <span className="text-[10px] text-muted-foreground leading-tight truncate">
          {sub}
        </span>
      )}
    </div>
  );
}

function SummaryTiles({
  propertyValue,
  upfrontPayment,
  monthlyPayment,
  numPayments,
  exitYear,
}: {
  propertyValue: number;
  upfrontPayment: number;
  monthlyPayment: number;
  numPayments: number;
  exitYear: number;
}) {
  const totalMonthly = monthlyPayment * numPayments;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 border-b bg-muted/10">
      <SummaryTile label="Home value" value={fmtCurrency(propertyValue)} />
      <SummaryTile label="Upfront" value={fmtCurrency(upfrontPayment)} />
      <SummaryTile
        label="Monthly funding"
        value={
          numPayments > 0
            ? `${fmtCurrency(monthlyPayment)}/mo`
            : "None"
        }
        sub={numPayments > 0 ? `× ${numPayments} payments` : undefined}
      />
      <SummaryTile
        label="Target exit"
        value={`Year ${exitYear}`}
        sub={totalMonthly > 0 ? `Total ${fmtCurrency(upfrontPayment + totalMonthly)}` : undefined}
      />
    </div>
  );
}

// ─── Payments tab ─────────────────────────────────────────────────────────────

function PaymentsTab({
  propertyValue,
  setPropertyValue,
  upfrontPayment,
  setUpfrontPayment,
  monthlyPayment,
  setMonthlyPayment,
  numPayments,
  setNumPayments,
}: {
  propertyValue: number;
  setPropertyValue: (v: number) => void;
  upfrontPayment: number;
  setUpfrontPayment: (v: number) => void;
  monthlyPayment: number;
  setMonthlyPayment: (v: number) => void;
  numPayments: number;
  setNumPayments: (v: number) => void;
}) {
  return (
    <div className="space-y-4">
      <CurrencyField
        label="Home value (FMV)"
        hint="Current fair market value of the property."
        value={propertyValue}
        onChange={setPropertyValue}
        min={100000}
        max={3000000}
        step={5000}
      />
      <CurrencyField
        label="Upfront payment"
        hint="Amount paid at the start of the agreement."
        value={upfrontPayment}
        onChange={setUpfrontPayment}
        min={10000}
        max={600000}
        step={1000}
      />
      <FieldRow
        label="Monthly payment"
        hint="Recurring monthly funding amount (set to 0 if not applicable)."
      >
        <NumberInput
          value={monthlyPayment}
          onChange={setMonthlyPayment}
          min={0}
          max={5000}
          step={50}
          prefix="$"
          suffix="/mo"
        />
      </FieldRow>
      <FieldRow
        label="Number of payments"
        hint="Total months of scheduled monthly payments (0 if none)."
      >
        <NumberInput
          value={numPayments}
          onChange={setNumPayments}
          min={0}
          max={120}
          step={1}
          suffix="months"
        />
      </FieldRow>
    </div>
  );
}

// ─── Exit Terms tab ───────────────────────────────────────────────────────────

function ExitTermsTab({
  minimumHoldYears,
  setMinimumHoldYears,
  exitYear,
  setExitYear,
  firstExtYears,
  setFirstExtYears,
  firstExtPct,
  setFirstExtPct,
  secondExtYears,
  setSecondExtYears,
  secondExtPct,
  setSecondExtPct,
}: {
  minimumHoldYears: number;
  setMinimumHoldYears: (v: number) => void;
  exitYear: number;
  setExitYear: (v: number) => void;
  firstExtYears: number;
  setFirstExtYears: (v: number) => void;
  firstExtPct: number;
  setFirstExtPct: (v: number) => void;
  secondExtYears: number;
  setSecondExtYears: (v: number) => void;
  secondExtPct: number;
  setSecondExtPct: (v: number) => void;
}) {
  const firstExtEnd = exitYear + firstExtYears;
  const secondExtEnd = firstExtEnd + secondExtYears;

  return (
    <div className="space-y-4">
      <FieldRow
        label="Minimum hold"
        hint="Earliest point the agreement can be resolved through sale or buyout."
      >
        <NumberInput
          value={minimumHoldYears}
          onChange={(v) => setMinimumHoldYears(Math.max(0, Math.round(v)))}
          min={0}
          max={5}
          step={1}
          className="w-20"
          suffix={minimumHoldYears === 1 ? "year" : "years"}
        />
      </FieldRow>

      <FieldRow
        label="Target exit year"
        hint="Expected timing for resolution under the agreement."
      >
        <div className="flex flex-col gap-1.5">
          <NumberInput
            value={exitYear}
            onChange={(v) => setExitYear(Math.max(minimumHoldYears + 1, Math.round(v)))}
            min={1}
            max={15}
            step={1}
            className="w-20"
            suffix={exitYear === 1 ? "year" : "years"}
          />
          <SliderInput
            value={exitYear}
            onChange={(v) => setExitYear(Math.max(minimumHoldYears + 1, Math.round(v)))}
            min={1}
            max={15}
            step={1}
          />
        </div>
      </FieldRow>

      <div className="rounded-md border border-border bg-muted/10 px-4 py-3 space-y-3">
        <p className="text-xs font-semibold">Extension periods</p>

        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center font-bold text-[9px]">
              1
            </span>
            <div className="flex-1 space-y-1.5">
              <p className="text-xs font-medium">
                First extension — begins Year {exitYear}, ends Year {firstExtEnd}
              </p>
              <div className="flex flex-wrap gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">
                    Duration
                    <span className="ml-1 text-muted-foreground/70">
                      (additional years after target exit)
                    </span>
                  </p>
                  <NumberInput
                    value={firstExtYears}
                    onChange={(v) => setFirstExtYears(Math.max(1, Math.round(v)))}
                    min={1}
                    max={10}
                    step={1}
                    className="w-20"
                    suffix={firstExtYears === 1 ? "year" : "years"}
                  />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">
                    Premium
                    <span className="ml-1 text-muted-foreground/70">
                      (added to exit cost)
                    </span>
                  </p>
                  <NumberInput
                    value={parseFloat((firstExtPct * 100).toFixed(1))}
                    onChange={(v) => {
                      const n = parseFloat(v.toFixed(1));
                      if (Number.isFinite(n) && n >= 0) setFirstExtPct(n / 100);
                    }}
                    min={0}
                    max={50}
                    step={0.5}
                    className="w-20"
                    suffix="%"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 border border-orange-300 text-orange-700 flex items-center justify-center font-bold text-[9px]">
              2
            </span>
            <div className="flex-1 space-y-1.5">
              <p className="text-xs font-medium">
                Second extension — begins Year {firstExtEnd}, ends Year {secondExtEnd}
              </p>
              <div className="flex flex-wrap gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">
                    Duration
                    <span className="ml-1 text-muted-foreground/70">
                      (additional years after first extension)
                    </span>
                  </p>
                  <NumberInput
                    value={secondExtYears}
                    onChange={(v) => setSecondExtYears(Math.max(1, Math.round(v)))}
                    min={1}
                    max={10}
                    step={1}
                    className="w-20"
                    suffix={secondExtYears === 1 ? "year" : "years"}
                  />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">
                    Premium
                    <span className="ml-1 text-muted-foreground/70">
                      (applies through required marketing)
                    </span>
                  </p>
                  <NumberInput
                    value={parseFloat((secondExtPct * 100).toFixed(1))}
                    onChange={(v) => {
                      const n = parseFloat(v.toFixed(1));
                      if (Number.isFinite(n) && n >= 0) setSecondExtPct(n / 100);
                    }}
                    min={0}
                    max={50}
                    step={0.5}
                    className="w-20"
                    suffix="%"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
        <p className="text-xs font-semibold mb-1">Contract maturity</p>
        <p className="text-xs text-muted-foreground leading-snug">
          After the target exit timing and extension periods, the agreement may require
          active steps toward resolution — including marketing the property for sale, or
          a buyout if permitted. This is not a foreclosure.
        </p>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
          What this means
        </p>
        <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200 leading-snug list-disc pl-4">
          <li>
            You must hold the agreement for at least{" "}
            {plural(minimumHoldYears, "year")}. Before Year {exitYear} (and
            after the minimum hold), the agreement can be resolved through sale
            or buyout.
          </li>
          <li>
            If the agreement is still open after Year {exitYear}, a{" "}
            <strong>{plural(firstExtYears, "year")} first extension</strong>{" "}
            applies — adding{" "}
            <strong>{fmtPct(firstExtPct)}</strong> to the projected exit cost
            through Year {firstExtEnd}.
          </li>
          <li>
            A{" "}
            <strong>{plural(secondExtYears, "year")} second extension</strong>{" "}
            then applies (Year {firstExtEnd}–{secondExtEnd}), adding an
            additional{" "}
            <strong>{fmtPct(secondExtPct)}</strong> to the exit cost.
          </li>
          <li>
            After Year {secondExtEnd}, the agreement enters{" "}
            <strong>Required to Market</strong>. The{" "}
            {fmtPct(secondExtPct)} second extension premium continues to apply
            until the agreement is resolved.
          </li>
          <li>
            Resolution can include marketing the property for sale or a buyout
            under the contract — a forced sale is not the only path.
          </li>
        </ul>
      </div>
    </div>
  );
}

// ─── Assumptions tab ──────────────────────────────────────────────────────────

function AssumptionsTab({
  annualAppreciation,
  setAnnualAppreciation,
}: {
  annualAppreciation: number;
  setAnnualAppreciation: (v: number) => void;
}) {
  const pct = annualAppreciation * 100;
  return (
    <div className="space-y-4">
      <FieldRow
        label="Annual appreciation"
        hint="Assumed annual home value growth rate used in all scenario projections."
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={pct.toFixed(1)}
              min={0}
              max={15}
              step={0.5}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) setAnnualAppreciation(n / 100);
              }}
              className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">% / year</span>
          </div>
          <input
            type="range"
            value={pct}
            min={0}
            max={15}
            step={0.5}
            onChange={(e) =>
              setAnnualAppreciation(parseFloat(e.target.value) / 100)
            }
            className="w-full h-1.5 accent-foreground cursor-pointer"
          />
        </div>
      </FieldRow>

      <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
        <p className="text-xs font-semibold mb-1">About projections</p>
        <p className="text-xs text-muted-foreground leading-snug">
          Projections use this appreciation rate to estimate future home value
          and the buyer&#39;s proportional appreciation share. They are
          illustrative — not a guarantee or appraisal.
        </p>
      </div>
    </div>
  );
}

// ─── Fees tab (read-only computed) ────────────────────────────────────────────

function FeesTab({
  upfrontPayment,
  monthlyPayment,
  numPayments,
}: {
  upfrontPayment: number;
  monthlyPayment: number;
  numPayments: number;
}) {
  const contractedDealSize = upfrontPayment + monthlyPayment * numPayments;
  const rawSetupFee = contractedDealSize * D.setup_fee_pct;
  const setupFee = Math.min(
    Math.max(rawSetupFee, D.setup_fee_floor),
    D.setup_fee_cap,
  );
  const paymentAdminTotal = D.payment_admin_fee * numPayments;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground leading-snug">
        Platform fees are computed — not negotiable deal inputs. Values shown
        are estimates based on current payment configuration.
      </p>

      <ReadOnlyField
        label="Setup fee"
        value={fmtCurrency(setupFee)}
        hint={`${(D.setup_fee_pct * 100).toFixed(1)}% of contracted deal size (upfront + all monthly payments), floor ${fmtCurrency(D.setup_fee_floor)}, cap ${fmtCurrency(D.setup_fee_cap)}. Collected once at closing.`}
      />
      <ReadOnlyField
        label="Monthly servicing fee"
        value={`${fmtCurrency(D.servicing_fee_monthly)}/mo`}
        hint="Recurring monthly fee during the agreement term."
      />
      <ReadOnlyField
        label="Payment admin fee"
        value={
          numPayments > 0
            ? `${fmtCurrency(paymentAdminTotal)} total (${fmtCurrency(D.payment_admin_fee)} × ${numPayments} payments)`
            : `${fmtCurrency(D.payment_admin_fee)}/payment`
        }
        hint="Assessed per monthly funding disbursement."
      />
      <ReadOnlyField
        label="Exit admin fee"
        value={fmtCurrency(D.exit_admin_fee_amount)}
        hint="One-time fee collected at settlement."
      />
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function DealTermsModal({
  initial,
  onClose,
  onSaved,
}: DealTermsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("payments");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dt = useMemo(() => (initial?.deal_terms ?? {}) as AnyRecord, [initial]);
  const sc = useMemo(() => (initial?.scenario ?? {}) as AnyRecord, [initial]);

  const [propertyValue, setPropertyValue] = useState(() =>
    safeN(dt.property_value, D.property_value),
  );
  const [upfrontPayment, setUpfrontPayment] = useState(() =>
    safeN(dt.upfront_payment, D.upfront_payment),
  );
  const [monthlyPayment, setMonthlyPayment] = useState(() =>
    safeN(dt.monthly_payment, D.monthly_payment),
  );
  const [numPayments, setNumPayments] = useState(() =>
    safeN(dt.number_of_payments, D.number_of_payments),
  );
  const [minimumHoldYears, setMinimumHoldYears] = useState(() =>
    safeN(dt.minimum_hold_years, D.minimum_hold_years),
  );
  const [exitYear, setExitYear] = useState(() =>
    safeN(sc.exit_year, SD.exit_year),
  );
  const [firstExtYears, setFirstExtYears] = useState(() =>
    safeN(dt.first_extension_years, D.first_extension_years),
  );
  const [firstExtPct, setFirstExtPct] = useState(() =>
    safeNPos(dt.first_extension_premium_pct, D.first_extension_premium_pct),
  );
  const [secondExtYears, setSecondExtYears] = useState(() =>
    safeN(dt.second_extension_years, D.second_extension_years),
  );
  const [secondExtPct, setSecondExtPct] = useState(() =>
    safeNPos(dt.second_extension_premium_pct, D.second_extension_premium_pct),
  );
  const [annualAppreciation, setAnnualAppreciation] = useState(() =>
    safeN(sc.annual_appreciation, SD.annual_appreciation),
  );

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const deal_terms: AnyRecord = {
        ...dt,
        property_value: propertyValue,
        upfront_payment: upfrontPayment,
        monthly_payment: monthlyPayment,
        number_of_payments: numPayments,
        minimum_hold_years: minimumHoldYears,
        first_extension_years: firstExtYears,
        first_extension_premium_pct: firstExtPct,
        second_extension_years: secondExtYears,
        second_extension_premium_pct: secondExtPct,
      };
      const scenario: AnyRecord = {
        ...sc,
        annual_appreciation: annualAppreciation,
        exit_year: exitYear,
      };
      await onSaved({ deal_terms, scenario });
    } catch (err: any) {
      setError(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit deal terms"
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border bg-background shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4 flex-shrink-0">
          <h2 className="text-base font-semibold">Edit deal terms</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/60"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Summary tiles — always visible */}
        <SummaryTiles
          propertyValue={propertyValue}
          upfrontPayment={upfrontPayment}
          monthlyPayment={monthlyPayment}
          numPayments={numPayments}
          exitYear={exitYear}
        />

        {/* Tab bar */}
        <div className="flex border-b flex-shrink-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          {activeTab === "payments" && (
            <PaymentsTab
              propertyValue={propertyValue}
              setPropertyValue={setPropertyValue}
              upfrontPayment={upfrontPayment}
              setUpfrontPayment={setUpfrontPayment}
              monthlyPayment={monthlyPayment}
              setMonthlyPayment={setMonthlyPayment}
              numPayments={numPayments}
              setNumPayments={setNumPayments}
            />
          )}
          {activeTab === "exit_terms" && (
            <ExitTermsTab
              minimumHoldYears={minimumHoldYears}
              setMinimumHoldYears={setMinimumHoldYears}
              exitYear={exitYear}
              setExitYear={setExitYear}
              firstExtYears={firstExtYears}
              setFirstExtYears={setFirstExtYears}
              firstExtPct={firstExtPct}
              setFirstExtPct={setFirstExtPct}
              secondExtYears={secondExtYears}
              setSecondExtYears={setSecondExtYears}
              secondExtPct={secondExtPct}
              setSecondExtPct={setSecondExtPct}
            />
          )}
          {activeTab === "assumptions" && (
            <AssumptionsTab
              annualAppreciation={annualAppreciation}
              setAnnualAppreciation={setAnnualAppreciation}
            />
          )}
          {activeTab === "fees" && (
            <FeesTab
              upfrontPayment={upfrontPayment}
              monthlyPayment={monthlyPayment}
              numPayments={numPayments}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3.5 py-1.5 text-sm font-medium hover:bg-muted/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-foreground px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50 hover:bg-foreground/90"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
