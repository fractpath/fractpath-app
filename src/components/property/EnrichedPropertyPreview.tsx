"use client";

import { useState } from "react";
import type {
  MashvisorNormalizedSummary,
  MashvisorImagesPayload,
} from "@/lib/mashvisor/types";
import { Lightbox } from "@/components/admin/Lightbox";
import type { PropertyFacts } from "@/lib/property/propertyFacts";

export type { PropertyFacts };

export type EnrichedPreviewAudience = "admin" | "owner" | "buyer";

/**
 * Combined property enrichment data passed to EnrichedPropertyPreview.
 *
 * Facts resolution priority (highest → lowest):
 *   1. `facts`   — provider-agnostic shape (RentCast in Phase 2+)
 *   2. `summary` — Mashvisor-specific legacy shape (for value_estimate + backward compat)
 *
 * Image resolution: `images` — Mashvisor-hosted URLs (or null/empty when unavailable).
 *
 * Both `summary` and `images` are optional to support facts-only scenarios
 * (no Mashvisor row yet) and images-only scenarios cleanly.
 */
export type EnrichedPreviewData = {
  /** Legacy Mashvisor summary — kept for value_estimate and backward compat. */
  summary?: MashvisorNormalizedSummary | null;
  /** Mashvisor-hosted image URLs. Null/absent when no images have been fetched. */
  images?: MashvisorImagesPayload | null;
  fetchedAt?: string | null;
  providerRecordId?: string | null;
  imageCount?: number;
  /**
   * Provider-agnostic facts (beds/baths/sqft etc.).
   * When present, overrides the equivalent fields from `summary`.
   * Populated from RentCast property_review_runs in Phase 2+.
   */
  facts?: PropertyFacts;
};

