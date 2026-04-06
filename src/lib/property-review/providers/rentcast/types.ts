export type RentcastPropertyRecord = {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  apn?: string;
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

export type NormalizedPropertyProfile = {
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
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
  county: string | null;
  latitude: number | null;
  longitude: number | null;
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