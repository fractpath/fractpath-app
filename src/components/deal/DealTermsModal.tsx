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

const FIXED_EXT_FIRST_MONTHS = 12;
const FIXED_EXT_SECOND_MONTHS = 12;

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

function ExitTermsTab({
  minimumHoldYears,
  setMinimumHoldYears,
  exitYear,
  setExitYear,
  firstExtPct,
  secondExtPct,
}: {
  minimumHoldYears: number;
  setMinimumHoldYears: (v: number) => void;
  exitYear: number;
  setExitYear: (v: number) => void;
  firstExtPct: number;
  secondExtPct: number;
}) {
  return (
    <div className="space-y-5">
      <FieldRow
        label="Minimum hold"
        hint="The earliest point at which the agreement can be exited."
      >
        <div className="flex items-center gap-2">
          <NumberInput
            value={minimumHoldYears}
            onChange={(v) => setMinimumHoldYears(Math.max(0, Math.round(v)))}
            min={0}
            max={5}
            step={1}
            className="w-20"
            suffix={minimumHoldYears === 1 ? "year" : "years"}
          />
        </div>
      </FieldRow>

      <FieldRow
        label="Expected exit timing"
        hint="Modeled year for the scenario projection. Adjust to explore different exit timelines."
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <NumberInput
              value={exitYear}
              onChange={(v) => setExitYear(Math.max(1, Math.round(v)))}
              min={1}
              max={15}
              step={1}
              className="w-20"
              suffix={exitYear === 1 ? "year" : "years"}
            />
          </div>
          <SliderInput
            value={exitYear}
            onChange={(v) => setExitYear(Math.round(v))}
            min={1}
            max={15}
            step={1}
          />
        </div>
      </FieldRow>

      <div className="rounded-md border border-border bg-muted/20 px-4 py-3 space-y-2.5">
        <p className="text-xs font-semibold">Extension periods</p>
        <p className="text-xs text-muted-foreground leading-snug">
          This agreement includes two fixed extension periods after the expected
          exit timing. Extension durations are standard contract structure and
          are not negotiable inputs.
        </p>
        <ul className="space-y-2 mt-1">
          <li className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center font-bold text-[9px]">
              1
            </span>
            <span>
              <span className="font-medium">First extension:</span>{" "}
              {FIXED_EXT_FIRST_MONTHS} months — adds{" "}
              <span className="font-medium text-amber-700">
                {(firstExtPct * 100).toFixed(0)}%
              </span>{" "}
              to exit cost
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 border border-orange-300 text-orange-700 flex items-center justify-center font-bold text-[9px]">
              2
            </span>
            <span>
              <span className="font-medium">Second extension:</span>{" "}
              {FIXED_EXT_SECOND_MONTHS} months — adds{" "}
              <span className="font-medium text-orange-700">
                {(secondExtPct * 100).toFixed(0)}%
              </span>{" "}
              to exit cost
            </span>
          </li>
        </ul>
      </div>

      <div className="rounded-md border border-border bg-muted/20 px-4 py-3 space-y-2">
        <p className="text-xs font-semibold">Contract maturity</p>
        <p className="text-xs text-muted-foreground leading-snug">
          If the agreement remains open after the expected exit timing, the
          contract may require active steps toward resolution. This can include
          marketing the property for sale if no written extension is in place.
        </p>
        <p className="text-xs text-muted-foreground leading-snug">
          The agreement may also be resolved through a buyout under the
          contract — a sale is not the only path. Extension periods are fixed
          parts of the contract structure and require written handling. If
          extension periods apply, they increase the total exit cost.
        </p>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
          What this means
        </p>
        <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200 leading-snug list-disc pl-4">
          <li>
            You must hold the agreement for at least{" "}
            {minimumHoldYears} {minimumHoldYears === 1 ? "year" : "years"}.
          </li>
          <li>
            The expected exit timing is{" "}
            {exitYear} {exitYear === 1 ? "year" : "years"}.
          </li>
          <li>
            If the agreement remains open after that point, fixed extension
            premiums may increase the total exit cost — the first extension
            adds {(firstExtPct * 100).toFixed(0)}% and the second adds{" "}
            {(secondExtPct * 100).toFixed(0)}%.
          </li>
          <li>
            If no written extension is in place, the contract may require
            active steps toward resolution, including sale marketing or another
            permitted exit path such as buyout.
          </li>
        </ul>
      </div>
    </div>
  );
}

function AssumptionsTab({
  annualAppreciation,
  setAnnualAppreciation,
  exitYear,
}: {
  annualAppreciation: number;
  setAnnualAppreciation: (v: number) => void;
  exitYear: number;
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
        <p className="text-xs font-semibold mb-1">Modeled exit</p>
        <p className="text-xs text-muted-foreground">
          Expected exit timing is set to{" "}
          <span className="font-medium">
            Year {exitYear}
          </span>
          . Adjust it in the Exit Terms tab.
        </p>
      </div>
    </div>
  );
}

