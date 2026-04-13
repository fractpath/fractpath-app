import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export type MapProperty = {
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
};

export async function GET() {
  const supabase = createServiceClient();

  const { data: rows, error } = await (supabase.from("properties") as any)
    .select(
      "id, address_line1, city, state, postal_code, latitude, longitude, status, verified_at",
    )
    .eq("status", "verified")
    .eq("visibility_preference", "public")
    .eq("is_private", false)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) {
    return NextResponse.json({ error: "Failed to load properties" }, { status: 500 });
  }

  const properties: MapProperty[] = rows ?? [];

  if (properties.length === 0) {
    return NextResponse.json([] satisfies MapProperty[]);
  }

  const ids = properties.map((p: MapProperty) => p.id);

  // Fetch owner hero photos (priority: is_hero flag → first photo by sort_order)
  const { data: photoRows } = await (supabase.from("property_photos") as any)
    .select("property_id, public_url, is_hero, sort_order, created_at")
    .in("property_id", ids)
    .is("removed_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const heroMap = new Map<string, string>();
  const firstMap = new Map<string, string>();
  for (const photo of photoRows ?? []) {
    if (!photo?.property_id) continue;
    if (photo.is_hero && !heroMap.has(photo.property_id)) {
      heroMap.set(photo.property_id, photo.public_url);
    }
    if (!firstMap.has(photo.property_id)) {
      firstMap.set(photo.property_id, photo.public_url);
    }
  }

  // Mashvisor cover image as fallback when no owner photos exist
  const { data: enrichRows } = await (supabase.from("property_enrichments") as any)
    .select("property_id, images_payload")
    .in("property_id", ids)
    .eq("provider", "mashvisor")
    .eq("is_current", true);

  const vendorCoverMap = new Map<string, string>();
  for (const enrich of enrichRows ?? []) {
    const cover = enrich?.images_payload?.cover_image_url ?? null;
    if (cover) vendorCoverMap.set(enrich.property_id, cover);
  }

  const result: MapProperty[] = properties.map((p: MapProperty) => ({
    ...p,
    hero_photo_url:
      heroMap.get(p.id) ??
      firstMap.get(p.id) ??
      vendorCoverMap.get(p.id) ??
      null,
  }));

  return NextResponse.json(result);
}
