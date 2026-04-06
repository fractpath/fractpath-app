"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MashvisorNormalizedSummary, MashvisorImagesPayload } from "@/lib/mashvisor/types";

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
};

function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(val);
  }
}

function fmtCurrency(val: number | null | undefined): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1.5 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function AdminMashvisorPanel({ propertyId, hasAddress, enrichment }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Enrichment | null>(enrichment);

  const completed = current?.status === "completed";
  const summary = completed ? (current!.summary_payload as MashvisorNormalizedSummary | null) : null;
  const images = completed ? (current!.images_payload as MashvisorImagesPayload | null) : null;
  const coverUrl = images?.cover_image_url ?? null;

  const buttonLabel = completed ? "Refresh Enrichment Data" : "Fetch Enrichment Data";

  async function handleFetch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/review/fetch-mashvisor`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Fetch failed");
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
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center justify-between">
        <span>Property enrichment data</span>
        <span className="text-xs font-normal text-muted-foreground">Mashvisor</span>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Retrieves third-party property data for review. This is a manual admin action and does
          not affect owner-facing surfaces or the verification workflow.
        </p>

        {!hasAddress && (
          <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            Property does not have a complete address (address line, city, and state required).
            Enrichment fetch is unavailable until address data is present.
          </div>
        )}

        {hasAddress && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleFetch}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {loading && (
                <svg
                  className="animate-spin h-3.5 w-3.5 text-muted-foreground"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {loading ? "Fetching…" : buttonLabel}
            </button>
            {current?.fetched_at && (
              <span className="text-xs text-muted-foreground">
                Last fetched: {fmtDate(current.fetched_at)}
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        {current?.status === "failed" && !error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            Last fetch failed
            {current.error_message ? `: ${current.error_message}` : "."}{" "}
            Try again or verify the address is complete.
          </div>
        )}

        {summary && (
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Property data summary
            </div>

            {/* Cover image */}
            {coverUrl && (
              <div className="rounded overflow-hidden border w-full max-w-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrl}
                  alt="Property cover"
                  className="w-full object-cover max-h-40"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            <div className="divide-y rounded border overflow-hidden">
              <SummaryRow
                label="Property ID"
                value={summary.mashvisor_property_id ?? "—"}
              />
              <SummaryRow
                label="Address (provider)"
                value={summary.address ?? "—"}
              />
              <SummaryRow
                label="Property type"
                value={summary.property_type ?? "—"}
              />
              <SummaryRow
                label="Beds"
                value={summary.beds != null ? String(summary.beds) : "—"}
              />
              <SummaryRow
                label="Baths"
                value={summary.baths != null ? String(summary.baths) : "—"}
              />
              <SummaryRow
                label="Sq ft"
                value={summary.sqft != null ? summary.sqft.toLocaleString() : "—"}
              />
              <SummaryRow
                label="Value estimate"
                value={fmtCurrency(summary.value_estimate)}
              />
            </div>

            {images && images.image_urls.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {images.image_urls.length} image{images.image_urls.length !== 1 ? "s" : ""} stored in enrichment record.
              </p>
            )}
          </div>
        )}

        {!summary && !loading && current?.status !== "failed" && (
          <p className="text-xs text-muted-foreground">
            No enrichment data yet. Click the button above to fetch from Mashvisor.
          </p>
        )}
      </div>
    </div>
  );
}