function FeesTab({
  setupFeePct,
  setSetupFeePct,
  setupFeeFloor,
  setSetupFeeFloor,
  setupFeeCap,
  setSetupFeeCap,
  servicingFeeMonthly,
  setServicingFeeMonthly,
  paymentAdminFee,
  setPaymentAdminFee,
  exitAdminFee,
  setExitAdminFee,
}: {
  setupFeePct: number;
  setSetupFeePct: (v: number) => void;
  setupFeeFloor: number;
  setSetupFeeFloor: (v: number) => void;
  setupFeeCap: number;
  setSetupFeeCap: (v: number) => void;
  servicingFeeMonthly: number;
  setServicingFeeMonthly: (v: number) => void;
  paymentAdminFee: number;
  setPaymentAdminFee: (v: number) => void;
  exitAdminFee: number;
  setExitAdminFee: (v: number) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldRow
        label="Setup fee"
        hint="Percentage of contracted deal size collected once at closing, subject to floor and cap."
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={(setupFeePct * 100).toFixed(2)}
            min={0}
            max={10}
            step={0.01}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) setSetupFeePct(n / 100);
            }}
            className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </FieldRow>
      <FieldRow
        label="Setup fee floor"
        hint="Minimum setup fee charged regardless of deal size."
      >
        <NumberInput
          value={setupFeeFloor}
          onChange={setSetupFeeFloor}
          min={0}
          max={10000}
          step={50}
          prefix="$"
        />
      </FieldRow>
      <FieldRow
        label="Setup fee cap"
        hint="Maximum setup fee charged regardless of deal size."
      >
        <NumberInput
          value={setupFeeCap}
          onChange={setSetupFeeCap}
          min={1000}
          max={50000}
          step={500}
          prefix="$"
        />
      </FieldRow>
      <FieldRow
        label="Monthly servicing fee"
        hint="Recurring monthly fee during the agreement."
      >
        <NumberInput
          value={servicingFeeMonthly}
          onChange={setServicingFeeMonthly}
          min={0}
          max={500}
          step={1}
          prefix="$"
          suffix="/mo"
        />
      </FieldRow>
      <FieldRow
        label="Payment admin fee"
        hint="Fee assessed per monthly payment event."
      >
        <NumberInput
          value={paymentAdminFee}
          onChange={setPaymentAdminFee}
          min={0}
          max={50}
          step={1}
          prefix="$"
          suffix="/payment"
        />
      </FieldRow>
      <FieldRow
        label="Exit admin fee"
        hint="One-time fee collected at settlement."
      >
        <NumberInput
          value={exitAdminFee}
          onChange={setExitAdminFee}
          min={0}
          max={25000}
          step={100}
          prefix="$"
        />
      </FieldRow>
    </div>
  );
}

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
    safeN(dt.minimum_hold_years, 1),
  );
  const [exitYear, setExitYear] = useState(() =>
    safeN(sc.exit_year, SD.exit_year),
  );
  const firstExtPct = safeNPos(
    dt.first_extension_premium_pct,
    D.first_extension_premium_pct,
  );
  const secondExtPct = safeNPos(
    dt.second_extension_premium_pct,
    D.second_extension_premium_pct,
  );
  const [annualAppreciation, setAnnualAppreciation] = useState(() =>
    safeN(sc.annual_appreciation, SD.annual_appreciation),
  );
  const [setupFeePct, setSetupFeePct] = useState(() =>
    safeNPos(dt.setup_fee_pct, D.setup_fee_pct),
  );
  const [setupFeeFloor, setSetupFeeFloor] = useState(() =>
    safeN(dt.setup_fee_floor, D.setup_fee_floor),
  );
  const [setupFeeCap, setSetupFeeCap] = useState(() =>
    safeNPos(dt.setup_fee_cap, D.setup_fee_cap),
  );
  const [servicingFeeMonthly, setServicingFeeMonthly] = useState(() =>
    safeNPos(dt.servicing_fee_monthly, D.servicing_fee_monthly),
  );
  const [paymentAdminFee, setPaymentAdminFee] = useState(() =>
    safeNPos(dt.payment_admin_fee, D.payment_admin_fee),
  );
  const [exitAdminFee, setExitAdminFee] = useState(() =>
    safeNPos(dt.exit_admin_fee_amount, D.exit_admin_fee_amount),
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
        setup_fee_pct: setupFeePct,
        setup_fee_floor: setupFeeFloor,
        setup_fee_cap: setupFeeCap,
        servicing_fee_monthly: servicingFeeMonthly,
        payment_admin_fee: paymentAdminFee,
        exit_admin_fee_amount: exitAdminFee,
        first_extension_premium_pct: firstExtPct,
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
              firstExtPct={firstExtPct}
              secondExtPct={secondExtPct}
            />
          )}
          {activeTab === "assumptions" && (
            <AssumptionsTab
              annualAppreciation={annualAppreciation}
              setAnnualAppreciation={setAnnualAppreciation}
              exitYear={exitYear}
            />
          )}
          {activeTab === "fees" && (
            <FeesTab
              setupFeePct={setupFeePct}
              setSetupFeePct={setSetupFeePct}
              setupFeeFloor={setupFeeFloor}
              setSetupFeeFloor={setSetupFeeFloor}
              setupFeeCap={setupFeeCap}
              setSetupFeeCap={setSetupFeeCap}
              servicingFeeMonthly={servicingFeeMonthly}
              setServicingFeeMonthly={setServicingFeeMonthly}
              paymentAdminFee={paymentAdminFee}
              setPaymentAdminFee={setPaymentAdminFee}
              exitAdminFee={exitAdminFee}
              setExitAdminFee={setExitAdminFee}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3.5 flex-shrink-0 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {saving && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
            )}
            Save terms
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
