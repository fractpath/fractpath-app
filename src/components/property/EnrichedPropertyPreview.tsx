"use client";

import { useState } from "react";
import type {
  MashvisorNormalizedSummary,
  MashvisorImagesPayload,
} from "@/lib/mashvisor/types";
import { Lightbox } from "@/components/admin/Lightbox";

export type EnrichedPreviewAudience = "admin" | "owner" | "buyer";

export type EnrichedPreviewData = {
  summary: MashvisorNormalizedSummary;
  images: MashvisorImagesPayload;
  fetchedAt?: string | null;
  providerRecordId?: string | null;
  imageCount?: number;
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

// ─── Main shared component ─────────────────────────────────────────────────────

export function EnrichedPropertyPreview({ enrichment, audience, valuationLabel = "Source value" }: Props) {
  const { summary, images } = enrichment;
  const coverUrl = images.cover_image_url ?? null;

  // All stored image URLs in display order (cover first, then gallery)
  const allImageUrls: string[] = images.image_urls ?? [];

  // Gallery URLs: everything after the cover, de-duplicated
  const galleryUrls: string[] = [];
  for (const u of allImageUrls) {
    if (u !== coverUrl && !galleryUrls.includes(u)) galleryUrls.push(u);
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
    enrichment.fetchedAt ?? summary.fetched_at ?? null;

  return (
    <div className="space-y-4">

      {/* Hero image — clicking opens lightbox at index 0 */}
      {coverUrl && (
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
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              const btn = el.closest("button");
              if (btn) btn.style.display = "none";
            }}
          />
        </button>
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
          value={summary.beds != null ? String(summary.beds) : "—"}
        />
        <StatTile
          label="Baths"
          value={summary.baths != null ? String(summary.baths) : "—"}
        />
        <StatTile label="Sq ft" value={fmtNum(summary.sqft)} />
        <StatTile
          label={valuationLabel}
          value={fmtCurrency(summary.value_estimate)}
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
              // Index into allImageUrls: cover is 0, gallery starts at 1
              const allIdx = allImageUrls.indexOf(u);
              const lbIdx = allIdx >= 0 ? allIdx : i + 1;
              return (
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
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement;
                      const btn = el.closest("button");
                      if (btn) btn.style.display = "none";
                    }}
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
          <div className="flex justify-between px-3 py-2">
            <span className="text-muted-foreground">Provider property ID</span>
            <span className="font-mono font-medium">
              {enrichment.providerRecordId ?? summary.mashvisor_property_id ?? "—"}
            </span>
          </div>
          <div className="flex justify-between px-3 py-2" suppressHydrationWarning>
            <span className="text-muted-foreground">Last fetched</span>
            <span className="font-medium" suppressHydrationWarning>{fmtDate(fetchedAt)}</span>
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
