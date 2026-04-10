"use client";

import { useState } from "react";
import type { MashvisorImagesPayload } from "@/lib/mashvisor/types";

type Audience = "owner" | "buyer" | "admin";

type Props = {
  images: MashvisorImagesPayload | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  audience: Audience;
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

// ── Map-style placeholder ──────────────────────────────────────────────────────
// Renders when no photos are available.
// Structured so a real map library (Mapbox, Leaflet, etc.) can replace this
// inner content later without changing the outer hero container.

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
      {/* Subtle grid — gives a map-tile feel */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* Concentric rings — topographic accent */}
      <div className="absolute w-80 h-80 rounded-full border border-slate-300/60" />
      <div className="absolute w-56 h-56 rounded-full border border-slate-300/60" />
      <div className="absolute w-36 h-36 rounded-full border border-slate-300/60" />

      {/* Center pin + address card */}
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

// ── Add Photos placeholder CTA ─────────────────────────────────────────────────

function AddPhotosCta() {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-not-allowed opacity-70"
        title="Photo upload coming soon"
        disabled
        aria-disabled="true"
      >
        <CameraIcon className="w-4 h-4" />
        Add photos
      </button>
      <p className="text-xs text-muted-foreground">
        Upload photos to give buyers a better view of your property
      </p>
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────────

/**
 * Hero media section for owner and public property pages.
 *
 * Priority order for hero image:
 *   1. Owner-supplied photos (future — not yet implemented)
 *   2. Vendor fallback images (Mashvisor cover + gallery)
 *   3. Map-style placeholder using lat/lng
 *
 * The "Add photos" CTA is shown only for the owner audience.
 * It is currently disabled — the upload flow is scaffolded for the next task.
 */
export function PropertyHeroMedia({ images, lat, lng, address, audience }: Props) {
  const coverImage = images?.cover_image_url ?? null;
  const galleryImages = images?.image_urls ?? [];

  // Deduplicate: cover first, then gallery images that differ from cover
  const allImages = [
    coverImage,
    ...galleryImages.filter((u) => u !== coverImage),
  ].filter(Boolean) as string[];

  const [activeIdx, setActiveIdx] = useState(0);

  const heroUrl = allImages[activeIdx] ?? null;
  const hasImages = allImages.length > 0;
  const MAX_THUMBS = 5;

  return (
    <div className="space-y-2">
      {/* ── Hero slot ─────────────────────────────────────────────────────── */}
      <div className="relative w-full rounded-xl overflow-hidden bg-muted" style={{ height: 420 }}>
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

        {/* Photo counter badge */}
        {hasImages && allImages.length > 1 && (
          <span className="absolute bottom-3 right-3 bg-black/55 text-white text-xs font-medium px-2.5 py-1 rounded-md backdrop-blur-sm tabular-nums">
            {activeIdx + 1} / {allImages.length}
          </span>
        )}

        {/* Prev / Next arrows (when multiple images) */}
        {hasImages && allImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActiveIdx((i) => (i - 1 + allImages.length) % allImages.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
              aria-label="Previous photo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setActiveIdx((i) => (i + 1) % allImages.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
              aria-label="Next photo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* ── Thumbnail rail ────────────────────────────────────────────────── */}
      {hasImages && (
        <div className="flex gap-2 overflow-x-auto pb-1 items-center">
          {allImages.slice(0, MAX_THUMBS).map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`flex-none w-[76px] h-[56px] rounded-lg overflow-hidden border-2 transition-all ${
                activeIdx === i
                  ? "border-foreground shadow-sm"
                  : "border-transparent opacity-65 hover:opacity-100"
              }`}
              aria-label={`View photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}

          {/* "+N more" tile when gallery overflows */}
          {allImages.length > MAX_THUMBS && (
            <div className="flex-none w-[76px] h-[56px] rounded-lg border bg-muted flex items-center justify-center">
              <span className="text-xs font-semibold text-muted-foreground">
                +{allImages.length - MAX_THUMBS}
              </span>
            </div>
          )}

          {/* Owner-only: Add photos tile at end of thumbnail rail */}
          {audience === "owner" && (
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Photo upload coming soon"
              className="flex-none w-[76px] h-[56px] rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-0.5 hover:border-muted-foreground/60 transition-colors cursor-not-allowed"
            >
              <CameraIcon className="w-4 h-4 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground/60 font-medium">Add</span>
            </button>
          )}
        </div>
      )}

      {/* ── No-image CTA row (owner only) ─────────────────────────────────── */}
      {!hasImages && audience === "owner" && <AddPhotosCta />}
    </div>
  );
}
