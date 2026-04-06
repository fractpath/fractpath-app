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

// ─── Format helpers ────────────────────────────────────────────────────────────

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

function fmtNum(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString("en-US");
}

// ─── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5 text-muted-foreground"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded border bg-muted/30 px-3 py-2 min-w-[72px]">
      <span className="text-base font-semibold leading-none">{value}</span>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AdminMashvisorPanel({ propertyId, hasAddress, enrichment }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Enrichment | null>(enrichment);

  const completed = current?.status === "completed";

  // Safely cast stored payloads — they may be null or partial.
  const summary = completed
    ? (current!.summary_payload as MashvisorNormalizedSummary | null)
    : null;
  const images = completed
    ? (current!.images_payload as MashvisorImagesPayload | null)
    : null;

  const coverUrl = images?.cover_image_url ?? null;

  // Gallery: all URLs minus the cover (already shown as hero), de-duplicated.
  const galleryUrls: string[] = [];
  if (images?.image_urls && images.image_urls.length > 1) {
    for (const u of images.image_urls) {
      if (u !== coverUrl && !galleryUrls.includes(u)) galleryUrls.push(u);
    }
  }

  const buttonLabel =
    completed ? "Refresh Enrichment Data" : "Fetch Enrichment Data";

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

  return (
    <div className="rounded-lg border overflow-hidden">

      {/* ── Panel header ─────────────────────────────────────────────────────── */}
      <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Property Preview</span>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Mashvisor
          </span>
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

        {/* ── Address missing warning ─────────────────────────────────────── */}
        {!hasAddress && (
          <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            Property address is incomplete (address line, city, and state required). Enrichment
            fetch is unavailable until address data is present.
          </div>
        )}

        {/* ── Fetch errors ───────────────────────────────────────────────── */}
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

        {/* ── Property preview ──────────────────────────────────────────── */}
        {summary ? (
          <div className="space-y-4">

            {/* Hero image */}
            {coverUrl && (
              <div className="rounded-md overflow-hidden border w-full aspect-video bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrl}
                  alt="Property photo"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).closest("div")!.style.display = "none";
                  }}
                />
              </div>
            )}

            {/* Address + property type */}
            <div>
              {summary.address && (
                <p className="text-sm font-semibold leading-snug">{summary.address}</p>
              )}
              {summary.property_type && (
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                  {summary.property_type}
                </p>
              )}
              {current?.fetched_at && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Fetched {fmtDate(current.fetched_at)}
                </p>
              )}
            </div>

            {/* Key stats row */}
            <div className="flex flex-wrap gap-2">
              <StatTile
                label="Beds"
                value={summary.beds != null ? String(summary.beds) : "—"}
              />
              <StatTile
                label="Baths"
                value={summary.baths != null ? String(summary.baths) : "—"}
              />
              <StatTile
                label="Sq ft"
                value={fmtNum(summary.sqft)}
              />
              <StatTile
                label="Source value"
                value={fmtCurrency(summary.value_estimate)}
              />
            </div>

            {/* Gallery strip — thumbnails beyond the cover */}
            {galleryUrls.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                  Gallery
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {galleryUrls.slice(0, 8).map((u, i) => (
                    <div
                      key={i}
                      className="shrink-0 w-20 h-14 rounded border overflow-hidden bg-muted/30"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={u}
                        alt={`Property photo ${i + 2}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).closest("div")!.style.display =
                            "none";
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Admin metadata */}
            <div className="rounded border bg-muted/20 divide-y text-xs">
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Mashvisor property ID</span>
                <span className="font-mono font-medium">
                  {summary.mashvisor_property_id ?? "—"}
                </span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Last fetched</span>
                <span className="font-medium">{fmtDate(current?.fetched_at)}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Images stored</span>
                <span className="font-medium">
                  {images?.image_urls?.length ?? 0}
                </span>
              </div>
            </div>
          </div>
        ) : !loading && current?.status !== "failed" ? (
          /* ── Empty state ─────────────────────────────────────────────────── */
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
