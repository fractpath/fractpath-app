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
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s !== "" ? s : null;
}

function toHttpsUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;

  if (s.startsWith("http://")) {
    return `https://${s.slice("http://".length)}`;
  }

  return s;
}

/**
 * Extract the property data object from a raw Mashvisor response.
 *
 * The API for GET /v1.1/client/property returns:
 *   { status: 200, content: { id, address, city, state, zip, beds, ... } }
 *
 * Some list endpoints wrap results in content.results[]; this helper handles both shapes.
 */
function extractContent(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;

  const content = r["content"];

  if (content && typeof content === "object" && !Array.isArray(content)) {
    const c = content as Record<string, unknown>;
    // List endpoint: { content: { results: [...] } }
    const results = c["results"];
    if (Array.isArray(results) && results.length > 0) {
      return results[0] as Record<string, unknown>;
    }
    // Single-property endpoint: { content: { id, address, ... } }
    return c;
  }

  // Fallback: treat root as the property object
  return r;
}

export function normalizeMashvisorResponse(raw: unknown): MashvisorNormalizedSummary {
  const now = new Date().toISOString();
  const c = extractContent(raw);

  // Build a formatted address from individual fields when a single-string address
  // is not present or is just the street.
  const rawAddress = str(c["address"]);
  const city = str(c["city"]);
  const state = str(c["state"]);
  const zip = str(c["zip"] ?? c["zip_code"]);
  const addressParts = [rawAddress, city, state, zip].filter(Boolean);
  const formattedAddress =
    addressParts.length > 0 ? addressParts.join(", ") : null;

  // Valuation: prefer explicit estimate, fall back to list price
  const valuation = c["valuation_batch"] as Record<string, unknown> | null | undefined;
  const meta = c["meta"] as Record<string, unknown> | null | undefined;
  const valueEstimate = num(
    valuation?.["valuation_estimate"] ??
    meta?.["value"] ??
    c["listPrice"] ??
    c["list_price"] ??
    c["price"],
  );

  return {
    mashvisor_property_id: str(c["id"] ?? c["property_id"]),
    address: formattedAddress,
    property_type: str(
      c["homeType"] ??
      c["home_type"] ??
      c["property_type"] ??
      c["property_sub_type"] ??
      c["type"],
    ),
    beds: num(c["beds"] ?? c["num_of_beds"] ?? c["bedrooms"]),
    baths: num(c["baths"] ?? c["num_of_baths"] ?? c["bathrooms"]),
    sqft: num(c["sqft"] ?? c["squareFootage"] ?? c["square_footage"]),
    value_estimate: valueEstimate,
    fetched_at: now,
  };
}

export function extractMashvisorImages(raw: unknown): MashvisorImagesPayload {
  const c = extractContent(raw);

  // Cover image: content.image.url or content.image.image
  const imageObj = c["image"] as Record<string, unknown> | null | undefined;
  const coverUrl =
    toHttpsUrl(imageObj?.["url"]) ??
    toHttpsUrl(imageObj?.["image"]) ??
    null;

  // Gallery: content.extra_images array
  const extraImages = c["extra_images"];
  const galleryUrls: string[] = [];

  if (Array.isArray(extraImages)) {
    for (const item of extraImages) {
      const u =
        typeof item === "object" && item !== null
          ? toHttpsUrl(
              (item as Record<string, unknown>)["url"] ??
                (item as Record<string, unknown>)["image"] ??
                item,
            )
          : toHttpsUrl(item);
      if (u) galleryUrls.push(u);
    }
  }

  // Build final image_urls: cover first, then unique gallery entries
  const allUrls: string[] = [];
  if (coverUrl) allUrls.push(coverUrl);
  for (const u of galleryUrls) {
    if (!allUrls.includes(u)) allUrls.push(u);
  }

  return {
    cover_image_url: coverUrl ?? galleryUrls[0] ?? null,
    image_urls: allUrls,
  };
}
