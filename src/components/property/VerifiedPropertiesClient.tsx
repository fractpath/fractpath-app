"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import type { DiscoveryProperty } from "@/app/api/map/public-properties/route";
import { PropertyMapEmbed } from "@/components/map/PropertyMapEmbed";

type SortKey = "newest" | "value_desc" | "value_asc";

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

function PropertyCard({
  property,
  isHighlighted,
  onClick,
  cardRef,
}: {
  property: DiscoveryProperty;
  isHighlighted: boolean;
  onClick: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const addr = property.address_line1 ?? "";
  const csz = [property.city, property.state, property.postal_code]
    .filter(Boolean)
    .join(", ");
  const typeLabel = property.property_type ?? null;

  const facts = [
    property.beds != null ? `${property.beds} bd` : null,
    property.baths != null ? `${property.baths} ba` : null,
    property.sqft != null ? `${fmtNum(property.sqft)} sqft` : null,
    property.year_built != null ? `Built ${property.year_built}` : null,
  ].filter(Boolean);

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
      {/* Thumbnail */}
      <div className="relative h-44 bg-muted/40 flex-shrink-0">
        {property.hero_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.hero_photo_url}
            alt={`Property at ${addr || "verified property"}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <svg
              className="w-10 h-10 text-muted-foreground/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            Verified
          </span>
        </div>

        <div>
          <div className="text-sm font-semibold leading-snug">{addr}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {csz}
            {typeLabel && csz ? ` · ${typeLabel}` : typeLabel ?? ""}
          </div>
        </div>

        {facts.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        )}

        {property.latest_verified_fmv != null && (
          <div>
            <span className="text-base font-bold tabular-nums text-foreground">
              {fmtCurrency(property.latest_verified_fmv)}
            </span>
            <span className="ml-1.5 text-[11px] text-muted-foreground">Est. value</span>
          </div>
        )}

        <div className="mt-auto pt-1">
          <Link
            href={`/verified-properties/${property.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block w-full rounded-md bg-foreground px-3 py-2 text-center text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            View Property
          </Link>
        </div>
      </div>

      <div className="px-4 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground">
        Not a public listing or offer of sale. Subject to review.
      </div>
    </div>
  );
}

export function VerifiedPropertiesClient({
  properties,
  token,
}: {
  properties: DiscoveryProperty[];
  token: string;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [flyToId, setFlyToId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const filtered = useMemo(() => {
    let result = [...properties];

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
        result.sort((a, b) => (b.latest_verified_fmv ?? -1) - (a.latest_verified_fmv ?? -1));
        break;
      case "value_asc":
        result.sort((a, b) => {
          if (a.latest_verified_fmv == null && b.latest_verified_fmv == null) return 0;
          if (a.latest_verified_fmv == null) return 1;
          if (b.latest_verified_fmv == null) return -1;
          return a.latest_verified_fmv - b.latest_verified_fmv;
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
  }, [properties, search, sort]);

  const mapProperties = useMemo(
    () => filtered.filter((p) => p.latitude != null && p.longitude != null),
    [filtered],
  );

  const handleMarkerClick = useCallback((id: string) => {
    setHighlightedId(id);
    const card = cardRefs.current.get(id);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  const handleCardClick = useCallback((id: string) => {
    setHighlightedId(id);
    setFlyToId(id);
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
        </span>
      </div>

      {/* Map */}
      {token && mapProperties.length > 0 && (
        <PropertyMapEmbed
          properties={mapProperties}
          token={token}
          height={380}
          onMarkerClick={handleMarkerClick}
          highlightedId={highlightedId}
          flyToId={flyToId}
        />
      )}

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {search
            ? `No verified properties match "${search}". Try a different city or ZIP.`
            : "No verified properties are currently available. Check back later."}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              isHighlighted={highlightedId === p.id}
              onClick={() => handleCardClick(p.id)}
              cardRef={setCardRef(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
