"use client";

import { useEffect, useMemo, useState } from "react";
import { PropertyCaptureModal } from "@/components/properties/PropertyCaptureModal";
import type { ResolvedProperty } from "@/components/threads/AddressTypeahead";

type Props = {
  dealId: string;
  readOnly: boolean;
};

function lsKey(dealId: string) {
  return `fractpath:deal:${dealId}:header`;
}

type Stored = {
  title?: string;
  property_id?: string;
  display_address?: string;
  property_status?: string | null;
  ownership_status?: string | null;
};

export function DealHeader({ dealId, readOnly }: Props) {
  const [title, setTitle] = useState("");
  const [property, setProperty] = useState<ResolvedProperty | null>(null);
  const [propertyMeta, setPropertyMeta] = useState<{
    property_status?: string | null;
    ownership_status?: string | null;
  } | null>(null);

  const [openAddProperty, setOpenAddProperty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const key = useMemo(() => lsKey(dealId), [dealId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Stored;

      if (typeof parsed.title === "string") setTitle(parsed.title);

      if (parsed.property_id && parsed.display_address) {
        setProperty({
          property_id: parsed.property_id,
          display_address: parsed.display_address,
          property_status: parsed.property_status ?? null,
          ownership_status: parsed.ownership_status ?? null,
        });
        setPropertyMeta({
          property_status: parsed.property_status ?? null,
          ownership_status: parsed.ownership_status ?? null,
        });
      }
    } catch {
      // ignore
    }
  }, [key]);

  function persist(next: Stored) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function onSave() {
    persist({
      title,
      property_id: property?.property_id,
      display_address: property?.display_address,
      property_status:
        propertyMeta?.property_status ?? property?.property_status ?? null,
      ownership_status:
        propertyMeta?.ownership_status ?? property?.ownership_status ?? null,
    });
    setSavedAt(Date.now());
  }

  const canMakeOffer = !!property?.property_id && !readOnly;

  const statusLabel = (() => {
    const ps =
      propertyMeta?.property_status ?? property?.property_status ?? null;
    const os =
      propertyMeta?.ownership_status ?? property?.ownership_status ?? null;
    if (!ps && !os) return null;
    if (ps === "verified") return "Verified";
    if (os === "unclaimed") return "Unclaimed";
    if (os === "claimed" && ps !== "verified") return "Claimed — not verified";
    return ps ?? os;
  })();

  return (
    <section className="mb-6 rounded-md border p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Deal Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name this deal…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
              data-testid="deal-title-input"
              disabled={readOnly}
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <button
              type="button"
              onClick={() => setOpenAddProperty(true)}
              disabled={readOnly}
              className="rounded-md border px-3 py-2 text-sm"
              data-testid="deal-add-property-btn"
            >
              + Add property
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={readOnly}
              className="rounded-md border px-3 py-2 text-sm"
              data-testid="deal-save-btn"
            >
              Save
            </button>

            <button
              type="button"
              disabled={!canMakeOffer}
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
              data-testid="deal-propose-btn"
              title={
                !property?.property_id ? "Add a property first" : undefined
              }
              onClick={() => {
                // Next phase: Path A (owner email -> Opportunity + Offer)
              }}
            >
              Make Offer
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {property?.property_id ? (
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                data-testid="deal-property-pill"
                title={property.property_id}
              >
                <span className="font-medium">{property.display_address}</span>
                {statusLabel ? (
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium">
                    {statusLabel}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Add a property to enable making an offer.
              </div>
            )}
          </div>

          {savedAt ? (
            <div className="text-xs text-muted-foreground">
              Saved {new Date(savedAt).toLocaleTimeString()}
            </div>
          ) : null}
        </div>
      </div>

      <PropertyCaptureModal
        open={openAddProperty}
        onClose={() => setOpenAddProperty(false)}
        context="deal"
        onResolved={(r: any) => {
          setProperty({
            property_id: r.property_id,
            display_address: r.display_address,
            property_status: r.property_status ?? null,
            ownership_status: r.ownership_status ?? null,
          });
          setPropertyMeta({
            property_status: r.property_status ?? null,
            ownership_status: r.ownership_status ?? null,
          });

          // persist immediately so refresh keeps gating state
          persist({
            title,
            property_id: r.property_id,
            display_address: r.display_address,
            property_status: r.property_status ?? null,
            ownership_status: r.ownership_status ?? null,
          });
        }}
      />
    </section>
  );
}
