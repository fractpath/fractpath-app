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

export type MashvisorImagesPayload = {
  cover_image_url: string | null;
  image_urls: string[];
};

function num(v: unknown): number | null {
  const n = Number(v);
  return isNaN(n) || v == null || v === "" ? null : n;
}

function str(v: unknown): string | null {
  return v != null && String(v).trim() !== "" ? String(v).trim() : null;
}

function firstResult(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const content = r["content"] as Record<string, unknown> | null | undefined;
  const results = content?.["results"];
  if (Array.isArray(results) && results.length > 0) {
    return results[0] as Record<string, unknown>;
  }
  return r;
}

export function normalizeMashvisorResponse(raw: unknown): MashvisorNormalizedSummary {
  const now = new Date().toISOString();
  const first = firstResult(raw);

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

export function extractMashvisorImages(raw: unknown): MashvisorImagesPayload {
  const first = firstResult(raw);

  const imageUrls: string[] = [];
  const coverRaw = first["image"] ?? first["cover_image"] ?? first["main_image"];
  const coverUrl = str(coverRaw);

  const gallery = first["images"] ?? first["image_urls"] ?? first["gallery"];
  if (Array.isArray(gallery)) {
    for (const item of gallery) {
      const u = str(typeof item === "object" && item !== null ? (item as Record<string, unknown>)["url"] ?? item : item);
      if (u) imageUrls.push(u);
    }
  }
  if (coverUrl && !imageUrls.includes(coverUrl)) {
    imageUrls.unshift(coverUrl);
  }

  return {
    cover_image_url: coverUrl ?? imageUrls[0] ?? null,
    image_urls: imageUrls,
  };
}
