import type { NormalizedPropertyProfile } from "@/lib/property-review/providers/rentcast/types";

/**
 * Provider-agnostic fact shape used to display property characteristics
 * (beds, baths, sqft, etc.) across the owner, public, and admin surfaces.
 *
 * Intentionally kept small — this is a display type, not a storage type.
 * The authoritative persisted form is NormalizedPropertyProfile in
 * property_review_runs.normalized_payload (artifact_type='property_profile').
 */
export type PropertyFacts = {
  address: string | null;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  source: "rentcast" | "mashvisor";
  fetchedAt?: string | null;
};

/**
 * Convert a persisted RentCast NormalizedPropertyProfile into a PropertyFacts
 * object suitable for passing to EnrichedPropertyPreview.
 */
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
    source: "rentcast",
    fetchedAt: fetchedAt ?? null,
  };
}
