export type MashvisorNormalizedSummary = {
  mashvisor_property_id: string | null;
  address: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  value_estimate: number | null;
  fetched_at: string;
};

export function normalizeMashvisorResponse(raw: unknown): MashvisorNormalizedSummary {
  const now = new Date().toISOString();

  if (!raw || typeof raw !== "object") {
    return {
      mashvisor_property_id: null,
      address: null,
      property_type: null,
      beds: null,
      baths: null,
      sqft: null,
      value_estimate: null,
      fetched_at: now,
    };
  }

  const r = raw as Record<string, unknown>;

  const content = r["content"] as Record<string, unknown> | null | undefined;
  const results = content?.["results"];
  const first: Record<string, unknown> =
    Array.isArray(results) && results.length > 0 ? (results[0] as Record<string, unknown>) : (r as Record<string, unknown>);

  function num(v: unknown): number | null {
    const n = Number(v);
    return isNaN(n) || v == null || v === "" ? null : n;
  }

  function str(v: unknown): string | null {
    return v != null && String(v).trim() !== "" ? String(v).trim() : null;
  }

  return {
    mashvisor_property_id: str(first["id"] ?? first["property_id"]),
    address: str(first["address"] ?? first["formattedAddress"]),
    property_type: str(first["type"] ?? first["propertyType"] ?? first["property_type"]),
    beds: num(first["num_of_beds"] ?? first["bedrooms"]),
    baths: num(first["num_of_baths"] ?? first["bathrooms"]),
    sqft: num(first["sqft"] ?? first["squareFootage"]),
    value_estimate: num(first["home_value"] ?? first["value"] ?? first["price"]),
    fetched_at: now,
  };
}
