"use client";

import { useState } from "react";
import type { MashvisorImagesPayload } from "@/lib/mashvisor/types";
import type { OwnerPhoto } from "@/lib/property/photos";
import { activePhotos, heroPhotoUrl } from "@/lib/property/photos";

type Audience = "owner" | "buyer" | "admin";

type Props = {
  images: MashvisorImagesPayload | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  audience: Audience;
  ownerPhotos?: OwnerPhoto[];
  onManagePhotos?: () => void;
};

// ── Icon helpers ───────────────────────────────────────────────────────────────

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
      />
    </svg>
  );
}

function LocationPinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
      />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 1l1.8 3.6L14 5.3l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 1z" />
    </svg>
  );
}

// ── Map-style placeholder ──────────────────────────────────────────────────────

function MapStylePlaceholder({
  lat,
  lng,
  address,
}: {
  lat: number | null;
  lng: number | null;
  address: string | null;
}) {
  return (
    <div className="w-full h-full bg-slate-100 relative flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="absolute w-80 h-80 rounded-full border border-slate-300/60" />
      <div className="absolute w-56 h-56 rounded-full border border-slate-300/60" />
      <div className="absolute w-36 h-36 rounded-full border border-slate-300/60" />
      <div className="relative flex flex-col items-center gap-3 text-center px-6 max-w-sm">
        <div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center ring-4 ring-white/60">
          <LocationPinIcon className="w-7 h-7 text-rose-500" />
        </div>
        {address && (
          <div className="bg-white/95 backdrop-blur-sm rounded-xl px-5 py-3 shadow-md">
            <p className="text-sm font-semibold leading-snug text-foreground">{address}</p>
            {lat != null && lng != null && (
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </p>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-400 font-medium tracking-wide uppercase">
          Map preview
        </p>
      </div>
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────────

/**
 * Hero media section for owner, admin, and public property pages.
 *
 * Hero image priority:
 *   1. Owner-supplied hero photo (is_hero = true)
 *   2. First active owner photo (by sort_order)
 *   3. Vendor fallback images (Mashvisor cover + gallery)
 *   4. Map-style placeholder using lat/lng
 *
 * The "Manage photos" CTA is shown for owner/admin when onManagePhotos is provided.
 */
export function PropertyHeroMedia({
  images,
  lat,
  lng,
  address,
  audience,
  ownerPhotos,
  onManagePhotos,
}: Props) {
  const sorted = activePhotos(ownerPhotos ?? []);
  const heroOwnerUrl = heroPhotoUrl(sorted);

  const coverImage = images?.cover_image_url ?? null;
  const galleryImages = images?.image_urls ?? [];
  const vendorImages = [
    coverImage,
    ...galleryImages.filter((u) => u !== coverImage),
  ].filter(Boolean) as string[];

  // Owner photos shown first; vendor images appended as fallback gallery
  const ownerUrls = sorted.map((p) => p.public_url);
  const allImages: string[] =
    ownerUrls.length > 0
      ? [...ownerUrls, ...vendorImages.filter((u) => !ownerUrls.includes(u))]
      : vendorImages;

  const [activeIdx, setActiveIdx] = useState(0);

  // Clamp activeIdx in case photos are removed
  const safeIdx = Math.min(activeIdx, Math.max(0, allImages.length - 1));
  const heroUrl = allImages[safeIdx] ?? null;
  const hasImages = allImages.length > 0;

  // Track which indexes correspond to owner photos for hero badge
  const ownerPhotoIndexes = new Set(ownerUrls.map((_, i) => i));
  const heroOwnerPhotoIdx = sorted.findIndex((p) => p.is_hero);
  const heroOwnerPhotoInAll =
    heroOwnerPhotoIdx >= 0 ? heroOwnerPhotoIdx : -1;

  const MAX_THUMBS = 5;
  const canManage = !!onManagePhotos;

  return (
    <div className="space-y-2">
      {/* ── Hero slot ─────────────────────────────────────────────────────── */}
      <div
        className="relative w-full rounded-xl overflow-hidden bg-muted"
        style={{ height: 420 }}
      >
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroUrl}
            alt={address ?? "Property photo"}
            className="w-full h-full object-cover"
            loading="eager"
          />
        ) : (
          <MapStylePlaceholder lat={lat} lng={lng} address={address} />
        )}

        {/* Hero badge when owner hero photo is displayed */}
        {hasImages && safeIdx === heroOwnerPhotoInAll && heroOwnerPhotoInAll >= 0 && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 bg-black/60 text-white text-[11px] font-medium px-2 py-0.5 rounded-md backdrop-blur-sm">
            <StarIcon className="w-3 h-3 text-amber-300" />
            Hero photo
          </span>
        )}

        {/* Photo counter badge */}
        {hasImages && allImages.length > 1 && (
          <span className="absolute bottom-3 right-3 bg-black/55 text-white text-xs font-medium px-2.5 py-1 rounded-md backdrop-blur-sm tabular-nums">
            {safeIdx + 1} / {allImages.length}
          </span>
        )}

        {/* Prev / Next arrows */}
        {hasImages && allImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={() =>
                setActiveIdx((i) => (i - 1 + allImages.length) % allImages.length)
              }
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
              aria-label="Previous photo"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setActiveIdx((i) => (i + 1) % allImages.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
              aria-label="Next photo"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* ── Thumbnail rail ────────────────────────────────────────────────── */}
      {(hasImages || canManage) && (
        <div className="flex gap-2 overflow-x-auto pb-1 items-center">
          {hasImages &&
            allImages.slice(0, MAX_THUMBS).map((url, i) => (
              <button
                key={url + i}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`relative flex-none w-[76px] h-[56px] rounded-lg overflow-hidden border-2 transition-all ${
                  safeIdx === i
                    ? "border-foreground shadow-sm"
                    : "border-transparent opacity-65 hover:opacity-100"
                }`}
                aria-label={`View photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
                {/* Star badge on owner hero thumb */}
                {i === heroOwnerPhotoInAll && heroOwnerPhotoInAll >= 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-black/60 rounded p-0.5">
                    <StarIcon className="w-2.5 h-2.5 text-amber-300" />
                  </span>
                )}
              </button>
            ))}

          {allImages.length > MAX_THUMBS && (
            <div className="flex-none w-[76px] h-[56px] rounded-lg border bg-muted flex items-center justify-center">
              <span className="text-xs font-semibold text-muted-foreground">
                +{allImages.length - MAX_THUMBS}
              </span>
            </div>
          )}

          {/* Manage photos tile (owner/admin when enabled) */}
          {canManage && (
            <button
              type="button"
              onClick={onManagePhotos}
              className="flex-none w-[76px] h-[56px] rounded-lg border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center gap-0.5 hover:border-foreground hover:bg-muted/30 transition-colors"
              aria-label="Manage photos"
            >
              <CameraIcon className="w-4 h-4 text-muted-foreground/70" />
              <span className="text-[10px] text-muted-foreground font-medium">
                {sorted.length > 0 ? "Manage" : "Add"}
              </span>
            </button>
          )}
        </div>
      )}

      {/* ── No-image CTA row (owner/admin when no images) ─────────────────── */}
      {!hasImages && canManage && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onManagePhotos}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium bg-background hover:bg-muted transition-colors"
          >
            <CameraIcon className="w-4 h-4" />
            Add photos
          </button>
          <p className="text-xs text-muted-foreground">
            Upload photos to give buyers a better view of your property
          </p>
        </div>
      )}
    </div>
  );
}
