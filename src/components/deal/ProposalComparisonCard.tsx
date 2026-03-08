"use client";

type AnyRecord = Record<string, unknown>;

function safeNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatCurrency(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatInteger(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
}

type TermRow = {
  label: string;
  current: string;
  previous: string | null;
  changed: boolean;
};

function extractTerms(snapshot: AnyRecord | null) {
  if (!snapshot) return null;
  const dt = snapshot.deal_terms as AnyRecord | undefined;
  const sc = snapshot.scenario as AnyRecord | undefined;
  return {
    propertyValue: safeNumber(dt?.property_value ?? dt?.propertyValue),
    upfrontPayment: safeNumber(
      dt?.upfront_payment ?? dt?.upfrontPayment ?? dt?.initial_buy_amount ?? dt?.initialBuyAmount,
    ),
    monthlyPayment: safeNumber(dt?.monthly_payment ?? dt?.monthlyPayment),
    paymentCount: safeNumber(dt?.number_of_payments ?? dt?.numberOfPayments),
    exitYear: safeNumber(sc?.exit_year ?? sc?.exitYear),
  };
}

type Props = {
  currentTerms: AnyRecord | null;
  previousTerms: AnyRecord | null;
  currentLabel?: string;
  previousLabel?: string;
};

export function ProposalComparisonCard({
  currentTerms,
  previousTerms,
  currentLabel = "Current proposal",
  previousLabel = "Previous proposal",
}: Props) {
  const current = extractTerms(currentTerms);
  const previous = extractTerms(previousTerms);

  if (!current) return null;

  const rows: TermRow[] = [
    {
      label: "Property Value (FMV)",
      current: formatCurrency(current.propertyValue),
      previous: previous ? formatCurrency(previous.propertyValue) : null,
      changed: previous != null && current.propertyValue !== previous.propertyValue,
    },
    {
      label: "Upfront Payment",
      current: formatCurrency(current.upfrontPayment),
      previous: previous ? formatCurrency(previous.upfrontPayment) : null,
      changed: previous != null && current.upfrontPayment !== previous.upfrontPayment,
    },
    {
      label: "Monthly Payment",
      current: formatCurrency(current.monthlyPayment),
      previous: previous ? formatCurrency(previous.monthlyPayment) : null,
      changed: previous != null && current.monthlyPayment !== previous.monthlyPayment,
    },
    {
      label: "Payments",
      current: formatInteger(current.paymentCount),
      previous: previous ? formatInteger(previous.paymentCount) : null,
      changed: previous != null && current.paymentCount !== previous.paymentCount,
    },
    {
      label: "Exit Year",
      current: formatInteger(current.exitYear),
      previous: previous ? formatInteger(previous.exitYear) : null,
      changed: previous != null && current.exitYear !== previous.exitYear,
    },
  ];

  const hasComparison = !!previous;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-950">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-2 pr-4 font-medium">Term</th>
              <th className="pb-2 pr-4 font-medium">{currentLabel}</th>
              {hasComparison && (
                <th className="pb-2 font-medium">{previousLabel}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                  {row.label}
                </td>
                <td
                  className={`py-2 pr-4 font-medium ${
                    row.changed
                      ? "text-blue-700 dark:text-blue-400"
                      : "text-gray-900 dark:text-gray-100"
                  }`}
                >
                  {row.current}
                  {row.changed && (
                    <span className="ml-1.5 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      changed
                    </span>
                  )}
                </td>
                {hasComparison && (
                  <td className="py-2 text-gray-500 dark:text-gray-400">
                    {row.previous}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
