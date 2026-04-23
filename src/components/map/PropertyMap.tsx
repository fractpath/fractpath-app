"use client";

import { useEffect, useRef, useState } from "react";
import type { MapProperty } from "@/app/api/map/public-properties/route";

const ANNAPOLIS_CENTER: [number, number] = [-76.4922, 38.9784];
const DEFAULT_ZOOM = 8;

type Status = "idle" | "loading" | "error" | "empty" | "ready";

function formatAddress(p: MapProperty): string {
  const parts: string[] = [];
  if (p.address_line1) parts.push(p.address_line1);
  const csz: string[] = [];
  if (p.city) csz.push(p.city);
  if (p.state) csz.push(p.state);
  if (p.postal_code) csz.push(p.postal_code);
  if (csz.length) parts.push(csz.join(", "));
  return parts.join("\n");
}

function buildPopupHtml(p: MapProperty): string {
  const address = formatAddress(p);
  const imgHtml = p.hero_photo_url
    ? `<img src="${p.hero_photo_url}" alt="Property photo" style="width:100%;height:140px;object-fit:cover;display:block;border-radius:6px 6px 0 0;" />`
    : `<div style="width:100%;height:90px;background:#f4f4f5;display:flex;align-items:center;justify-content:center;border-radius:6px 6px 0 0;"><svg width="32" height="32" fill="none" stroke="#a1a1aa" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg></div>`;

  const addressHtml = address
    .split("\n")
    .map((line) => `<div>${line}</div>`)
    .join("");

  return `
    <div style="min-width:220px;max-width:260px;font-family:inherit;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.12);">
      ${imgHtml}
      <div style="padding:10px 12px 12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="#166534" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/></svg>
            Verified
          </span>
        </div>
        <div style="font-size:13px;font-weight:600;line-height:1.4;color:#18181b;margin-bottom:10px;">${addressHtml}</div>
        <a href="/verified-properties/${p.id}" style="display:block;width:100%;text-align:center;background:#18181b;color:#fff;border-radius:6px;padding:6px 0;font-size:12px;font-weight:600;text-decoration:none;">
          View Property
        </a>
      </div>
    </div>
  `;
}

export function PropertyMap({ token }: { token: string }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    let cancelled = false;

    async function init() {
      setStatus("loading");

      const maplibregl = (await import("maplibre-gl")).default;

      if (cancelled || !mapContainer.current) return;

      // Use Mapbox raster tiles as a plain HTTP source — no mapbox:// protocol issues.
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          glyphs: `https://fonts.openmaptiles.org/{fontstack}/{range}.pbf`,
          sources: {
            "mapbox-raster": {
              type: "raster",
              tiles: [
                // /512/ is required by the Mapbox Styles API for 512px tile requests.
                `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=${token}`,
              ],
              tileSize: 512,
              attribution:
                '© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
        center: ANNAPOLIS_CENTER,
        zoom: DEFAULT_ZOOM,
      });

      mapRef.current = map;

      map.on("load", async () => {
        if (cancelled) return;

        let properties: MapProperty[] = [];
        try {
          const res = await fetch("/api/map/public-properties");
          if (!res.ok) throw new Error("API error");
          properties = await res.json();
        } catch {
          setStatus("error");
          return;
        }

        if (cancelled) return;

        if (properties.length === 0) {
          setStatus("empty");
          return;
        }

        for (const property of properties) {
          const markerEl = document.createElement("div");
          markerEl.className = "map-marker";
          markerEl.style.cssText = [
            "width:32px",
            "height:32px",
            "border-radius:50% 50% 50% 0",
            "transform:rotate(-45deg)",
            "background:#18181b",
            "border:2px solid #fff",
            "box-shadow:0 2px 8px rgba(0,0,0,0.35)",
            "cursor:pointer",
          ].join(";");

          const popup = new maplibregl.Popup({
            offset: 20,
            maxWidth: "280px",
            closeButton: true,
            closeOnClick: false,
          }).setHTML(buildPopupHtml(property));

          new maplibregl.Marker({ element: markerEl, anchor: "bottom-left" })
            .setLngLat([property.longitude, property.latitude])
            .setPopup(popup)
            .addTo(map);

          markerEl.addEventListener("click", () => popup.addTo(map));
        }

        setStatus("ready");
      });

      map.on("error", () => {
        if (!cancelled) setStatus("error");
      });
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [token]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 120px)" }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60 pointer-events-none">
          <span className="text-sm text-muted-foreground">Loading map…</span>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Map could not be loaded.</p>
            <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
          </div>
        </div>
      )}
      {status === "empty" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg border bg-background px-4 py-2 shadow-md">
          <p className="text-sm text-muted-foreground">No verified properties available yet.</p>
        </div>
      )}
    </div>
  );
}
