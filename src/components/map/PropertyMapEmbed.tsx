"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DiscoveryProperty } from "@/app/api/map/public-properties/route";
import { PropertyDiscoveryCard } from "@/components/property/PropertyDiscoveryCard";

const ANNAPOLIS: [number, number] = [-76.4922, 38.9784];
const DEFAULT_ZOOM = 9;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Abbreviated currency for marker labels.
 *   $902,000 → $902K
 *   $700,000 → $700K
 *   $1,050,000 → $1.05M
 */
function fmtAbbrev(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const s = m % 1 === 0 ? `${m}` : m.toFixed(2).replace(/\.?0+$/, "");
    return `$${s}M`;
  }
  return `$${Math.round(n / 1000)}K`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  properties: DiscoveryProperty[];
  token: string;
  height?: number;
  onMarkerClick?: (id: string) => void;
  highlightedId?: string | null;
  flyToId?: string | null;
  /** Property shown in the React overlay card (replaces HTML popup). */
  selectedProperty?: DiscoveryProperty | null;
  overlayPhotos?: string[] | null;
  overlayPhotosLoading?: boolean;
  onLoadOverlayPhotos?: () => void;
  onOverlayClose?: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PropertyMapEmbed({
  properties,
  token,
  height = 420,
  onMarkerClick,
  highlightedId,
  flyToId,
  selectedProperty,
  overlayPhotos,
  overlayPhotosLoading,
  onLoadOverlayPhotos,
  onOverlayClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const hasFitRef = useRef(false);

  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  // ── Map initialization ─────────────────────────────────────────────────────

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    let cancelled = false;

    async function init() {
      const ml = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;

      const map = new ml.Map({
        container: containerRef.current,
        style: {
          version: 8,
          glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
          sources: {
            "mapbox-raster": {
              type: "raster",
              // /512/ is the required tileSize segment for the Mapbox Styles API.
              // Omitting it causes the CDN to return 403 for 512px tile requests.
              tiles: [
                `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=${token}`,
              ],
              tileSize: 512,
              attribution: "© Mapbox © OpenStreetMap",
            },
          },
          layers: [
            {
              id: "mapbox-raster",
              type: "raster",
              source: "mapbox-raster",
            },
          ],
        },
        center: ANNAPOLIS,
        zoom: DEFAULT_ZOOM,
        scrollZoom: false,
      });

      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");

      mapRef.current = map;

      map.on("load", () => {
        if (!cancelled) setMapReady(true);
      });
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
      hasFitRef.current = false;
      setMapReady(false);
    };
  }, [token]);

  // ── Marker sync ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    async function sync() {
      const ml = (await import("maplibre-gl")).default;
      const map = mapRef.current;
      if (!map) return;

      const currentIds = new Set(properties.map((p) => p.id));

      // Remove stale markers
      for (const [id, marker] of markersRef.current.entries()) {
        if (!currentIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }

      // Add new markers
      for (const property of properties) {
        if (markersRef.current.has(property.id)) continue;

        // Wrapper — anchor: bottom-left aligns this element so the diamond tip
        // points at the coordinate and the label sits above it.
        const wrapper = document.createElement("div");
        wrapper.style.cssText =
          "cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:3px;";

        // Abbreviated est. value label pill (only if AVM is available)
        if (property.rentcast_avm != null) {
          const label = document.createElement("div");
          label.className = "fp-marker-label";
          label.textContent = fmtAbbrev(property.rentcast_avm);
          label.style.cssText =
            "background:rgba(0,0,0,0.82);color:#fff;font-size:10px;font-weight:700;" +
            "font-family:ui-sans-serif,system-ui,sans-serif;padding:2px 6px;" +
            "border-radius:4px;white-space:nowrap;line-height:1.5;pointer-events:none;";
          wrapper.appendChild(label);
        }

        // Diamond pin
        const diamond = document.createElement("div");
        diamond.className = "fp-marker-diamond";
        diamond.style.cssText =
          "width:22px;height:22px;border-radius:50% 50% 50% 0;" +
          "transform:rotate(-45deg);background:#18181b;" +
          "border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);" +
          "transition:transform 0.15s,background 0.15s;";
        wrapper.appendChild(diamond);

        const marker = new ml.Marker({ element: wrapper, anchor: "bottom-left" })
          .setLngLat([property.longitude!, property.latitude!])
          .addTo(map);

        wrapper.addEventListener("click", () => {
          onMarkerClickRef.current?.(property.id);
        });

        markersRef.current.set(property.id, marker);
      }

      // Fit bounds once on first render — no animation to avoid unnecessary tile loads on mount
      if (!hasFitRef.current && properties.length > 0) {
        hasFitRef.current = true;
        if (properties.length === 1) {
          map.jumpTo({
            center: [properties[0].longitude!, properties[0].latitude!],
            zoom: 13,
          });
        } else {
          const lngs = properties.map((p) => p.longitude!);
          const lats = properties.map((p) => p.latitude!);
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 80, maxZoom: 14, animate: false },
          );
        }
      }
    }

    sync();
  }, [properties, mapReady]);

  // ── Marker highlight ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady) return;
    for (const [id, marker] of markersRef.current.entries()) {
      const el = marker.getElement();
      if (!el) continue;
      const diamond = el.querySelector(".fp-marker-diamond") as HTMLElement | null;
      if (!diamond) continue;
      if (id === highlightedId) {
        diamond.style.background = "#2563eb";
        diamond.style.transform = "rotate(-45deg) scale(1.25)";
      } else {
        diamond.style.background = "#18181b";
        diamond.style.transform = "rotate(-45deg) scale(1)";
      }
    }
  }, [highlightedId, mapReady]);

  // ── Fly to ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !flyToId || !mapRef.current) return;
    const property = properties.find((p) => p.id === flyToId);
    if (!property) return;
    mapRef.current.flyTo({
      center: [property.longitude!, property.latitude!],
      zoom: Math.max(mapRef.current.getZoom(), 13),
      duration: 600,
    });
  }, [flyToId, mapReady, properties]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative rounded-xl overflow-hidden border bg-muted"
      style={{ height }}
      onMouseDown={handleMouseDown}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/70 pointer-events-none">
          <span className="text-sm text-muted-foreground">Loading map…</span>
        </div>
      )}

      {/* React overlay card — replaces HTML popup.
          Positioned top-left, max 272px wide, scrolls if content overflows. */}
      {mapReady && selectedProperty && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            width: 272,
            maxHeight: "calc(100% - 24px)",
            overflowY: "auto",
            zIndex: 20,
            borderRadius: 12,
            // Prevent map drag/zoom from firing through the card
            pointerEvents: "auto",
          }}
          // Stop map events leaking through the overlay
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <PropertyDiscoveryCard
            property={selectedProperty}
            variant="overlay"
            photos={overlayPhotos ?? null}
            photosLoading={overlayPhotosLoading ?? false}
            onLoadPhotos={onLoadOverlayPhotos ?? (() => {})}
            onClose={onOverlayClose}
          />
        </div>
      )}
    </div>
  );
}
