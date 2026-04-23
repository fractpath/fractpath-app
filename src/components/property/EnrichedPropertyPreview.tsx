"use client";

import { useState } from "react";
import type {
  MashvisorNormalizedSummary,
  MashvisorImagesPayload,
} from "@/lib/mashvisor/types";
import { Lightbox } from "@/components/admin/Lightbox";
import type { PropertyFacts, PropertyAvm, PropertyReviewedBasis } from "@/lib/property/propertyFacts";

export type { PropertyFacts, PropertyAvm, PropertyReviewedBasis };

export type EnrichedPreviewAudience = "admin" | "owner" | "buyer";

/**
 * Combined property enrichment data passed to EnrichedPropertyPreview.
 *
 * Facts resolution priority (highest → lowest):
 *   1. `facts`   — provider-agnostic shape (RentCast in Phase 2+)
 *   2. `summary` — Mashvisor-specific legacy shape (backward compat only)
 *
 * Valuation:
 *   `avm`           — RentCast estimate + range + confidence
 *   `reviewedBasis` — ATTOM / manual-appraisal controlling basis (owner + admin)
 *
 * Images: `images` — Mashvisor-hosted URLs (null when no Mashvisor row exists).
 *
 * Both `summary` and `images` are optional to support facts-only and images-only
 * scenarios cleanly.
 */
export type EnrichedPreviewData = {
  /** Legacy Mashvisor summary — kept for backward compat only (no value tile rendered). */
  summary?: MashvisorNormalizedSummary | null;
  /** Mashvisor-hosted image URLs. Null/absent when no images have been fetched. */
  images?: MashvisorImagesPayload | null;
  fetchedAt?: string | null;
  providerRecordId?: string | null;
  imageCount?: number;
  /**
   * Provider-agnostic physical facts (beds/baths/sqft/lotSize/yearBuilt/type).
   * Populated from RentCast property_review_runs (artifact_type='property_profile').
   */
  facts?: PropertyFacts;
  /**
   * RentCast AVM estimate + confidence range.
   * Populated from property_review_summary or property_review_runs (artifact_type='avm').
   */
  avm?: PropertyAvm | null;
  /**
   * Admin/owner-controlled reviewed FMV (ATTOM, manual appraisal, etc.).
   * For buyer audience the component renders a generic "Reviewed estimate" label.
   */
  reviewedBasis?: PropertyReviewedBasis | null;
};

