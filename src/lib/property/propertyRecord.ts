import type {
  RentcastPropertyRecord,
  NormalizedPropertyProfile,
} from "@/lib/property-review/providers/rentcast/types";

/**
 * Provider-agnostic display model for a complete property record.
 * Used to drive PropertyRecordSections across owner, public, and admin pages.
 *
 * Sourced from property_review_runs.raw_payload (artifact_type='property_profile')
 * via rentcastRecordToPropertyRecord(), or from normalized_payload via
 * normalizedProfileToRecord().
 *
 * All array fields are sorted newest → oldest (descending by year/date).
 */
export type PropertyRecord = {
  formattedAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  county: string | null;

  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSize: number | null;
  yearBuilt: number | null;
  ownerOccupied: boolean | null;

  apn: string | null;
  assessorId: string | null;
  legalDescription: string | null;
  subdivision: string | null;
  zoning: string | null;

  hoa: { fee: number | null; type: string | null; frequency: string | null } | null;

  features: {
    architectureType: string | null;
    exteriorType: string | null;
    roofType: string | null;
    hasHeating: boolean | null;
    heatingType: string | null;
    hasCooling: boolean | null;
    coolingType: string | null;
    hasGarage: boolean | null;
    garageType: string | null;
    hasPool: boolean | null;
    unitCount: number | null;
  } | null;

  lastSaleDate: string | null;
  lastSalePrice: number | null;

  saleHistory: Array<{
    date: string;
    event: string | null;
    price: number | null;
    listingType: string | null;
    daysOnMarket: number | null;
  }>;

  taxAssessments: Array<{
    year: number;
    value: number | null;
    land: number | null;
    improvements: number | null;
  }>;

  propertyTaxes: Array<{
    year: number;
    total: number | null;
  }>;

  fetchedAt: string | null;
};

// ── Conversion from raw RentCast API response ─────────────────────────────────

/**
 * Convert a raw RentCast property record (stored in property_review_runs.raw_payload)
 * into the provider-agnostic PropertyRecord display model.
 *
 * Use this when the normalized_payload may predate the extended NormalizedPropertyProfile
 * schema (i.e. for properties fetched before Phase 3 normalization update).
 */
export function rentcastRecordToPropertyRecord(
  raw: RentcastPropertyRecord,
  fetchedAt?: string | null,
): PropertyRecord {
  const taxAssessments: PropertyRecord["taxAssessments"] = [];
  if (raw.taxAssessments) {
    for (const entry of Object.values(raw.taxAssessments)) {
      if (entry.year != null) {
        taxAssessments.push({
          year: entry.year,
          value: entry.value ?? null,
          land: entry.land ?? null,
          improvements: entry.improvements ?? null,
        });
      }
    }
    taxAssessments.sort((a, b) => b.year - a.year);
  }

  const propertyTaxes: PropertyRecord["propertyTaxes"] = [];
  if (raw.propertyTaxes) {
    for (const entry of Object.values(raw.propertyTaxes)) {
      if (entry.year != null) {
        propertyTaxes.push({
          year: entry.year,
          total: entry.total ?? null,
        });
      }
    }
    propertyTaxes.sort((a, b) => b.year - a.year);
  }

  const saleHistory: PropertyRecord["saleHistory"] = [];
  if (raw.history) {
    for (const [date, entry] of Object.entries(raw.history)) {
      saleHistory.push({
        date,
        event: entry.event ?? null,
        price: entry.price ?? null,
        listingType: entry.listingType ?? null,
        daysOnMarket: entry.daysOnMarket ?? null,
      });
    }
    saleHistory.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }

  return {
    formattedAddress: raw.formattedAddress ?? null,
    addressLine1: raw.addressLine1 ?? null,
    addressLine2: raw.addressLine2 ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    zipCode: raw.zipCode ?? null,
    county: raw.county ?? null,
    propertyType: raw.propertyType ?? null,
    beds: raw.bedrooms ?? null,
    baths: raw.bathrooms ?? null,
    sqft: raw.squareFootage ?? null,
    lotSize: raw.lotSize ?? null,
    yearBuilt: raw.yearBuilt ?? null,
    ownerOccupied: raw.ownerOccupied ?? null,
    apn: raw.apn ?? null,
    assessorId: raw.assessorID ?? null,
    legalDescription: raw.legalDescription ?? null,
    subdivision: raw.subdivision ?? null,
    zoning: raw.zoning ?? null,
    hoa: raw.hoa
      ? {
          fee: raw.hoa.fee ?? null,
          type: raw.hoa.type ?? null,
          frequency: raw.hoa.frequency ?? null,
        }
      : null,
    features: raw.features
      ? {
          architectureType: raw.features.architectureType ?? null,
          exteriorType: raw.features.exteriorType ?? null,
          roofType: raw.features.roofType ?? null,
          hasHeating: raw.features.heating ?? null,
          heatingType: raw.features.heatingType ?? null,
          hasCooling: raw.features.cooling ?? null,
          coolingType: raw.features.coolingType ?? null,
          hasGarage: raw.features.garage ?? null,
          garageType: raw.features.garageType ?? null,
          hasPool: raw.features.pool ?? null,
          unitCount: raw.features.unitCount ?? null,
        }
      : null,
    lastSaleDate: raw.lastSaleDate ?? null,
    lastSalePrice: raw.lastSalePrice ?? null,
    saleHistory,
    taxAssessments,
    propertyTaxes,
    fetchedAt: fetchedAt ?? null,
  };
}

// ── Conversion from NormalizedPropertyProfile ─────────────────────────────────

/**
 * Convert a NormalizedPropertyProfile (from normalized_payload on a recent run)
 * into the PropertyRecord display model.
 *
 * This is preferred for runs fetched after the Phase 3 normalization update since
 * normalized_payload already has all the rich fields. For older runs, use
 * rentcastRecordToPropertyRecord(raw_payload) instead.
 */
export function normalizedProfileToRecord(
  profile: NormalizedPropertyProfile,
  fetchedAt?: string | null,
): PropertyRecord {
  return {
    formattedAddress: profile.address.formatted ?? null,
    addressLine1: profile.address.line1 ?? null,
    addressLine2: profile.address.line2 ?? null,
    city: profile.address.city ?? null,
    state: profile.address.state ?? null,
    zipCode: profile.address.zip ?? null,
    county: profile.county ?? profile.address.county ?? null,
    propertyType: profile.propertyType ?? null,
    beds: profile.beds ?? null,
    baths: profile.baths ?? null,
    sqft: profile.squareFeet ?? null,
    lotSize: profile.lotSize ?? null,
    yearBuilt: profile.yearBuilt ?? null,
    ownerOccupied: profile.ownerOccupied ?? null,
    apn: profile.apn ?? null,
    assessorId: profile.assessorId ?? null,
    legalDescription: profile.legalDescription ?? null,
    subdivision: profile.subdivision ?? null,
    zoning: profile.zoning ?? null,
    hoa: profile.hoa ?? null,
    features: profile.features ?? null,
    lastSaleDate: profile.lastSaleDate ?? null,
    lastSalePrice: profile.lastSalePrice ?? null,
    saleHistory: profile.saleHistory ?? [],
    taxAssessments: profile.taxAssessments ?? [],
    propertyTaxes: profile.propertyTaxes ?? [],
    fetchedAt: fetchedAt ?? null,
  };
}
