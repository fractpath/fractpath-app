import type {
  NormalizedPropertyProfile,
  NormalizedAvm,
} from "@/lib/property-review/providers/rentcast/types";

/**
 * Provider-agnostic physical facts about a property (profile data).
 * Sourced from property_review_runs (artifact_type='property_profile', provider='rentcast').
 */
export type PropertyFacts = {
  address: string | null;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSize?: number | null;
  yearBuilt?: number | null;
  source: "rentcast" | "mashvisor";
  fetchedAt?: string | null;
};

/**
 * AVM estimate with confidence range.
 * Sourced from property_review_runs (artifact_type='avm', provider='rentcast')
 * or from property_review_summary (fmv_amount/fmv_low/fmv_high/fmv_confidence).
 */
export type PropertyAvm = {
  estimate: number | null;
  low: number | null;
  high: number | null;
  confidence: "low" | "medium" | "high" | null;
  fetchedAt?: string | null;
};

/**
 * Reviewed/controlling FMV basis (ATTOM, manual appraisal, or admin-adopted value).
 * Sourced from properties.latest_verified_fmv + properties.fmv_verification_source.
 *
 * `label` is the source-specific label for owner/admin display
 * (e.g. "ATTOM AVM", "Manual appraisal").
 * Callers should override `label` for buyer-facing surfaces ("Reviewed estimate").
 */
export type PropertyReviewedBasis = {
  value: number;
  label: string;
};

// ── Conversion utilities ──────────────────────────────────────────────────────

/** Convert a persisted RentCast NormalizedPropertyProfile → PropertyFacts. */
export function rentcastProfileToFacts(
  profile: NormalizedPropertyProfile,
  fetchedAt?: string | null,
): PropertyFacts {
  return {
    address: profile.address.formatted ?? profile.address.line1 ?? null,
    propertyType: profile.propertyType ?? null,
    beds: profile.beds ?? null,
    baths: profile.baths ?? null,
    sqft: profile.squareFeet ?? null,
    lotSize: profile.lotSize ?? null,
    yearBuilt: profile.yearBuilt ?? null,
    source: "rentcast",
    fetchedAt: fetchedAt ?? null,
  };
}

/** Convert a persisted RentCast NormalizedAvm → PropertyAvm. */
export function rentcastAvmToAvm(
  avm: NormalizedAvm,
  fetchedAt?: string | null,
): PropertyAvm {
  return {
    estimate: avm.estimate ?? null,
    low: avm.estimateLow ?? null,
    high: avm.estimateHigh ?? null,
    confidence: avm.confidence ?? null,
    fetchedAt: fetchedAt ?? null,
  };
}

const FMV_SOURCE_LABELS: Record<string, string> = {
  attom: "ATTOM AVM",
  manual_appraisal_sim: "Manual appraisal",
  escalated_sim: "Escalated AVM",
  rentcast: "RentCast AVM",
};

/**
 * Build a PropertyReviewedBasis from a property row's FMV fields.
 * Returns null when no verified FMV is present.
 *
 * @param value  properties.latest_verified_fmv (or manual_appraisal_fmv)
 * @param source properties.fmv_verification_source
 * @param overrideLabel  Pass a generic label (e.g. "Reviewed estimate") for buyer audiences.
 */
export function reviewedBasisFromProperty(
  value: number | null | undefined,
  source: string | null | undefined,
  overrideLabel?: string,
): PropertyReviewedBasis | null {
  if (!value) return null;
  const label =
    overrideLabel ??
    (source ? (FMV_SOURCE_LABELS[source] ?? "Reviewed estimate") : "Reviewed estimate");
  return { value, label };
}
