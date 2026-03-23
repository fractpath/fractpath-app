// src/lib/ltvPolicy.ts
// Canonical server-side LTV policy computation for secured-debt-aware access control.
// All math must go through this function — do not duplicate in UI or route handlers.

export const LTV_DEBT_FRESHNESS_DAYS = 90;
export const LTV_DEFAULT_POLICY_RATIO = 0.75;

export type LtvPolicyInputs = {
  // Deal-level inputs (from current deal snapshot or active proposal terms_snapshot)
  proposed_deal_fmv: number | null;
  upfront_payment: number | null;
  monthly_payment: number | null;
  number_of_payments: number | null;

  // Property underwriting inputs (from properties table)
  latest_verified_fmv: number | null;
  secured_debt_amount: number | null; // pass 0 if no debt; null treated as 0
  ltv_policy_ratio: number; // default 0.75
  secured_debt_certified_at: string | null; // ISO8601 timestamp of last certification
};

export type LtvPolicyResult = {
  total_committed_deal_cash: number;
  provisional_max_accessible_cash: number | null; // null when proposed_deal_fmv unavailable
  executable_max_accessible_cash: number | null; // null when verified_fmv unavailable
  deal_exceeds_provisional_access_limit: boolean;
  deal_exceeds_executable_access_limit: boolean;
  secured_debt_data_is_stale: boolean;
  verified_fmv_required_for_execution: boolean;
  execution_readiness_blocked_by_underwriting: boolean;
  block_reasons_internal: string[];
};

function safeNum(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

export function computeLtvPolicy(inputs: LtvPolicyInputs): LtvPolicyResult {
  const upfront = safeNum(inputs.upfront_payment) ?? 0;
  const monthly = safeNum(inputs.monthly_payment) ?? 0;
  const payments = safeNum(inputs.number_of_payments) ?? 0;
  const totalCommitted = upfront + monthly * payments;

  const proposedFmv = safeNum(inputs.proposed_deal_fmv);
  const verifiedFmv = safeNum(inputs.latest_verified_fmv);
  const debtAmount = safeNum(inputs.secured_debt_amount) ?? 0;
  const ltvRatio = safeNum(inputs.ltv_policy_ratio) ?? LTV_DEFAULT_POLICY_RATIO;

  const provisionalMax =
    proposedFmv !== null
      ? Math.max(0, proposedFmv * ltvRatio - debtAmount)
      : null;

  const executableMax =
    verifiedFmv !== null
      ? Math.max(0, verifiedFmv * ltvRatio - debtAmount)
      : null;

  const exceedsProvisional =
    provisionalMax !== null && totalCommitted > provisionalMax;
  const exceedsExecutable =
    executableMax !== null && totalCommitted > executableMax;

  // Stale = debt certification is older than DEBT_FRESHNESS_DAYS
  let debtIsStale = false;
  if (inputs.secured_debt_certified_at) {
    try {
      const certifiedAt = new Date(inputs.secured_debt_certified_at);
      const ageMs = Date.now() - certifiedAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      debtIsStale = ageDays > LTV_DEBT_FRESHNESS_DAYS;
    } catch {
      debtIsStale = false;
    }
  }

  const verifiedFmvMissing = verifiedFmv === null;

  const blockReasons: string[] = [];
  if (exceedsExecutable) blockReasons.push("deal_exceeds_executable_ltv_cap");
  if (debtIsStale) blockReasons.push("secured_debt_data_stale");
  if (verifiedFmvMissing) blockReasons.push("verified_fmv_missing");

  return {
    total_committed_deal_cash: totalCommitted,
    provisional_max_accessible_cash: provisionalMax,
    executable_max_accessible_cash: executableMax,
    deal_exceeds_provisional_access_limit: exceedsProvisional,
    deal_exceeds_executable_access_limit: exceedsExecutable,
    secured_debt_data_is_stale: debtIsStale,
    verified_fmv_required_for_execution: verifiedFmvMissing,
    execution_readiness_blocked_by_underwriting: blockReasons.length > 0,
    block_reasons_internal: blockReasons,
  };
}