type Props = {
  enrichment: EnrichedPreviewData;
  audience: EnrichedPreviewAudience;
  /**
   * Label shown below the numeric value estimate in the stats row.
   * Defaults to "Source value" (unreviewed third-party estimate).
   * Pass "Reviewed value" when AVM/ATTOM reviewed, "Appraised value" when
   * a manual appraisal is the controlling basis.
   */
  valuationLabel?: string;
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

// ─── Sub-components ────────────────────────────────────────────────────────────

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

/** Shown in place of an image whose src failed to load. */
function ImageUnavailableTile({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded border border-dashed border-muted-foreground/30 bg-muted/20 ${className ?? ""}`}
      aria-label="Image unavailable"
    >
      <span className="text-[11px] text-muted-foreground select-none">
        Image unavailable
      </span>
    </div>
  );
}

// ─── Main shared component ─────────────────────────────────────────────────────

export function EnrichedPropertyPreview({
  enrichment,
  audience,
  valuationLabel = "Source value",
}: Props) {
  const { summary, images, facts } = enrichment;

  // Facts resolution: prefer provider-agnostic `facts` over legacy Mashvisor `summary`
  const beds = facts?.beds ?? summary?.beds ?? null;
  const baths = facts?.baths ?? summary?.baths ?? null;
  const sqft = facts?.sqft ?? summary?.sqft ?? null;
  const displayAddress = facts?.address ?? summary?.address ?? null;
  const displayPropertyType = facts?.propertyType ?? summary?.property_type ?? null;
  // value_estimate still comes from Mashvisor summary (Phase 2: no RentCast AVM override here)
  const valueEstimate = summary?.value_estimate ?? null;

  const coverUrl = images?.cover_image_url ?? null;

  // All stored image URLs in display order (cover first, then gallery)
  const allImageUrls: string[] = images?.image_urls ?? [];

  // Gallery URLs: everything after the cover, de-duplicated
  const galleryUrls: string[] = [];
  for (const u of allImageUrls) {
    if (u !== coverUrl && !galleryUrls.includes(u)) galleryUrls.push(u);
  }

  // Track which image URLs have failed to load so we can render a visible fallback.
  // Keyed by URL string (stable across re-renders).
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  function markFailed(url: string) {
    setFailedUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  // Lightbox state: index into allImageUrls
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);

  function openLightbox(idx: number) {
    setLbIndex(idx);
    setLbOpen(true);
  }

  const isAdmin = audience === "admin";
  const fetchedAt =
    enrichment.fetchedAt ??
    facts?.fetchedAt ??
    summary?.fetched_at ??
    null;

  return (
    <div className="space-y-4">

      {/* Hero image — clicking opens lightbox at index 0 */}
      {coverUrl && (
        failedUrls.has(coverUrl) ? (
          <ImageUnavailableTile className="w-full aspect-video" />
        ) : (
          <button
            type="button"
            className="block w-full rounded-md overflow-hidden border bg-muted/30 aspect-video cursor-zoom-in focus:outline-none"
            onClick={() => openLightbox(0)}
            aria-label="View full-size property photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt="Property photo"
              className="w-full h-full object-cover"
              onError={() => markFailed(coverUrl)}
            />
          </button>
        )
      )}

      {/* Address + property type */}
      <div>
        {displayAddress && (
          <p className="text-sm font-semibold leading-snug">{displayAddress}</p>
        )}
        {displayPropertyType && (
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">
            {displayPropertyType}
          </p>
        )}
        {/* Show fetched timestamp to admin and owner, but NOT buyer */}
        {(isAdmin || audience === "owner") && fetchedAt && (
          <p className="text-[11px] text-muted-foreground mt-1" suppressHydrationWarning>
            Fetched {fmtDate(fetchedAt)}
          </p>
        )}
      </div>

      {/* Key stats row */}
      <div className="flex flex-wrap gap-2">
        <StatTile
          label="Beds"
          value={beds != null ? String(beds) : "—"}
        />
        <StatTile
          label="Baths"
          value={baths != null ? String(baths) : "—"}
        />
        <StatTile label="Sq ft" value={fmtNum(sqft)} />
        <StatTile
          label={valuationLabel}
          value={fmtCurrency(valueEstimate)}
        />
      </div>

      {/* Gallery strip — thumbnails beyond the cover, click opens lightbox */}
      {galleryUrls.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            Gallery
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {galleryUrls.slice(0, 8).map((u, i) => {
              const allIdx = allImageUrls.indexOf(u);
              const lbIdx = allIdx >= 0 ? allIdx : i + 1;
              return failedUrls.has(u) ? (
                <ImageUnavailableTile
                  key={i}
                  className="shrink-0 w-20 h-14"
                />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => openLightbox(lbIdx)}
                  className="shrink-0 w-20 h-14 rounded border overflow-hidden bg-muted/30 cursor-zoom-in focus:outline-none"
                  aria-label={`View photo ${lbIdx + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={u}
                    alt={`Property photo ${i + 2}`}
                    className="w-full h-full object-cover"
                    onError={() => markFailed(u)}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin-only metadata block */}
      {isAdmin && (
        <div className="rounded border bg-muted/20 divide-y text-xs">
          {facts?.source && (
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Facts source</span>
              <span className="font-medium capitalize">
                {facts.source === "rentcast" ? "RentCast" : "Mashvisor"}
              </span>
            </div>
          )}
          <div className="flex justify-between px-3 py-2">
            <span className="text-muted-foreground">Provider property ID</span>
            <span className="font-mono font-medium">
              {enrichment.providerRecordId ?? summary?.mashvisor_property_id ?? "—"}
            </span>
          </div>
          <div className="flex justify-between px-3 py-2" suppressHydrationWarning>
            <span className="text-muted-foreground">Last fetched</span>
            <span className="font-medium" suppressHydrationWarning>
              {fmtDate(fetchedAt)}
            </span>
          </div>
          <div className="flex justify-between px-3 py-2">
            <span className="text-muted-foreground">Images stored</span>
            <span className="font-medium">
              {enrichment.imageCount ?? allImageUrls.length}
            </span>
          </div>
        </div>
      )}

      {/* Gallery lightbox — prev/next navigation */}
      {allImageUrls.length > 0 && (
        <Lightbox
          open={lbOpen}
          images={allImageUrls}
          index={lbIndex}
          onNavigate={setLbIndex}
          onClose={() => setLbOpen(false)}
          alt="Property photo"
        />
      )}
    </div>
  );
}
