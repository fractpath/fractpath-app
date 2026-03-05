"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { SubmitOfferModal } from "@/components/deal/SubmitOfferModal";
import type { ResolvedProperty } from "@/components/threads/AddressTypeahead";

type ActiveThread = {
  id: string;
  status: string;
};

type Props = {
  dealId: string;
  readOnly: boolean;
  activeThread?: ActiveThread | null;
  initialTitle?: string | null;
  initialProperty?: {
    property_id: string;
    display_address: string;
    property_status?: string | null;
    ownership_status?: string | null;
  } | null;
  locked?: boolean;
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

export function DealHeader({
  dealId,
  readOnly,
  activeThread,
  initialTitle,
  initialProperty,
  locked = false,
}: Props) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [property, setProperty] = useState<ResolvedProperty | null>(
    initialProperty
      ? {
          property_id: initialProperty.property_id,
          display_address: initialProperty.display_address,
          property_status: initialProperty.property_status ?? null,
          ownership_status: initialProperty.ownership_status ?? null,
        }
      : null,
  );
  const [propertyMeta, setPropertyMeta] = useState<{
    property_status?: string | null;
    ownership_status?: string | null;
  } | null>(
    initialProperty
      ? {
          property_status: initialProperty.property_status ?? null,
          ownership_status: initialProperty.ownership_status ?? null,
        }
      : null,
  );

  const [openAddProperty, setOpenAddProperty] = useState(false);
  const [openSubmitOffer, setOpenSubmitOffer] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const router = useRouter();

  const key = useMemo(() => lsKey(dealId), [dealId]);

  useEffect(() => {
    // If server provided initial values (shared mode), don't override from LS.
    if (initialTitle || initialProperty) return;

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
  }, [key, initialTitle, initialProperty]);

  const persistLocal = useCallback(
    (next: Stored) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [key],
  );

  const isRealDeal =
    dealId !== "new" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      dealId,
    );

  const [saveError, setSaveError] = useState<string | null>(null);

  const persistServer = useCallback(
    async (next: Stored): Promise<boolean> => {
      if (!isRealDeal) return true;

      try {
        const res = await fetch(`/api/deals/${dealId}/header`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: next.title ?? null,
            property_id: next.property_id ?? null,
            display_address: next.display_address ?? null,
            property_status: next.property_status ?? null,
            ownership_status: next.ownership_status ?? null,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setSaveError(body?.error ?? `Save failed (${res.status})`);
          return false;
        }

        setSaveError(null);
        return true;
      } catch {
        setSaveError("Network error — changes saved locally only");
        return false;
      }
    },
    [dealId, isRealDeal],
  );

  async function onSave() {
    const payload: Stored = {
      title,
      property_id: property?.property_id,
      display_address: property?.display_address,
      property_status:
        propertyMeta?.property_status ?? property?.property_status ?? null,
      ownership_status:
        propertyMeta?.ownership_status ?? property?.ownership_status ?? null,
    };

    persistLocal(payload);
    const ok = await persistServer(payload);
    if (ok) setSavedAt(Date.now());
  }

  const hasActiveThread = activeThread?.status === "pending_owner";
  const isDisabled = readOnly || locked;
  const canMakeOffer = !!property?.property_id && !isDisabled && !hasActiveThread;

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
            {locked ? (
              <div
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                data-testid="deal-title-input"
              >
                {title || "Untitled deal"}
              </div>
            ) : (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name this deal..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
                data-testid="deal-title-input"
                disabled={isDisabled}
              />
            )}
          </div>

          {!locked && (
            <div className="flex items-center gap-2 pt-6">
              <button
                type="button"
                onClick={() => setOpenAddProperty(true)}
                disabled={isDisabled}
                className="rounded-md border px-3 py-2 text-sm"
                data-testid="deal-add-property-btn"
              >
                + Add property
              </button>

              <button
                type="button"
                onClick={onSave}
                disabled={isDisabled}
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
                  hasActiveThread
                    ? "Offer already pending"
                    : !property?.property_id
                      ? "Add a property first"
                      : undefined
                }
                onClick={() => setOpenSubmitOffer(true)}
              >
                Submit Offer
              </button>
            </div>
          )}
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

          {saveError ? (
            <div className="text-xs text-red-600">{saveError}</div>
          ) : savedAt ? (
            <div className="text-xs text-muted-foreground">
              Saved {new Date(savedAt).toLocaleTimeString()}
            </div>
          ) : null}
        </div>
      </div>

      <PropertyForm
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

          const payload: Stored = {
            title,
            property_id: r.property_id,
            display_address: r.display_address,
            property_status: r.property_status ?? null,
            ownership_status: r.ownership_status ?? null,
          };

          // Persist immediately so refresh keeps gating state
          persistLocal(payload);
          persistServer(payload);
        }}
      />

      <SubmitOfferModal
        open={openSubmitOffer}
        onClose={() => setOpenSubmitOffer(false)}
        dealId={dealId}
        propertyId={property?.property_id ?? null}
      />
    </section>
  );
}
