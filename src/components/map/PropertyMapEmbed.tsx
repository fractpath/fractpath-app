"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DiscoveryProperty } from "@/app/api/map/public-properties/route";

const ANNAPOLIS: [number, number] = [-76.4922, 38.9784];
const DEFAULT_ZOOM = 9;

function fmtCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function buildPopupHtml(p: DiscoveryProperty): string {
  const imgHtml = p.hero_photo_url
    ? `<img src="${p.hero_photo_url}" alt="Property" style="width:100%;height:130px;object-fit:cover;display:block;border-radius:6px 6px 0 0;" />`
    : `<div style="width:100%;height:60px;background:#f4f4f5;border-radius:6px 6px 0 0;"></div>`;

  const addr = p.address_line1 ?? "";
  const csz = [p.city, p.state, p.postal_code].filter(Boolean).join(", ");

  const facts = [
    p.beds != null ? `${p.beds} bd` : null,
    p.baths != null ? `${p.baths} ba` : null,
    p.sqft != null ? `${fmtNum(p.sqft)} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const fmvHtml =
    p.latest_verified_fmv != null
      ? `<div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:6px;">${fmtCurrency(p.latest_verified_fmv)}</div>`
      : "";

  return `
    <div style="min-width:210px;max-width:250px;font-family:inherit;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.12);">
      ${imgHtml}
      <div style="padding:10px 12px 12px;">
        <div style="font-size:12px;font-weight:600;color:#18181b;margin-bottom:2px;line-height:1.3;">${addr}</div>
        <div style="font-size:11px;color:#71717a;margin-bottom:4px;">${csz}</div>
        ${facts ? `<div style="font-size:11px;color:#52525b;margin-bottom:4px;">${facts}</div>` : ""}
        ${fmvHtml}
        <a href="/verified-properties/${p.id}" style="display:block;text-align:center;background:#18181b;color:#fff;border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;">View Property</a>
      </div>
    </div>
  `;
}

type Props = {
  properties: DiscoveryProperty[];
  token: string;
  height?: number;
  onMarkerClick?: (id: string) => void;
  highlightedId?: string | null;
  flyToId?: string | null;
};

export function PropertyMapEmbed({
  properties,
  token,
  height = 420,
  onMarkerClick,
  highlightedId,
  flyToId,
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
              tiles: [
                `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${token}`,
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
      });

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

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    async function sync() {
      const ml = (await import("maplibre-gl")).default;
      const map = mapRef.current;
      if (!map) return;

      const currentIds = new Set(properties.map((p) => p.id));

      for (const [id, marker] of markersRef.current.entries()) {
        if (!currentIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }

      for (const property of properties) {
        if (markersRef.current.has(property.id)) continue;

        const el = document.createElement("div");
        el.style.cssText =
          "width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#18181b;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;transition:transform 0.15s;";

        const popup = new ml.Popup({
          offset: 20,
          maxWidth: "260px",
          closeButton: true,
          closeOnClick: false,
        }).setHTML(buildPopupHtml(property));

        const marker = new ml.Marker({ element: el, anchor: "bottom-left" })
          .setLngLat([property.longitude, property.latitude])
          .setPopup(popup)
          .addTo(map);

        el.addEventListener("click", () => {
          popup.addTo(map);
          onMarkerClickRef.current?.(property.id);
        });

        markersRef.current.set(property.id, marker);
      }

      if (!hasFitRef.current && properties.length > 0) {
        hasFitRef.current = true;
        if (properties.length === 1) {
          map.flyTo({
            center: [properties[0].longitude, properties[0].latitude],
            zoom: 13,
          });
        } else {
          const lngs = properties.map((p) => p.longitude);
          const lats = properties.map((p) => p.latitude);
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 80, maxZoom: 14 },
          );
        }
      }
    }

    sync();
  }, [properties, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    for (const [id, marker] of markersRef.current.entries()) {
      const el = marker.getElement();
      if (!el) continue;
      if (id === highlightedId) {
        el.style.background = "#2563eb";
        el.style.transform = "rotate(-45deg) scale(1.2)";
      } else {
        el.style.background = "#18181b";
        el.style.transform = "rotate(-45deg) scale(1)";
      }
    }
  }, [highlightedId, mapReady]);

  useEffect(() => {
    if (!mapReady || !flyToId || !mapRef.current) return;
    const property = properties.find((p) => p.id === flyToId);
    if (!property) return;
    mapRef.current.flyTo({
      center: [property.longitude, property.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 13),
      duration: 600,
    });
    const marker = markersRef.current.get(flyToId);
    if (marker) {
      marker.getPopup()?.addTo(mapRef.current);
    }
  }, [flyToId, mapReady, properties]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

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
    </div>
  );
}
