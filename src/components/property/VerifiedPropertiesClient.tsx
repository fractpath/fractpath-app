"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import type { DiscoveryProperty } from "@/app/api/map/public-properties/route";
import { PropertyMapEmbed } from "@/components/map/PropertyMapEmbed";
import { PropertyDiscoveryCard } from "@/components/property/PropertyDiscoveryCard";

type SortKey = "newest" | "value_desc" | "value_asc";

export function VerifiedPropertiesClient({
  properties,
  token,
}: {
  properties: DiscoveryProperty[];
  token: string;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filterVerified, setFilterVerified] = useState(false);
  const [filterApproved, setFilterApproved] = useState(false);
  // highlightedId: which property has the blue ring on its page card + highlighted marker
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // flyToId: triggers map.flyTo for a property (set by card click)
  const [flyToId, setFlyToId] = useState<string | null>(null);
  // selectedId: which property's overlay card is open in the map (set by marker click)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── On-demand photo cache ──────────────────────────────────────────────────
  // photoCacheRef: mutation guard (avoids stale closure in loadPhotos)
  // photoCache: React state driving re-renders when new photos arrive
  const photoCacheRef = useRef<Map<string, string[]>>(new Map());
  const [photoCache, setPhotoCache] = useState<Map<string, string[]>>(new Map());

  const loadingRef = useRef<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const loadPhotos = useCallback(async (propertyId: string) => {
    if (photoCacheRef.current.has(propertyId) || loadingRef.current.has(propertyId)) return;

    loadingRef.current.add(propertyId);
    setLoadingIds((prev) => new Set([...prev, propertyId]));

    try {
      const res = await fetch(`/api/map/property-photos/${propertyId}`);
      if (res.ok) {
        const data = await res.json();
        const urls: string[] = Array.isArray(data.photos) ? data.photos : [];
        photoCacheRef.current.set(propertyId, urls);
        setPhotoCache((prev) => new Map([...prev, [propertyId, urls]]));
      }
    } finally {
      loadingRef.current.delete(propertyId);
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(propertyId);
        return next;
      });
    }
  }, []);

  // ── Filter / sort ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = [...properties];

    if (filterVerified) {
      result = result.filter((p) => p.status === "verified");
    }

    if (filterApproved) {
      result = result.filter((p) => p.open_to_proposals === true);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.city?.toLowerCase().includes(q) ||
          p.postal_code?.toLowerCase().includes(q) ||
          p.address_line1?.toLowerCase().includes(q) ||
          p.state?.toLowerCase().includes(q),
      );
    }

    switch (sort) {
      case "value_desc":
        result.sort((a, b) => (b.rentcast_avm ?? -1) - (a.rentcast_avm ?? -1));
        break;
      case "value_asc":
        result.sort((a, b) => {
          if (a.rentcast_avm == null && b.rentcast_avm == null) return 0;
          if (a.rentcast_avm == null) return 1;
          if (b.rentcast_avm == null) return -1;
          return a.rentcast_avm - b.rentcast_avm;
        });
        break;
      default:
        result.sort((a, b) => {
          if (!a.verified_at && !b.verified_at) return 0;
          if (!a.verified_at) return 1;
          if (!b.verified_at) return -1;
          return new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime();
        });
    }

    return result;
  }, [properties, search, sort, filterVerified, filterApproved]);

  const mapProperties = useMemo(
    () => filtered.filter((p) => p.latitude != null && p.longitude != null),
    [filtered],
  );

  const selectedProperty = useMemo(
    () => (selectedId ? (properties.find((p) => p.id === selectedId) ?? null) : null),
    [selectedId, properties],
  );

  // ── Interaction handlers ───────────────────────────────────────────────────

  // Marker click: open overlay, highlight marker, scroll page card into view
  const handleMarkerClick = useCallback(
    (id: string) => {
      setSelectedId(id);
      setHighlightedId(id);
      const card = cardRefs.current.get(id);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    },
    [],
  );

  // Card click: fly map to marker, highlight; close any open overlay
  const handleCardClick = useCallback((id: string) => {
    setSelectedId(null);
    setHighlightedId(id);
    setFlyToId(id);
  }, []);

  const handleOverlayClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const setCardRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) {
        cardRefs.current.set(id, el);
      } else {
        cardRefs.current.delete(id);
      }
    },
    [],
  );

  const activeFilterCount = (filterVerified ? 1 : 0) + (filterApproved ? 1 : 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search city or ZIP…"
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Filter toggles */}
        <button
          type="button"
          onClick={() => setFilterVerified((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            filterVerified
              ? "bg-foreground text-background border-foreground"
              : "bg-background text-foreground hover:bg-muted/50"
          }`}
          aria-pressed={filterVerified}
        >
          {filterVerified && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
              <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
            </svg>
          )}
          Verified
        </button>

        <button
          type="button"
          onClick={() => setFilterApproved((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            filterApproved
              ? "bg-foreground text-background border-foreground"
              : "bg-background text-foreground hover:bg-muted/50"
          }`}
          aria-pressed={filterApproved}
        >
          {filterApproved && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
              <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
            </svg>
          )}
          Approved for participation
        </button>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="text-sm border rounded-md bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="newest">Newest first</option>
          <option value="value_desc">Highest value first</option>
          <option value="value_asc">Lowest value first</option>
        </select>

        <span className="text-sm text-muted-foreground">
          {filtered.length === properties.length
            ? `${properties.length} propert${properties.length === 1 ? "y" : "ies"}`
            : `${filtered.length} of ${properties.length}`}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => { setFilterVerified(false); setFilterApproved(false); }}
              className="ml-2 text-xs underline underline-offset-2 hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </span>
      </div>

      {/* Map with React overlay card */}
      {token && mapProperties.length > 0 && (
        <PropertyMapEmbed
          properties={mapProperties}
          token={token}
          height={400}
          onMarkerClick={handleMarkerClick}
          highlightedId={highlightedId}
          flyToId={flyToId}
          selectedProperty={selectedProperty}
          overlayPhotos={selectedId ? (photoCache.get(selectedId) ?? null) : null}
          overlayPhotosLoading={selectedId ? loadingIds.has(selectedId) : false}
          onLoadOverlayPhotos={selectedId ? () => loadPhotos(selectedId) : undefined}
          onOverlayClose={handleOverlayClose}
        />
      )}

      {/* Card grid — CTA tile always first, then filtered property cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* BYO-property CTA tile */}
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm flex flex-col">
          {/* Hero area */}
          <div
            className="flex items-center justify-center bg-muted/60 flex-shrink-0"
            style={{ height: 176 }}
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-12 h-12 text-muted-foreground/40"
              aria-hidden="true"
            >
              <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </div>
          {/* Body */}
          <div className="p-4 flex flex-col gap-2.5 flex-1">
            <p className="text-sm font-semibold leading-snug">Have a property in mind?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Start a deal by adding the property address. FractPath can help identify and
              reach out to the homeowner.
            </p>
            <div className="mt-auto pt-1">
              <Link
                href="/deal/new"
                className="block w-full rounded-md bg-foreground px-3 py-2 text-center text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                Start a deal
              </Link>
            </div>
          </div>
        </div>

        {/* Property cards */}
        {filtered.map((p) => (
          <PropertyDiscoveryCard
            key={p.id}
            property={p}
            variant="page"
            photos={photoCache.get(p.id) ?? null}
            photosLoading={loadingIds.has(p.id)}
            onLoadPhotos={() => loadPhotos(p.id)}
            isHighlighted={highlightedId === p.id}
            onClick={() => handleCardClick(p.id)}
            cardRef={setCardRef(p.id)}
          />
        ))}
      </div>

      {/* No-results message when filters/search produce zero properties */}
      {filtered.length === 0 && (search || activeFilterCount > 0) && (
        <p className="text-sm text-muted-foreground text-center">
          No properties match your current filters.
        </p>
      )}
    </div>
  );
}
