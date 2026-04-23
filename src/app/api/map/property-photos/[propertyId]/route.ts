import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * GET /api/map/property-photos/[propertyId]
 *
 * Public-safe on-demand photo fetch for the verified-properties discovery surface.
 * Returns all non-removed owner photos for a verified + public-visibility property.
 * No auth required — only verified+public properties are accessible.
 * Hero photo is sorted first; remaining photos follow in sort_order order.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;

  if (!propertyId) {
    return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Guard: property must be verified + public-visibility.
  const { data: prop, error: propError } = await (supabase.from("properties") as any)
    .select("id, status, visibility_preference")
    .eq("id", propertyId)
    .eq("status", "verified")
    .eq("visibility_preference", "public")
    .single();

  if (propError || !prop) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch all non-removed owner photos ordered by hero-first, then sort_order.
  const { data: photos, error: photoError } = await (supabase.from("property_photos") as any)
    .select("public_url, is_hero, sort_order, created_at")
    .eq("property_id", propertyId)
    .is("removed_at", null)
    .order("is_hero", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (photoError) {
    return NextResponse.json({ error: "Failed to load photos" }, { status: 500 });
  }

  const urls: string[] = (photos ?? [])
    .map((p: any) => p.public_url as string)
    .filter(Boolean);

  return NextResponse.json({ photos: urls });
}
