"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { EditDealNameModal } from "@/components/deal/EditDealNameModal";
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
  const [openEditName, setOpenEditName] = useState(false);

  const key = useMemo(() => lsKey(dealId), [dealId]);

  useEffect(() => {
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

  const isDisabled = readOnly || locked;

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

  function handleTitleSaved(newTitle: string) {
    setTitle(newTitle);
    const payload: Stored = {
      title: newTitle,
      property_id: property?.property_id,
      display_address: property?.display_address,
      property_status:
        propertyMeta?.property_status ?? property?.property_status ?? null,
      ownership_status:
        propertyMeta?.ownership_status ?? property?.ownership_status ?? null,
    };
    persistLocal(payload);
  }

  return (
    <section className="mb-6 rounded-md border p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold" data-testid="deal-title-input">
            {title || "Untitled deal"}
          </h1>
          {!isDisabled && (
            <button
              type="button"
              onClick={() => setOpenEditName(true)}
              className="shrink-0 rounded border px-2 py-1 text-xs font-medium hover:bg-muted/50"
              data-testid="deal-edit-title-btn"
            >
              Edit
            </button>
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

            {!isDisabled && (
              <button
                type="button"
                onClick={() => setOpenAddProperty(true)}
                className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted/50"
                data-testid="deal-add-property-btn"
              >
                + Add property
              </button>
            )}
          </div>
        </div>
      </div>

      <EditDealNameModal
        open={openEditName}
        onClose={() => setOpenEditName(false)}
        dealId={dealId}
        currentTitle={title}
        onSaved={handleTitleSaved}
      />

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

          persistLocal(payload);
        }}
      />
    </section>
  );
}
