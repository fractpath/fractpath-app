import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import type { DiscoveryProperty } from "@/app/api/map/public-properties/route";
import { VerifiedPropertiesClient } from "@/components/property/VerifiedPropertiesClient";

export const runtime = "nodejs";

export default async function VerifiedPropertiesPage() {
  const supabase = createServiceClient();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  const { data, error } = await (supabase.from("properties") as any)
    .select(
      "id, address_line1, city, state, postal_code, status, verified_at, latitude, longitude, proposal_interest_status",
    )
    .eq("visibility_preference", "public")
    .eq("status", "verified")
    .order("verified_at", { ascending: false, nullsFirst: false });

  const baseRows: any[] = error ? [] : (data ?? []);

  let properties: DiscoveryProperty[] = [];

  if (baseRows.length > 0) {
    const ids = baseRows.map((r: any) => r.id);

    const [photoResult, enrichResult, rentcastResult, correctionResult, avmResult] =
      await Promise.all([
        // 1. Owner photos — hero priority + count only (no full array in initial payload)
        (supabase.from("property_photos") as any)
          .select("property_id, public_url, is_hero, sort_order, created_at")
          .in("property_id", ids)
          .is("removed_at", null)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),

        // 2. Mashvisor cover image (hero fallback only — not used for valuation)
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

        // 5. RentCast AVM — public browse-card est value source.
        //    ATTOM controlling FMV (properties.latest_verified_fmv) is intentionally excluded
        //    from this public-facing surface.
        (supabase.from("property_review_summary") as any)
          .select("property_id, fmv_amount")
          .in("property_id", ids),
      ]);

    const heroMap = new Map<string, string>();
    const firstMap = new Map<string, string>();
    const photoCountMap = new Map<string, number>();
    for (const photo of photoResult.data ?? []) {
      if (!photo?.property_id) continue;
      if (photo.is_hero && !heroMap.has(photo.property_id))
        heroMap.set(photo.property_id, photo.public_url);
      if (!firstMap.has(photo.property_id))
        firstMap.set(photo.property_id, photo.public_url);
      photoCountMap.set(
        photo.property_id,
        (photoCountMap.get(photo.property_id) ?? 0) + 1,
      );
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

    const avmMap = new Map<string, number>();
    for (const row of avmResult.data ?? []) {
      if (row?.property_id && typeof row.fmv_amount === "number") {
        avmMap.set(row.property_id, row.fmv_amount);
      }
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

      return {
        id: row.id,
        address_line1: row.address_line1 ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        postal_code: row.postal_code ?? null,
        latitude: typeof row.latitude === "number" ? row.latitude : null,
        longitude: typeof row.longitude === "number" ? row.longitude : null,
        status: row.status ?? "unknown",
        verified_at: row.verified_at ?? null,
        rentcast_avm: avmMap.get(row.id) ?? null,
        hero_photo_url: heroPhotoUrl,
        // photo_count: total non-removed owner photos — used client-side to show/hide
        // carousel arrows before the full photo array is fetched on demand.
        photo_count: photoCountMap.get(row.id) ?? null,
        beds: applyNumericCorrection(row.id, "bedrooms", rc?.beds ?? null),
        baths: applyNumericCorrection(row.id, "bathrooms", rc?.baths ?? null),
        sqft: applyNumericCorrection(row.id, "sqft_living", rc?.sqft ?? null),
        year_built: applyNumericCorrection(row.id, "year_built", rc?.year_built ?? null),
        property_type: rc?.property_type ?? null,
        open_to_proposals: row.proposal_interest_status !== "not_interested",
      } satisfies DiscoveryProperty;
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Properties Open to Deals</h1>
          <div className="flex-shrink-0 flex items-center gap-2.5">
            <span className="text-sm text-muted-foreground hidden sm:block">
              Have a property in mind?
            </span>
            <a
              href="/deal/new"
              className="inline-flex items-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Create Deal
            </a>
          </div>
        </div>

        <VerifiedPropertiesClient properties={properties} token={token} />
      </main>
    </div>
  );
}
