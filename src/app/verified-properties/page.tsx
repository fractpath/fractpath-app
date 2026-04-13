import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import type { DiscoveryProperty } from "@/app/api/map/public-properties/route";
import { VerifiedPropertiesClient } from "@/components/property/VerifiedPropertiesClient";

export const runtime = "nodejs";

export default async function VerifiedPropertiesPage() {
  const supabase = createServiceClient();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  // Eligibility: canonical verified state + publicly enabled.
  // verified_at is used for display only — its absence does NOT disqualify a verified property.
  // Nulls sorted last so properties with a stamped date appear first.
  const { data, error } = await (supabase.from("properties") as any)
    .select(
      "id, address_line1, city, state, postal_code, verified_at, latitude, longitude, latest_verified_fmv",
    )
    .eq("status", "verified")
    .eq("visibility_preference", "public")
    .order("verified_at", { ascending: false, nullsFirst: false });

  const baseRows: any[] = error ? [] : (data ?? []);

  let properties: DiscoveryProperty[] = [];

  if (baseRows.length > 0) {
    const ids = baseRows.map((r: any) => r.id);

    // Parallel enrichment fetches
    const [photoResult, enrichResult, rentcastResult, correctionResult] = await Promise.all([
      // 1. Owner photos (hero priority)
      (supabase.from("property_photos") as any)
        .select("property_id, public_url, is_hero, sort_order, created_at")
        .in("property_id", ids)
        .is("removed_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),

      // 2. Mashvisor cover image (fallback only — not used for valuation)
      (supabase.from("property_enrichments") as any)
        .select("property_id, images_payload")
        .in("property_id", ids)
        .eq("is_current", true)
        .eq("provider", "mashvisor"),

      // 3. RentCast canonical property profile (beds/baths/sqft/year_built/type)
      (supabase.from("property_review_runs") as any)
        .select("property_id, normalized_payload")
        .in("property_id", ids)
        .eq("provider", "rentcast")
        .eq("artifact_type", "property_profile")
        .eq("is_current", true)
        .eq("status", "completed"),

      // 4. Approved owner corrections
      (supabase.from("property_fact_corrections") as any)
        .select("property_id, field_key, owner_submitted_value")
        .in("property_id", ids)
        .eq("review_status", "approved"),
    ]);

    // Hero photo maps
    const heroMap = new Map<string, string>();
    const firstMap = new Map<string, string>();
    for (const photo of photoResult.data ?? []) {
      if (!photo?.property_id) continue;
      if (photo.is_hero && !heroMap.has(photo.property_id))
        heroMap.set(photo.property_id, photo.public_url);
      if (!firstMap.has(photo.property_id))
        firstMap.set(photo.property_id, photo.public_url);
    }

    // Vendor cover image fallback map
    const vendorCoverMap = new Map<string, string>();
    for (const e of enrichResult.data ?? []) {
      const cover = e?.images_payload?.cover_image_url ?? null;
      if (cover) vendorCoverMap.set(e.property_id, cover);
    }

    // RentCast facts map
    type RCFacts = {
      beds: number | null;
      baths: number | null;
      sqft: number | null;
      year_built: number | null;
      property_type: string | null;
    };
    const rentcastMap = new Map<string, RCFacts>();
    for (const run of rentcastResult.data ?? []) {
      if (!run?.property_id || !run?.normalized_payload) continue;
      const p = run.normalized_payload as any;
      rentcastMap.set(run.property_id, {
        beds: p.bedrooms ?? null,
        baths: p.bathrooms ?? null,
        sqft: p.squareFootage ?? null,
        year_built: p.yearBuilt ?? null,
        property_type: p.propertyType ?? null,
      });
    }

    // Approved corrections map
    const correctionMap = new Map<string, Record<string, string>>();
    for (const c of correctionResult.data ?? []) {
      if (!c?.property_id) continue;
      const existing = correctionMap.get(c.property_id) ?? {};
      existing[c.field_key] = c.owner_submitted_value;
      correctionMap.set(c.property_id, existing);
    }

    function applyNumericCorrection(
      propertyId: string,
      field: string,
      value: number | null,
    ): number | null {
      const corrections = correctionMap.get(propertyId) ?? {};
      const corrected = corrections[field];
      if (corrected !== undefined) {
        const n = Number(corrected);
        return isNaN(n) ? value : n;
      }
      return value;
    }

    properties = baseRows.map((row: any) => {
      const rc = rentcastMap.get(row.id);
      const heroPhotoUrl =
        heroMap.get(row.id) ?? firstMap.get(row.id) ?? vendorCoverMap.get(row.id) ?? null;

      // lat/lng: from properties table directly
      const lat = typeof row.latitude === "number" ? row.latitude : null;
      const lng = typeof row.longitude === "number" ? row.longitude : null;

      const entry: DiscoveryProperty & { latitude: number | null; longitude: number | null } = {
        id: row.id,
        address_line1: row.address_line1 ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        postal_code: row.postal_code ?? null,
        latitude: lat,
        longitude: lng,
        status: "verified",
        verified_at: row.verified_at ?? null,
        // Est value: properties.latest_verified_fmv — the canonical, review-stamped FMV.
        // Mashvisor-derived value_estimate is NOT used here.
        latest_verified_fmv: typeof row.latest_verified_fmv === "number" ? row.latest_verified_fmv : null,
        hero_photo_url: heroPhotoUrl,
        beds: applyNumericCorrection(row.id, "bedrooms", rc?.beds ?? null),
        baths: applyNumericCorrection(row.id, "bathrooms", rc?.baths ?? null),
        sqft: applyNumericCorrection(row.id, "sqft_living", rc?.sqft ?? null),
        year_built: applyNumericCorrection(row.id, "year_built", rc?.year_built ?? null),
        property_type: rc?.property_type ?? null,
      };
      return entry;
    });

    // Filter map-eligible entries (lat/lng required for markers)
    // Cards show all; map only shows those with coordinates — handled client-side.
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold">Verified Properties</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Verified properties open to home equity agreement proposals. Each property shown here
            has completed the verification process.
          </p>
        </div>

        <VerifiedPropertiesClient properties={properties} token={token} />
      </main>
    </div>
  );
}
