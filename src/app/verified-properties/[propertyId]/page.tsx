import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import type { MashvisorImagesPayload } from "@/lib/mashvisor/types";
import type { PropertyAvm } from "@/components/property/EnrichedPropertyPreview";
import type { NormalizedPropertyProfile } from "@/lib/property-review/providers/rentcast/types";
import { reviewedBasisFromProperty } from "@/lib/property/propertyFacts";
import type { PropertyRecord } from "@/lib/property/propertyRecord";
import { normalizedProfileToRecord } from "@/lib/property/propertyRecord";
import { PropertyRecordSections } from "@/components/property/PropertyRecordSections";
import { PropertyHeroMedia } from "@/components/property/PropertyHeroMedia";
import { PropertyPageHeader } from "@/components/property/PropertyPageHeader";
import type { OwnerPhoto } from "@/lib/property/photos";
import Link from "next/link";

export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ propertyId: string }>;
};

// Only the public-safe columns needed for this page.
// Valuation-derivation columns (last four) are used server-side ONLY to compute
// the displayed label — they are never rendered as raw values in the HTML.
const PUBLIC_SELECT =
  "id, address_line1, address_line2, city, state, postal_code, status, visibility_preference, verified_at, ownership_type, occupancy_use, latest_verified_fmv, escalation_avm_status, manual_appraisal_status, fmv_verification_source";

function formatFullAddress(row: {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}): string {
  const parts: string[] = [];
  if (row.address_line1) parts.push(row.address_line1);
  if (row.address_line2) parts.push(row.address_line2);
  const csz: string[] = [];
  if (row.city) csz.push(row.city);
  if (row.state) csz.push(row.state);
  if (row.postal_code) csz.push(row.postal_code);
  if (csz.length) parts.push(csz.join(", "));
  return parts.join(", ");
}


