// ── Raw API response shapes ────────────────────────────────────────────────────

export type RentcastPropertyHoa = {
  fee?: number | null;
  type?: string | null;
  frequency?: string | null;
};

export type RentcastPropertyFeatures = {
  architectureType?: string | null;
  cooling?: boolean | null;
  coolingType?: string | null;
  exteriorType?: string | null;
  garage?: boolean | null;
  garageType?: string | null;
  heating?: boolean | null;
  heatingType?: string | null;
  pool?: boolean | null;
  roofType?: string | null;
  unitCount?: number | null;
};

export type RentcastTaxAssessmentEntry = {
  year?: number | null;
  value?: number | null;
  land?: number | null;
  improvements?: number | null;
};

export type RentcastPropertyTaxEntry = {
  year?: number | null;
  total?: number | null;
};

export type RentcastHistoryEntry = {
  event?: string | null;
  price?: number | null;
  listingType?: string | null;
  listedDate?: string | null;
  removedDate?: string | null;
  daysOnMarket?: number | null;
};

export type RentcastPropertyRecord = {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  apn?: string;
  assessorID?: string | null;
  legalDescription?: string | null;
  subdivision?: string | null;
  zoning?: string | null;
  propertyType?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFootage?: number | null;
  lotSize?: number | null;
  yearBuilt?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  ownerOccupied?: boolean | null;
  lastSaleDate?: string | null;
  lastSalePrice?: number | null;
  hoa?: RentcastPropertyHoa | null;
  features?: RentcastPropertyFeatures | null;
  taxAssessments?: Record<string, RentcastTaxAssessmentEntry> | null;
  propertyTaxes?: Record<string, RentcastPropertyTaxEntry> | null;
  history?: Record<string, RentcastHistoryEntry> | null;
};

export type RentcastPropertyResponse = RentcastPropertyRecord[];

export type RentcastAvmComparable = {
  formattedAddress?: string;
  distance?: number | null;
  saleDate?: string | null;
  salePrice?: number | null;
  squareFootage?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  yearBuilt?: number | null;
};

export type RentcastAvmResponse = {
  price?: number | null;
  priceRangeLow?: number | null;
  priceRangeHigh?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  comparables?: RentcastAvmComparable[] | null;
};

// ── Normalized persisted shapes ────────────────────────────────────────────────
// Stored in property_review_runs.normalized_payload.
// These are provider-agnostic and are the canonical storage format.

export type NormalizedPropertyProfile = {
  address: {
    line1: string | null;
    line2?: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county?: string | null;
    formatted: string | null;
  };
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  lotSize: number | null;
  yearBuilt: number | null;
  ownerOccupied: boolean | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  apn: string | null;
  assessorId?: string | null;
  legalDescription?: string | null;
  subdivision?: string | null;
  zoning?: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  hoa?: {
    fee: number | null;
    type: string | null;
    frequency: string | null;
  } | null;
  features?: {
    architectureType: string | null;
    hasCooling: boolean | null;
    coolingType: string | null;
    exteriorType: string | null;
    hasGarage: boolean | null;
    garageType: string | null;
    hasHeating: boolean | null;
    heatingType: string | null;
    hasPool: boolean | null;
    roofType: string | null;
    unitCount: number | null;
  } | null;
  taxAssessments?: Array<{
    year: number;
    value: number | null;
    land: number | null;
    improvements: number | null;
  }> | null;
  propertyTaxes?: Array<{
    year: number;
    total: number | null;
  }> | null;
  saleHistory?: Array<{
    date: string;
    event: string | null;
    price: number | null;
    listingType: string | null;
    daysOnMarket: number | null;
  }> | null;
};

export type NormalizedAvm = {
  estimate: number | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  confidence: "low" | "medium" | "high" | null;
  compsConsidered: number;
  comps: Array<{
    formattedAddress: string | null;
    distance: number | null;
    saleDate: string | null;
    salePrice: number | null;
    squareFootage: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    yearBuilt: number | null;
  }>;
  providerNotes: string | null;
};

export type PropertyReviewProvider = "rentcast";
export type PropertyReviewArtifactType = "property_profile" | "avm" | "enhanced_screening";
export type PropertyReviewRunStatus = "pending" | "completed" | "failed";
