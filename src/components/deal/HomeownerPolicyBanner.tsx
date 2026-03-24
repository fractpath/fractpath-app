"use client";

import { useThreadLtvPolicy } from "@/hooks/useThreadLtvPolicy";

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  threadId: string;
  threadStatus?: string | null;
  onCounterClick?: () => void;
};

export function HomeownerPolicyBanner({ threadId, threadStatus, onCounterClick }: Props) {
  const { loading, error, data } = useThreadLtvPolicy(threadId);

  if (loading) return null;
  if (error) return null;
  if (!data) return null;

  // Suppress all underwriting blocker copy once the deal is accepted.
  // The AcceptedPendingReviewBanner handles status communication at that stage.
  if (threadStatus === "accepted") return null;

  const blocked = data.execution_readiness_blocked_by_underwriting;

  if (!blocked) return null;

  const maxCash = data.executable_max_accessible_cash;
  const verifiedFmv = data.latest_verified_fmv;
  const debtAmount = data.secured_debt_amount;
  const ltvPct = Math.round((data.ltv_policy_ratio ?? 0.75) * 100);

  const reasons: string[] = [];
  if (data.verified_fmv_required_for_execution) {
    reasons.push("A verified property value is required before this offer can be finalized.");
  }
  if (data.secured_debt_data_is_stale) {
    reasons.push("Your secured debt information needs to be refreshed (it is older than 90 days).");
  }
  if (data.deal_exceeds_executable_access_limit) {
    reasons.push(
      maxCash !== null
        ? `This offer exceeds the maximum amount currently available on your property under FractPath policy (${fmt(maxCash)}).`
        : "This offer exceeds the policy limit based on your current property data.",
    );
  }

  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm dark:border-amber-700 dark:bg-amber-950"
      data-testid="homeowner-policy-banner"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <div className="space-y-1.5">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            This offer cannot be accepted as currently structured
          </p>
          <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-200">
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Private underwriting context */}
      {(verifiedFmv !== null || debtAmount > 0 || maxCash !== null) && (
        <div className="rounded-md bg-white/60 dark:bg-black/20 border border-amber-200 dark:border-amber-700 p-3 space-y-1 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-medium mb-1.5">Your property policy limits (private — only you can see this):</p>
          {verifiedFmv !== null && (
            <div className="flex justify-between gap-4">
              <span className="text-amber-700 dark:text-amber-300">Latest verified property value</span>
              <span className="font-medium">{fmt(verifiedFmv)}</span>
            </div>
          )}
          {debtAmount > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-amber-700 dark:text-amber-300">Secured debt on file</span>
              <span className="font-medium">{fmt(debtAmount)}</span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-amber-700 dark:text-amber-300">FractPath policy cap</span>
            <span className="font-medium">{ltvPct}% of verified value</span>
          </div>
          {maxCash !== null && (
            <div className="flex justify-between gap-4 border-t border-amber-200 dark:border-amber-700 pt-1.5 mt-1.5">
              <span className="text-amber-700 dark:text-amber-300 font-medium">Maximum accessible cash</span>
              <span className="font-semibold">{fmt(maxCash)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {onCounterClick && data.deal_exceeds_executable_access_limit && (
          <button
            type="button"
            onClick={onCounterClick}
            className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-600 dark:hover:bg-amber-800"
          >
            Counter with revised amount
          </button>
        )}
        {data.verify_url && (
          <a
            href={data.verify_url}
            className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-600 dark:hover:bg-amber-800"
          >
            Update property documentation
          </a>
        )}
      </div>
    </div>
  );
}