type Props = {
  enrichment: EnrichedPreviewData;
  audience: EnrichedPreviewAudience;
  /**
   * @deprecated No longer used — the Mashvisor value_estimate tile has been
   * removed. Pass `avm` and `reviewedBasis` on EnrichedPreviewData instead.
   * The prop is kept to avoid breaking existing call sites.
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

/** Format lot size (sqft) as acres when >= 1 acre, otherwise as sqft. */
function fmtLotSize(sqft: number | null | undefined): string {
  if (sqft == null) return "—";
  if (sqft >= 43560) {
    const acres = sqft / 43560;
    return acres >= 10
      ? `${Math.round(acres)} ac`
      : `${acres.toFixed(2)} ac`;
  }
  return `${fmtNum(sqft)} sf`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded border bg-muted/30 px-3 py-2 min-w-[64px]">
      <span className="text-sm font-semibold leading-none">{value}</span>
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
}: Props) {
  const { summary, images, facts, avm, reviewedBasis } = enrichment;

  // ── Facts resolution: prefer provider-agnostic `facts` ──────────────────────
  const beds = facts?.beds ?? summary?.beds ?? null;
  const baths = facts?.baths ?? summary?.baths ?? null;
  const sqft = facts?.sqft ?? summary?.sqft ?? null;
  const lotSize = facts?.lotSize ?? null;
  const yearBuilt = facts?.yearBuilt ?? null;
  const displayAddress = facts?.address ?? summary?.address ?? null;
  const displayPropertyType = facts?.propertyType ?? summary?.property_type ?? null;
  const hasFacts =
    beds != null ||
    baths != null ||
    sqft != null ||
    lotSize != null ||
    yearBuilt != null;

  // ── Images ──────────────────────────────────────────────────────────────────
  const coverUrl = images?.cover_image_url ?? null;
  const allImageUrls: string[] = images?.image_urls ?? [];
  const galleryUrls: string[] = [];
  for (const u of allImageUrls) {
    if (u !== coverUrl && !galleryUrls.includes(u)) galleryUrls.push(u);
  }

  // ── Value section ────────────────────────────────────────────────────────────
  const hasAvm = avm?.estimate != null;
  const hasReviewedBasis = reviewedBasis?.value != null;
  const hasValueSection = hasAvm || hasReviewedBasis;

  // ── Audience flags ───────────────────────────────────────────────────────────
  const isAdmin = audience === "admin";
  const isOwner = audience === "owner";

  // ── Timestamp ────────────────────────────────────────────────────────────────
  const fetchedAt =
    enrichment.fetchedAt ??
    facts?.fetchedAt ??
    summary?.fetched_at ??
    null;

  // ── Image error tracking ─────────────────────────────────────────────────────
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  function markFailed(url: string) {
    setFailedUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  // ── Lightbox ─────────────────────────────────────────────────────────────────
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);
  function openLightbox(idx: number) {
    setLbIndex(idx);
    setLbOpen(true);
  }

  return (
    <div className="space-y-4">

      {/* ── Hero image ──────────────────────────────────────────────────────── */}
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

      {/* ── Address + property type + timestamp ─────────────────────────────── */}
      {(displayAddress || displayPropertyType || ((isAdmin || isOwner) && fetchedAt)) && (
        <div>
          {displayAddress && (
            <p className="text-sm font-semibold leading-snug">{displayAddress}</p>
          )}
          {displayPropertyType && (
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              {displayPropertyType}
            </p>
          )}
          {(isAdmin || isOwner) && fetchedAt && (
            <p className="text-[11px] text-muted-foreground mt-1" suppressHydrationWarning>
              Fetched {fmtDate(fetchedAt)}
            </p>
          )}
        </div>
      )}

      {/* ── Physical facts row ───────────────────────────────────────────────── */}
      {hasFacts && (
        <div className="flex flex-wrap gap-2">
          {beds != null && <StatTile label="Beds" value={String(beds)} />}
          {baths != null && <StatTile label="Baths" value={String(baths)} />}
          {sqft != null && <StatTile label="Sq ft" value={fmtNum(sqft)} />}
          {lotSize != null && <StatTile label="Lot" value={fmtLotSize(lotSize)} />}
          {yearBuilt != null && <StatTile label="Built" value={String(yearBuilt)} />}
        </div>
      )}

      {/* ── Value section ───────────────────────────────────────────────────── */}
      {hasValueSection && (
        <div className="rounded border bg-muted/20 divide-y text-xs">

          {/* RentCast AVM estimate */}
          {hasAvm && (
            <div className="px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground font-medium">Estimated value</span>
                <span className="font-semibold text-sm tabular-nums">
                  {fmtCurrency(avm!.estimate)}
                </span>
              </div>
              {(avm!.low != null || avm!.high != null) && (
                <p className="text-[10px] text-muted-foreground">
                  Range: {fmtCurrency(avm!.low)} – {fmtCurrency(avm!.high)}
                  {avm!.confidence
                    ? ` · ${avm!.confidence} confidence`
                    : ""}
                </p>
              )}
            </div>
          )}

          {/* Reviewed / controlling basis */}
          {hasReviewedBasis && (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-muted-foreground font-medium">
                {audience === "buyer" ? "Reviewed estimate" : reviewedBasis!.label}
              </span>
              <span className="font-semibold text-sm tabular-nums">
                {fmtCurrency(reviewedBasis!.value)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Gallery strip ───────────────────────────────────────────────────── */}
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
                <ImageUnavailableTile key={i} className="shrink-0 w-20 h-14" />
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

      {/* ── Admin-only metadata block ───────────────────────────────────────── */}
      {isAdmin && (
        <div className="rounded border bg-muted/20 divide-y text-xs">
          {facts?.source && (
            <div className="flex justify-between px-3 py-2">
              <span className="text-muted-foreground">Facts source</span>
              <span className="font-medium">
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

      {/* ── Gallery lightbox ────────────────────────────────────────────────── */}
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
