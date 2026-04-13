import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export type DiscoveryProperty = {
  id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  status: string;
  verified_at: string | null;
  hero_photo_url: string | null;
  latest_verified_fmv: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  property_type: string | null;
};

export type MapProperty = DiscoveryProperty;

export async function GET() {
  const supabase = createServiceClient();

  const { data: rows, error } = await (supabase.from("properties") as any)
    .select(
      "id, address_line1, city, state, postal_code, latitude, longitude, status, verified_at, latest_verified_fmv",
    )
    .eq("status", "verified")
    .eq("visibility_preference", "public")
    .eq("is_private", false)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) {
    return NextResponse.json({ error: "Failed to load properties" }, { status: 500 });
  }

  const properties: any[] = rows ?? [];

  if (properties.length === 0) {
    return NextResponse.json([] satisfies DiscoveryProperty[]);
  }

  const ids = properties.map((p) => p.id);

  const [photoResult, enrichResult, rentcastResult, correctionResult] = await Promise.all([
    (supabase.from("property_photos") as any)
      .select("property_id, public_url, is_hero, sort_order, created_at")
      .in("property_id", ids)
      .is("removed_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),

    (supabase.from("property_enrichments") as any)
      .select("property_id, images_payload")
      .in("property_id", ids)
      .eq("provider", "mashvisor")
      .eq("is_current", true),

    (supabase.from("property_review_runs") as any)
      .select("property_id, normalized_payload")
      .in("property_id", ids)
      .eq("provider", "rentcast")
      .eq("artifact_type", "property_profile")
      .eq("is_current", true)
      .eq("status", "completed"),

    (supabase.from("property_fact_corrections") as any)
      .select("property_id, field_key, owner_submitted_value")
      .in("property_id", ids)
      .eq("review_status", "approved"),
  ]);

  const heroMap = new Map<string, string>();
  const firstMap = new Map<string, string>();
  for (const photo of photoResult.data ?? []) {
    if (!photo?.property_id) continue;
    if (photo.is_hero && !heroMap.has(photo.property_id))
      heroMap.set(photo.property_id, photo.public_url);
    if (!firstMap.has(photo.property_id))
      firstMap.set(photo.property_id, photo.public_url);
  }

  const vendorCoverMap = new Map<string, string>();
  for (const e of enrichResult.data ?? []) {
    const cover = e?.images_payload?.cover_image_url ?? null;
    if (cover) vendorCoverMap.set(e.property_id, cover);
  }

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

  const correctionMap = new Map<string, Record<string, string>>();
  for (const c of correctionResult.data ?? []) {
    if (!c?.property_id) continue;
    const existing = correctionMap.get(c.property_id) ?? {};
    existing[c.field_key] = c.owner_submitted_value;
    correctionMap.set(c.property_id, existing);
  }

  function applyCorrection(
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

  const result: DiscoveryProperty[] = properties.map((p) => {
    const rc = rentcastMap.get(p.id);
    return {
      id: p.id,
      address_line1: p.address_line1,
      city: p.city,
      state: p.state,
      postal_code: p.postal_code,
      latitude: p.latitude,
      longitude: p.longitude,
      status: p.status,
      verified_at: p.verified_at,
      latest_verified_fmv: p.latest_verified_fmv ?? null,
      hero_photo_url:
        heroMap.get(p.id) ?? firstMap.get(p.id) ?? vendorCoverMap.get(p.id) ?? null,
      beds: applyCorrection(p.id, "bedrooms", rc?.beds ?? null),
      baths: applyCorrection(p.id, "bathrooms", rc?.baths ?? null),
      sqft: applyCorrection(p.id, "sqft_living", rc?.sqft ?? null),
      year_built: applyCorrection(p.id, "year_built", rc?.year_built ?? null),
      property_type: rc?.property_type ?? null,
    };
  });

  return NextResponse.json(result);
}