export default async function PublicPropertyDetailPage({ params }: PageProps) {
  const { propertyId } = await params;
  const supabase = createServiceClient();

  // Fetch property — only public-safe columns
  const { data: row, error } = await (supabase.from("properties") as any)
    .select(PUBLIC_SELECT)
    .eq("id", propertyId)
    .maybeSingle();

  if (error || !row) {
    notFound();
  }

  // Enforce public eligibility: must be verified + publicly enabled
  if (row.status !== "verified" || row.visibility_preference !== "public") {
    notFound();
  }

  const fullAddress = formatFullAddress(row);
  
  // Fetch RentCast property profile.
  // normalized_payload is the sole product-facing source of truth.
  // raw_payload is stored for auditability only and is not used for rendering.
  let publicPropertyRecord: PropertyRecord | null = null;
  try {
    const { data: profileRun } = await (supabase.from("property_review_runs") as any)
      .select("normalized_payload, requested_at")
      .eq("property_id", propertyId)
      .eq("provider", "rentcast")
      .eq("artifact_type", "property_profile")
      .eq("is_current", true)
      .eq("status", "completed")
      .maybeSingle();
    if (profileRun?.normalized_payload) {
      const profile = profileRun.normalized_payload as NormalizedPropertyProfile;
      publicPropertyRecord = normalizedProfileToRecord(profile, profileRun.requested_at ?? null);
    }
  } catch {
    // non-fatal
  }

  // Fetch RentCast AVM summary (non-fatal — used in value section)
  let publicAvm: PropertyAvm | null = null;
  try {
    const { data: avmSummary } = await (supabase.from("property_review_summary") as any)
      .select("fmv_amount, fmv_low, fmv_high, fmv_confidence, fmv_fetched_at")
      .eq("property_id", propertyId)
      .maybeSingle();
    if (avmSummary?.fmv_amount != null) {
      publicAvm = {
        estimate: avmSummary.fmv_amount,
        low: avmSummary.fmv_low ?? null,
        high: avmSummary.fmv_high ?? null,
        confidence: avmSummary.fmv_confidence ?? null,
        fetchedAt: avmSummary.fmv_fetched_at ?? null,
      };
    }
  } catch {
    // non-fatal
  }

  // Build reviewed basis — generic label for buyer (hides internal source name)
  const publicReviewedBasis = reviewedBasisFromProperty(
    (row.latest_verified_fmv as number | null) ?? null,
    (row.fmv_verification_source as string | null) ?? null,
    "Reviewed estimate",
  );

  // Fetch Mashvisor enrichment images for hero slot (non-fatal, buyer-safe)
  let publicHeroImages: MashvisorImagesPayload | null = null;
  try {
    const { data: enrichmentRow } = await (supabase
      .from("property_enrichments") as any)
      .select("images_payload")
      .eq("property_id", propertyId)
      .eq("provider", "mashvisor")
      .eq("is_current", true)
      .eq("status", "completed")
      .maybeSingle();
    publicHeroImages = (enrichmentRow?.images_payload as MashvisorImagesPayload | null) ?? null;
  } catch {
    // non-fatal
  }

  // Fetch owner photos for buyer hero display (non-fatal)
  let publicOwnerPhotos: OwnerPhoto[] = [];
  try {
    const { data: photoRows } = await (supabase
      .from("property_photos") as any)
      .select("*")
      .eq("property_id", propertyId)
      .is("removed_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    publicOwnerPhotos = photoRows ?? [];
  } catch {
    // non-fatal
  }

  // Coordinates from normalized property record (for hero map fallback)
  const publicHeroLat = publicPropertyRecord?.latitude ?? null;
  const publicHeroLng = publicPropertyRecord?.longitude ?? null;
  const publicHeroAddress =
    publicPropertyRecord?.formattedAddress ?? fullAddress ?? null;

  // AVM summary tile helpers
  function fmtUSD(n: number): string {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-6">
        {/* Back link */}
        <Link
          href="/verified-properties"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
          All verified properties
        </Link>

        {/* ── A. Header — address H1 + Verified badge ── */}
        <PropertyPageHeader
          address={publicHeroAddress ?? fullAddress}
          propertyStatus="verified"
          showOwnerVerified={false}
          showAppraisalBadge={false}
          appraisalUnderReview={false}
          appraisalExpired={false}
          appraisalBadgeLabel=""
          expiresAt={null}
          ownershipStatus={null}
          isParticipationApproved={true}
        />

        {/* ── B. Hero media — owner photos first, vendor fallback, then map ── */}
        <PropertyHeroMedia
          ownerPhotos={publicOwnerPhotos}
          images={publicHeroImages}
          lat={publicHeroLat}
          lng={publicHeroLng}
          address={publicHeroAddress}
          audience="buyer"
        />

        {/* ── C. Valuation summary — buyer-safe (estimate + range + reviewed basis) ── */}
        {publicAvm?.estimate != null && (
          <section className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">Estimated value</h2>
            </div>
            <div className="px-4 py-4">
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {fmtUSD(publicAvm.estimate)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Estimate</p>
                </div>
                {publicAvm.low != null && publicAvm.high != null && (
                  <div>
                    <p className="text-sm font-semibold tabular-nums">
                      {fmtUSD(publicAvm.low)} – {fmtUSD(publicAvm.high)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Range</p>
                  </div>
                )}
                {publicReviewedBasis?.value != null && (
                  <div>
                    <p className="text-sm font-semibold tabular-nums">
                      {fmtUSD(publicReviewedBasis.value)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {publicReviewedBasis.label ?? "Reviewed estimate"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── D. Base property data (normalized from RentCast) — privacy-safe subset ── */}
        {publicPropertyRecord && (
          <PropertyRecordSections record={publicPropertyRecord} audience="buyer" />
        )}

        {/* Compliance note */}
        <p className="text-[11px] text-muted-foreground border-t pt-4">
          This is not a public listing or an offer of sale. Property information
          is subject to verification and review. Contact FractPath to explore
          a home equity agreement proposal.
        </p>
      </main>
    </div>
  );
}
