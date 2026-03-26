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
  return {
    address: {
      line1: record?.addressLine1 ?? null,
      city: record?.city ?? null,
      state: record?.state ?? null,
      zip: record?.zipCode ?? null,
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
    county: record?.county ?? null,
    latitude: record?.latitude ?? null,
    longitude: record?.longitude ?? null,
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