import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import { EnrichedPropertyPreview } from "@/components/property/EnrichedPropertyPreview";
import type {
  MashvisorNormalizedSummary,
  MashvisorImagesPayload,
} from "@/lib/mashvisor/types";
import type { EnrichedPreviewData } from "@/components/property/EnrichedPropertyPreview";
import Link from "next/link";

export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ propertyId: string }>;
};

// Only the public-safe columns needed for this page
const PUBLIC_SELECT =
  "id, address_line1, address_line2, city, state, postal_code, status, visibility_preference, verified_at, ownership_type, occupancy_use";

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

function humanizeOccupancy(val: string | null | undefined): string | null {
  if (!val) return null;
  if (val === "primary_residence") return "Primary residence";
  if (val === "secondary_residence") return "Secondary residence";
  if (val === "rental_property") return "Rental property";
  return val.replace(/_/g, " ");
}

function humanizeOwnership(val: string | null | undefined): string | null {
  if (!val) return null;
  if (val === "sole_owner") return "Sole owner";
  if (val === "co_owner") return "Co-owner";
  if (val === "trust") return "Trust";
  if (val === "llc") return "LLC";
  return val.replace(/_/g, " ");
}

function fmtVerifiedDate(val: string | null | undefined): string | null {
  if (!val) return null;
  try {
    return new Date(val).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
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
  const verifiedDate = fmtVerifiedDate(row.verified_at);
  const occupancyLabel = humanizeOccupancy(row.occupancy_use);
  const ownershipLabel = humanizeOwnership(row.ownership_type);

  // Fetch current enrichment (non-fatal, audience=buyer — hides provider IDs)
  let enrichment: EnrichedPreviewData | null = null;
  try {
    const { data: enrichmentRow } = await (supabase
      .from("property_enrichments") as any)
      .select("summary_payload, images_payload, fetched_at")
      .eq("property_id", propertyId)
      .eq("provider", "mashvisor")
      .eq("is_current", true)
      .eq("status", "completed")
      .maybeSingle();

    if (enrichmentRow) {
      const summary = enrichmentRow.summary_payload as MashvisorNormalizedSummary | null;
      const images = enrichmentRow.images_payload as MashvisorImagesPayload | null;
      if (summary && images) {
        enrichment = {
          summary,
          images,
          fetchedAt: enrichmentRow.fetched_at ?? summary.fetched_at ?? null,
          // Intentionally omit providerRecordId and imageCount for buyer audience
        };
      }
    }
  } catch {
    // non-fatal — fall through to simplified view
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
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

        {/* Header — address + badge */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <svg
                className="w-3 h-3"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              Verified
            </span>
            {verifiedDate && (
              <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                Since {verifiedDate}
              </span>
            )}
          </div>
          <h1 className="text-xl font-semibold leading-snug">{fullAddress}</h1>
        </div>

        {/* Enriched preview if available — buyer audience (no provider IDs, no admin metadata) */}
        {enrichment ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Property preview
            </p>
            <EnrichedPropertyPreview enrichment={enrichment} audience="buyer" />
          </div>
        ) : (
          /* No-enrichment fallback — intentional simplified state */
          <div className="rounded-lg border bg-muted/20 px-5 py-5 space-y-3">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-muted-foreground/50 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                />
              </svg>
              <p className="text-sm font-medium">Property details</p>
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="font-medium text-right">{fullAddress}</dd>
              </div>
              {occupancyLabel && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Use</dt>
                  <dd className="font-medium">{occupancyLabel}</dd>
                </div>
              )}
              {ownershipLabel && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Ownership</dt>
                  <dd className="font-medium">{ownershipLabel}</dd>
                </div>
              )}
            </dl>
            <p className="text-[11px] text-muted-foreground">
              Detailed property data will be available once additional enrichment
              is completed.
            </p>
          </div>
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
