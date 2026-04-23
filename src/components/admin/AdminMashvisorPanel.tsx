"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MashvisorNormalizedSummary, MashvisorImagesPayload } from "@/lib/mashvisor/types";
import { EnrichedPropertyPreview } from "@/components/property/EnrichedPropertyPreview";
import type {
  PropertyFacts,
  PropertyAvm,
  PropertyReviewedBasis,
} from "@/lib/property/propertyFacts";

type Enrichment = {
  id: string;
  status: string;
  provider_record_id: string | null;
  summary_payload: unknown;
  images_payload: unknown;
  fetched_at: string | null;
  error_message: string | null;
};

type Props = {
  propertyId: string;
  hasAddress: boolean;
  enrichment: Enrichment | null;
  /** Provider-agnostic facts from RentCast property_review_runs. */
  rentcastFacts?: PropertyFacts | null;
  /** Timestamp of the current RentCast property_profile run (requested_at). */
  rentcastFetchedAt?: string | null;
  /** RentCast provider property ID (raw_payload.id). */
  rentcastRecordId?: string | null;
  /** RentCast AVM estimate + range + confidence. */
  avm?: PropertyAvm | null;
  /** Reviewed/controlling FMV basis (ATTOM, manual appraisal, etc.). */
  reviewedBasis?: PropertyReviewedBasis | null;
  /**
   * @deprecated Kept for backward compat — no longer rendered in the preview.
   * Pass `avm` and `reviewedBasis` instead.
   */
  valuationLabel?: string;
};

function Spinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5 text-muted-foreground"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export function AdminMashvisorPanel({
  propertyId,
  hasAddress,
  enrichment,
  rentcastFacts,
  rentcastFetchedAt,
  rentcastRecordId,
  avm,
  reviewedBasis,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Enrichment | null>(enrichment);

  const completed = current?.status === "completed";

  const summary = completed
    ? (current!.summary_payload as MashvisorNormalizedSummary | null)
    : null;
  const images = completed
    ? (current!.images_payload as MashvisorImagesPayload | null)
    : null;

  const buttonLabel = completed ? "Refresh Enrichment Data" : "Fetch Enrichment Data";

  async function handleFetch() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/review/fetch-mashvisor`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!json.ok) {
        setFetchError(json.error ?? "Fetch failed");
      } else {
        setCurrent({
          id: json.enrichmentId,
          status: "completed",
          provider_record_id: json.summary.mashvisor_property_id ?? null,
          summary_payload: json.summary,
          images_payload: json.images,
          fetched_at: json.summary.fetched_at,
          error_message: null,
        });
        router.refresh();
      }
    } catch {
      setFetchError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Metadata priority: RentCast is the facts source; Mashvisor is image-only fallback.
  // fetchedAt and providerRecordId reflect the current RentCast profile run when available.
  const effectiveFetchedAt = rentcastFetchedAt ?? rentcastFacts?.fetchedAt ?? current?.fetched_at ?? null;
  const effectiveRecordId = rentcastRecordId ?? current?.provider_record_id ?? null;
  const factsSourceLabel = rentcastFacts ? "RentCast" : completed ? "Mashvisor" : null;

  return (
    <div className="rounded-lg border overflow-hidden">

      {/* Panel header */}
      <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Property Preview</span>
          {factsSourceLabel && (
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {factsSourceLabel}
              {rentcastFacts && completed && " · Mashvisor images"}
            </span>
          )}
        </div>

        {hasAddress && (
          <button
            type="button"
            onClick={handleFetch}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50 shrink-0"
          >
            {loading && <Spinner />}
            {loading ? "Fetching…" : buttonLabel}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* Address missing warning */}
        {!hasAddress && (
          <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            Property address is incomplete (address line, city, and state required). Enrichment
            fetch is unavailable until address data is present.
          </div>
        )}

        {/* Fetch errors */}
        {fetchError && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {fetchError}
          </div>
        )}

        {current?.status === "failed" && !fetchError && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            Last fetch failed
            {current.error_message ? `: ${current.error_message}` : "."}{" "}
            Try again or check that the address is complete.
          </div>
        )}

        {/* Shared enriched property preview */}
        {(rentcastFacts || avm || (summary && images)) ? (
          <EnrichedPropertyPreview
            audience="admin"
            enrichment={{
              summary: summary ?? null,
              images: images ?? null,
              // fetchedAt: RentCast profile run timestamp takes priority over
              // Mashvisor enrichment row timestamp.
              fetchedAt: effectiveFetchedAt,
              // providerRecordId: RentCast record ID takes priority over Mashvisor property ID.
              providerRecordId: effectiveRecordId,
              imageCount: images?.image_urls?.length ?? 0,
              facts: rentcastFacts ?? undefined,
              avm: avm ?? null,
              reviewedBasis: reviewedBasis ?? null,
            }}
          />
        ) : !loading && current?.status !== "failed" ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No enrichment data yet. Use the button above to fetch property data from Mashvisor.
            </p>
            <p className="text-xs text-muted-foreground">
              Retrieves third-party property data for admin review only. Does not affect
              owner-facing surfaces or the verification workflow.
            </p>
          </div>
        ) : null}

      </div>
    </div>
  );
}
