"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { EditDealNameModal } from "@/components/deal/EditDealNameModal";
import { StatusBadge } from "@/components/property/StatusBadge";
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
  onPropertyChange?: (propertyId: string | null) => void;
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

// Resolves badge config from live property metadata — mirrors PropertyPageHeader's STATUS_BADGE map.
function resolvePropertyBadge(
  propertyStatus: string | null,
  ownershipStatus: string | null,
): { className: string; label: string; tooltip: string } | null {
  if (!propertyStatus && !ownershipStatus) return null;
  if (propertyStatus === "verified")
    return {
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
      label: "Verified",
      tooltip: "Property ownership and core records have been verified.",
    };
  if (propertyStatus === "under_review")
    return {
      className: "bg-blue-100 text-blue-800 border-blue-200",
      label: "Under review",
      tooltip: "Property is currently being reviewed by our team.",
    };
  if (propertyStatus === "pending_verification")
    return {
      className: "bg-yellow-100 text-yellow-800 border-yellow-200",
      label: "Pending verification",
      tooltip: "Verification is in progress.",
    };
  if (propertyStatus === "ineligible")
    return {
      className: "bg-red-100 text-red-800 border-red-200",
      label: "Ineligible",
      tooltip: "Property does not currently meet participation requirements.",
    };
  if (ownershipStatus === "unclaimed")
    return {
      className: "bg-gray-100 text-gray-700 border-gray-200",
      label: "Unclaimed",
      tooltip: "No homeowner has claimed this property yet.",
    };
  if (ownershipStatus === "claimed")
    return {
      className: "bg-yellow-100 text-yellow-800 border-yellow-200",
      label: "Verification pending",
      tooltip: "A homeowner is connected but verification is not complete.",
    };
  return {
    className: "bg-gray-100 text-gray-700 border-gray-200",
    label: propertyStatus ?? ownershipStatus ?? "Unverified",
    tooltip: "Property has not yet been verified.",
  };
}

export function DealHeader({
  dealId,
  readOnly,
  activeThread,
  initialTitle,
  initialProperty,
  locked = false,
  onPropertyChange,
}: Props) {
  const router = useRouter();

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

  const isPersistedDeal = typeof dealId === "string" && dealId !== "new";

  const key = useMemo(() => lsKey(dealId), [dealId]);

  useEffect(() => {
    if (dealId === "new") {
      try {
        localStorage.removeItem(key);
      } catch {}
      return;
    }
  }, [dealId, key]);

  const persistLocal = useCallback(
    (next: Stored) => {
      if (dealId === "new") return;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [key, dealId],
  );

  const isDisabled = readOnly || locked || !isPersistedDeal;

  const activePropStatus =
    propertyMeta?.property_status ?? property?.property_status ?? null;
  const activeOwnerStatus =
    propertyMeta?.ownership_status ?? property?.ownership_status ?? null;
  const activeBadge = resolvePropertyBadge(activePropStatus, activeOwnerStatus);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" data-testid="deal-title-input">
          {title || "Untitled deal"}
        </h1>
        {!isDisabled && (
          <button
            type="button"
            onClick={() => setOpenEditName(true)}
            className="shrink-0 rounded-md border bg-white px-3 py-1.5 text-sm font-medium hover:bg-muted/50"
            data-testid="deal-edit-title-btn"
          >
            Edit Name
          </button>
        )}
      </div>

      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" data-testid="deal-property-label">
            Address
          </span>
          {!isDisabled && (
            <button
              type="button"
              onClick={() => setOpenAddProperty(true)}
              className="shrink-0 rounded-md border bg-white px-3 py-1.5 text-sm font-medium hover:bg-muted/50"
              data-testid="deal-add-property-btn"
            >
              {property?.property_id ? "Edit Property" : "Add Property"}
            </button>
          )}
        </div>

        {property?.property_id ? (
          <div className="space-y-1.5" data-testid="deal-property-pill">
            <p className="font-semibold leading-snug">{property.display_address}</p>
            {activeBadge && (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge className={activeBadge.className} tooltip={activeBadge.tooltip}>
                  {activeBadge.label}
                </StatusBadge>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8" data-testid="deal-property-empty">
            <p className="text-sm text-muted-foreground mb-3">
              No property selected
            </p>
            {!isDisabled && (
              <button
                type="button"
                onClick={() => setOpenAddProperty(true)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Add Property
              </button>
            )}
          </div>
        )}
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
        onResolved={async (r: any) => {
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
          onPropertyChange?.(r.property_id ?? null);

          const payload: Stored = {
            title,
            property_id: r.property_id,
            display_address: r.display_address,
            property_status: r.property_status ?? null,
            ownership_status: r.ownership_status ?? null,
          };

          persistLocal(payload);

          if (isPersistedDeal) {
            try {
              const res = await fetch(`/api/deals/${dealId}/header`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title,
                  property_id: r.property_id,
                  display_address: r.display_address,
                  property_status: r.property_status ?? null,
                  ownership_status: r.ownership_status ?? null,
                }),
              });
              if (res.ok) {
                router.refresh();
              }
            } catch {
              // non-fatal — local state already updated optimistically
            }
          }
        }}
      />
    </div>
  );
}
