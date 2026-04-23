"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DiscoveryProperty } from "@/app/api/map/public-properties/route";

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconChevronLeft({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconChevronRight({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function IconClose({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function IconHome({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        border: "2.5px solid rgba(255,255,255,0.3)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "fp-spin 0.7s linear infinite",
      }}
    />
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

export type PropertyDiscoveryCardVariant = "page" | "overlay";

type Props = {
  property: DiscoveryProperty;
  variant?: PropertyDiscoveryCardVariant;
  /** Loaded full photo array — null means not yet fetched. */
  photos: string[] | null;
  photosLoading: boolean;
  onLoadPhotos: () => void;
  isHighlighted?: boolean;
  onClick?: () => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  onClose?: () => void;
};

// ── Component ────────────────────────────────────────────────────────────────

export function PropertyDiscoveryCard({
  property,
  variant = "page",
  photos,
  photosLoading,
  onLoadPhotos,
  isHighlighted = false,
  onClick,
  cardRef,
  onClose,
}: Props) {
  const [photoIndex, setPhotoIndex] = useState(0);

  // Reset photo index when property changes (e.g. overlay switches to a new property).
  useEffect(() => {
    setPhotoIndex(0);
  }, [property.id]);

  // Cap index if loaded photo array is shorter than current index.
  useEffect(() => {
    if (photos != null && photoIndex >= photos.length && photos.length > 0) {
      setPhotoIndex(photos.length - 1);
    }
  }, [photos, photoIndex]);

  // Effective photos for the carousel.
  // Before on-demand load: use hero_photo_url as a single-image placeholder.
  const effectivePhotos: string[] =
    photos ?? (property.hero_photo_url ? [property.hero_photo_url] : []);

  const currentPhoto = effectivePhotos[photoIndex] ?? null;

  // Show arrows when there are (or will be) multiple photos.
  const totalKnown = photos != null ? photos.length : (property.photo_count ?? 0);
  const showArrows = totalKnown > 1 || (photos == null && (property.photo_count ?? 0) > 1);
  const canPrev = photoIndex > 0;
  // Can go next if there are more loaded photos, or more photos to load.
  const canNext =
    photos != null
      ? photoIndex < photos.length - 1
      : (property.photo_count ?? 0) > 1;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (photoIndex > 0) setPhotoIndex((i) => i - 1);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (photos == null) {
      // First click on next — trigger load; index stays at 0 until photos arrive.
      onLoadPhotos();
      return;
    }
    if (photoIndex < photos.length - 1) setPhotoIndex((i) => i + 1);
  };

  const addr = property.address_line1 ?? "";
  const csz = [property.city, property.state, property.postal_code].filter(Boolean).join(", ");
  const typeLabel = property.property_type ?? null;
  const facts = [
    property.beds != null ? `${property.beds} bd` : null,
    property.baths != null ? `${property.baths} ba` : null,
    property.sqft != null ? `${fmtNum(property.sqft)} sqft` : null,
    property.year_built != null ? `Built ${property.year_built}` : null,
  ].filter(Boolean);

  // ── Shared: Hero carousel ──────────────────────────────────────────────────

  const heroHeight = variant === "overlay" ? 160 : 176;

  const HeroArea = (
    <div
      style={{
        position: "relative",
        height: heroHeight,
        flexShrink: 0,
        background: "#f4f4f5",
        overflow: "hidden",
      }}
    >
      {currentPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={currentPhoto}
          src={currentPhoto}
          alt={`Property at ${addr || "verified property"}`}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          loading="lazy"
        />
      ) : (
        <div
          style={{
            display: "flex",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(0,0,0,0.2)",
          }}
        >
          <IconHome />
        </div>
      )}

      {/* Loading spinner overlay */}
      {photosLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* inline keyframes via a style tag trick — works without external CSS */}
          <style>{`@keyframes fp-spin{to{transform:rotate(360deg)}}`}</style>
          <LoadingSpinner />
        </div>
      )}

      {/* Prev arrow */}
      {showArrows && canPrev && (
        <button
          onClick={handlePrev}
          aria-label="Previous photo"
          style={{
            position: "absolute",
            left: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            border: "none",
            borderRadius: "50%",
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 5,
            padding: 0,
          }}
        >
          <IconChevronLeft size={15} />
        </button>
      )}

      {/* Next arrow */}
      {showArrows && canNext && (
        <button
          onClick={handleNext}
          aria-label="Next photo"
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            border: "none",
            borderRadius: "50%",
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 5,
            padding: 0,
          }}
        >
          <IconChevronRight size={15} />
        </button>
      )}

      {/* Photo counter badge (shown once photos are loaded and > 1) */}
      {photos != null && photos.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 6,
            right: 6,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 4,
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {photoIndex + 1} / {photos.length}
        </div>
      )}

      {/* Close button for overlay variant */}
      {variant === "overlay" && onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            border: "none",
            borderRadius: "50%",
            width: 26,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 10,
            padding: 0,
          }}
        >
          <IconClose size={13} />
        </button>
      )}
    </div>
  );

  // ── Shared: Card body ──────────────────────────────────────────────────────

  const isVerified = property.status === "verified";

  const verifiedBadge = isVerified ? (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 9999,
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 2,
        paddingBottom: 2,
        fontSize: 11,
        fontWeight: 600,
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      }}
    >
      <svg width={10} height={10} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          clipRule="evenodd"
        />
      </svg>
      Verified
    </span>
  ) : null;

  const bodyPad = variant === "overlay" ? "10px 12px 12px" : undefined;

  const CardBody = (
    <div
      style={
        variant === "overlay"
          ? { padding: bodyPad, display: "flex", flexDirection: "column", gap: 8 }
          : undefined
      }
      className={variant === "page" ? "p-4 flex flex-col gap-2.5 flex-1" : undefined}
    >
      {verifiedBadge && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {verifiedBadge}
        </div>
      )}

      <div>
        <div
          style={
            variant === "overlay"
              ? { fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: "#18181b" }
              : undefined
          }
          className={variant === "page" ? "text-sm font-semibold leading-snug" : undefined}
        >
          {addr}
        </div>
        <div
          style={
            variant === "overlay"
              ? { fontSize: 11, color: "#71717a", marginTop: 2 }
              : undefined
          }
          className={variant === "page" ? "text-xs text-muted-foreground mt-0.5" : undefined}
        >
          {csz}
          {typeLabel && csz ? ` · ${typeLabel}` : typeLabel ?? ""}
        </div>
      </div>

      {facts.length > 0 && (
        <div
          style={
            variant === "overlay"
              ? { display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, color: "#52525b" }
              : undefined
          }
          className={
            variant === "page"
              ? "flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
              : undefined
          }
        >
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      )}

      {property.rentcast_avm != null && (
        <div>
          <span
            style={
              variant === "overlay"
                ? { fontSize: 15, fontWeight: 700, color: "#18181b" }
                : undefined
            }
            className={
              variant === "page" ? "text-base font-bold tabular-nums text-foreground" : undefined
            }
          >
            {fmtCurrency(property.rentcast_avm)}
          </span>
          <span
            style={variant === "overlay" ? { marginLeft: 6, fontSize: 10, color: "#71717a" } : undefined}
            className={variant === "page" ? "ml-1.5 text-[11px] text-muted-foreground" : undefined}
          >
            Est. value
          </span>
        </div>
      )}

      {variant === "overlay" ? (
        <a
          href={`/verified-properties/${property.id}`}
          style={{
            display: "block",
            textAlign: "center",
            background: "#18181b",
            color: "#fff",
            borderRadius: 6,
            padding: "6px 0",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            marginTop: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          View Property
        </a>
      ) : (
        <div className="mt-auto pt-1">
          <Link
            href={`/verified-properties/${property.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block w-full rounded-md bg-foreground px-3 py-2 text-center text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            View Property
          </Link>
        </div>
      )}
    </div>
  );

  // ── Disclaimer ─────────────────────────────────────────────────────────────

  const Disclaimer =
    variant === "page" ? (
      <div className="px-4 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground">
        Not a public listing or offer of sale. Subject to review.
      </div>
    ) : (
      <div
        style={{
          padding: "5px 12px",
          borderTop: "1px solid #e4e4e7",
          fontSize: 9,
          color: "#a1a1aa",
        }}
      >
        Not a public listing or offer of sale. Subject to review.
      </div>
    );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (variant === "overlay") {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {HeroArea}
        {CardBody}
        {Disclaimer}
      </div>
    );
  }

  // page variant
  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={[
        "rounded-xl border bg-card overflow-hidden shadow-sm flex flex-col cursor-pointer transition-all duration-150",
        isHighlighted
          ? "ring-2 ring-blue-500 shadow-md"
          : "hover:shadow-md hover:border-border/80",
      ].join(" ")}
    >
      {HeroArea}
      {CardBody}
      {Disclaimer}
    </div>
  );
}
