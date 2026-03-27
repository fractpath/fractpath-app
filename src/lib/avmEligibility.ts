// ─── Thresholds ──────────────────────────────────────────────────────────────

export const DEVIATION_REVIEW_THRESHOLD_PCT = 7.5;     // manual review  (~5–10%)
export const DEVIATION_ESCALATION_THRESHOLD_PCT = 12.5; // escalated review (~10–15%)
export const DEFAULT_LTV_RATIO = 0.75;

// ─── Types ───────────────────────────────────────────────────────────────────

export type AvmEligibilityResult =
  | "eligible"
  | "ineligible_ltv"
  | "blocked_pending_fmv"
  | "manual_review_required"
  | "escalated_review_required";

export interface AvmEligibilityCard {
  result: AvmEligibilityResult;
  verifiedFmv: number | null;
  fmvProvider: string | null;
  fmvFetchedAt: string | null;
  fmvExpiresAt: string | null;
  isFmvExpired: boolean;
  proposedFmv: number | null;
  deviationPct: number | null;
  securedDebt: number;
  ltvRatio: number;
  maxEligibleCash: number | null;
  requestedCash: number | null;
}

// ─── UI metadata (used by admin deal review page) ────────────────────────────

export const AVM_RESULT_META: Record<AvmEligibilityResult, { label: string; cls: string }> = {
  eligible: { label: "Eligible", cls: "bg-green-100 text-green-800" },
  ineligible_ltv: { label: "Ineligible — LTV exceeded", cls: "bg-red-100 text-red-800" },
  blocked_pending_fmv: { label: "Blocked — verified FMV pending", cls: "bg-yellow-100 text-yellow-800" },
  manual_review_required: { label: "Manual review required", cls: "bg-orange-100 text-orange-800" },
  escalated_review_required: { label: "Escalated review required", cls: "bg-red-100 text-red-800" },
};

// ─── Gate sets (used by AdminDealActions and set-review-state route) ──────────

export const HARD_BLOCKED_AVM_RESULTS = new Set<AvmEligibilityResult>([
  "blocked_pending_fmv",
  "ineligible_ltv",
  "escalated_review_required",
]);

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Safely cast an unknown value to a finite number. */
export function safeNum(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

/** Extract AVM-relevant deal term fields from a terms_snapshot blob. */
export function extractAvmDealTerms(snapshot: unknown): {
  upfront_payment: number | null;
  property_value: number | null;
} {
  if (!snapshot || typeof snapshot !== "object") {
    return { upfront_payment: null, property_value: null };
  }
  const s = snapshot as Record<string, unknown>;
  const inputs = s.inputs as Record<string, unknown> | undefined;
  const dealTerms = (inputs?.deal_terms ?? s.deal_terms ?? {}) as Record<string, unknown>;
  return {
    upfront_payment: safeNum(dealTerms.upfront_payment),
    property_value: safeNum(dealTerms.property_value),
  };
}

// ─── Core computation ────────────────────────────────────────────────────────

export function computeAvmEligibility(args: {
  verifiedFmv: number | null;
  fmvProvider: string | null;
  fmvFetchedAt: string | null;
  fmvExpiresAt: string | null;
  proposedFmv: number | null;
  securedDebt: number;
  ltvRatio: number;
  requestedCash: number | null;
}): AvmEligibilityCard {
  const {
    verifiedFmv, fmvProvider, fmvFetchedAt, fmvExpiresAt,
    proposedFmv, securedDebt, ltvRatio, requestedCash,
  } = args;

  const isFmvExpired = fmvExpiresAt ? new Date(fmvExpiresAt) < new Date() : false;

  if (!verifiedFmv || isFmvExpired) {
    return {
      result: "blocked_pending_fmv",
      verifiedFmv, fmvProvider, fmvFetchedAt, fmvExpiresAt, isFmvExpired,
      proposedFmv, deviationPct: null, securedDebt, ltvRatio,
      maxEligibleCash: null, requestedCash,
    };
  }

  const maxEligibleCash = Math.max(0, verifiedFmv * ltvRatio - securedDebt);
  const deviationPct =
    proposedFmv != null
      ? (Math.abs(proposedFmv - verifiedFmv) / verifiedFmv) * 100
      : null;

  let result: AvmEligibilityResult;
  if (requestedCash !== null && requestedCash > maxEligibleCash) {
    result = "ineligible_ltv";
  } else if (deviationPct !== null && deviationPct >= DEVIATION_ESCALATION_THRESHOLD_PCT) {
    result = "escalated_review_required";
  } else if (deviationPct !== null && deviationPct >= DEVIATION_REVIEW_THRESHOLD_PCT) {
    result = "manual_review_required";
  } else {
    result = "eligible";
  }

  return {
    result, verifiedFmv, fmvProvider, fmvFetchedAt, fmvExpiresAt, isFmvExpired,
    proposedFmv, deviationPct, securedDebt, ltvRatio, maxEligibleCash, requestedCash,
  };
}
