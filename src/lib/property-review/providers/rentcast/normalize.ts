import type {
  NormalizedAvm,
  NormalizedPropertyProfile,
  RentcastAvmComparable,
  RentcastAvmResponse,
  RentcastPropertyRecord,
} from "./types";

function toConfidence(input: RentcastAvmResponse): "low" | "medium" | "high" | null {
  const low = input.priceRangeLow ?? null;
  const high = input.priceRangeHigh ?? null;
  const price = input.price ?? null;

  if (!price || !low || !high || price <= 0) {
    return null;
  }

  const spreadRatio = (high - low) / price;

  if (spreadRatio <= 0.1) return "high";
  if (spreadRatio <= 0.2) return "medium";
  return "low";
}

function normalizeComparable(comp: RentcastAvmComparable) {
  return {
    formattedAddress: comp.formattedAddress ?? null,
    distance: comp.distance ?? null,
    saleDate: comp.saleDate ?? null,
    salePrice: comp.salePrice ?? null,
    squareFootage: comp.squareFootage ?? null,
    bedrooms: comp.bedrooms ?? null,
    bathrooms: comp.bathrooms ?? null,
    yearBuilt: comp.yearBuilt ?? null,
  };
}

export function normalizeRentcastPropertyProfile(
  record: RentcastPropertyRecord | null | undefined,
): NormalizedPropertyProfile {
  // Normalize taxAssessments: Record<year, entry> → sorted array
  const taxAssessments: NormalizedPropertyProfile["taxAssessments"] = [];
  if (record?.taxAssessments) {
    for (const entry of Object.values(record.taxAssessments)) {
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

  // Normalize propertyTaxes: Record<year, entry> → sorted array
  const propertyTaxes: NormalizedPropertyProfile["propertyTaxes"] = [];
  if (record?.propertyTaxes) {
    for (const entry of Object.values(record.propertyTaxes)) {
      if (entry.year != null) {
        propertyTaxes.push({
          year: entry.year,
          total: entry.total ?? null,
        });
      }
    }
    propertyTaxes.sort((a, b) => b.year - a.year);
  }

  // Normalize history: Record<date, entry> → sorted array (newest first)
  const saleHistory: NormalizedPropertyProfile["saleHistory"] = [];
  if (record?.history) {
    for (const [date, entry] of Object.entries(record.history)) {
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
    address: {
      line1: record?.addressLine1 ?? null,
      line2: record?.addressLine2 ?? null,
      city: record?.city ?? null,
      state: record?.state ?? null,
      zip: record?.zipCode ?? null,
      county: record?.county ?? null,
      formatted: record?.formattedAddress ?? null,
    },
    propertyType: record?.propertyType ?? null,
    beds: record?.bedrooms ?? null,
    baths: record?.bathrooms ?? null,
    squareFeet: record?.squareFootage ?? null,
    lotSize: record?.lotSize ?? null,
    yearBuilt: record?.yearBuilt ?? null,
    ownerOccupied: record?.ownerOccupied ?? null,
    lastSaleDate: record?.lastSaleDate ?? null,
    lastSalePrice: record?.lastSalePrice ?? null,
    apn: record?.apn ?? null,
    assessorId: record?.assessorID ?? null,
    legalDescription: record?.legalDescription ?? null,
    subdivision: record?.subdivision ?? null,
    zoning: record?.zoning ?? null,
    county: record?.county ?? null,
    latitude: record?.latitude ?? null,
    longitude: record?.longitude ?? null,
    hoa: record?.hoa
      ? {
          fee: record.hoa.fee ?? null,
          type: record.hoa.type ?? null,
          frequency: record.hoa.frequency ?? null,
        }
      : null,
    features: record?.features
      ? {
          architectureType: record.features.architectureType ?? null,
          hasCooling: record.features.cooling ?? null,
          coolingType: record.features.coolingType ?? null,
          exteriorType: record.features.exteriorType ?? null,
          hasFireplace: record.features.fireplace ?? null,
          fireplaceType: record.features.fireplaceType ?? null,
          floorCount: record.features.floorCount ?? null,
          foundationType: record.features.foundationType ?? null,
          hasGarage: record.features.garage ?? null,
          garageSpaces: record.features.garageSpaces ?? null,
          garageType: record.features.garageType ?? null,
          hasHeating: record.features.heating ?? null,
          heatingType: record.features.heatingType ?? null,
          hasPool: record.features.pool ?? null,
          poolType: record.features.poolType ?? null,
          roomCount: record.features.roomCount ?? null,
          roofType: record.features.roofType ?? null,
          unitCount: record.features.unitCount ?? null,
          viewType: record.features.viewType ?? null,
        }
      : null,
    taxAssessments: taxAssessments.length > 0 ? taxAssessments : null,
    propertyTaxes: propertyTaxes.length > 0 ? propertyTaxes : null,
    saleHistory: saleHistory.length > 0 ? saleHistory : null,
  };
}

export function normalizeRentcastAvm(input: RentcastAvmResponse): NormalizedAvm {
  const comps = (input.comparables ?? []).map(normalizeComparable);

  return {
    estimate: input.price ?? null,
    estimateLow: input.priceRangeLow ?? null,
    estimateHigh: input.priceRangeHigh ?? null,
    confidence: toConfidence(input),
    compsConsidered: comps.length,
    comps,
    providerNotes: null,
  };
}
