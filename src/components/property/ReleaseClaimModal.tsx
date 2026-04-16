"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface Props {
  propertyId: string;
  activeNonBindingDeals: number;
  onSuccess: () => void;
  onClose: () => void;
}

export function ReleaseClaimModal({
  propertyId,
  activeNonBindingDeals,
  onSuccess,
  onClose,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/me/properties/${propertyId}/release-claim`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!json.ok) {
        const detail =
          json.details?.blocked_reasons?.join(", ") ||
          json.error ||
          "Release blocked";
        setError(detail);
        return;
      }
      onSuccess();
    } catch {
      setError("Network error — please try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Release property claim?"
      onPrimary={handleConfirm}
      onSecondary={onClose}
      primaryLabel={pending ? "Releasing…" : "Release claim"}
      secondaryLabel="Cancel"
      primaryLoading={pending}
      footer={
        error ? (
          <p className="text-sm text-red-600 mt-1">{error}</p>
        ) : undefined
      }
    >
      <div className="space-y-3 text-sm text-gray-700">
        <p>
          This will remove your ownership association from this property and
          clear owner-linked private data from active use. The property can be
          claimed by others. Existing non-binding deals may be closed or
          retained only for internal history.
        </p>

        {activeNonBindingDeals > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
            <strong>Active non-binding deals will be closed</strong> as part of
            this action ({activeNonBindingDeals} deal
            {activeNonBindingDeals !== 1 ? "s" : ""}).
          </div>
        )}

        <p className="text-xs text-gray-500">
          This action cannot be undone automatically. Contact support if you
          released in error.
        </p>
      </div>
    </Modal>
  );
}

interface BlockedProps {
  onClose: () => void;
}

export function ReleaseClaimBlockedModal({ onClose }: BlockedProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Release property claim?"
      onSecondary={onClose}
      secondaryLabel="Close"
    >
      <div className="space-y-3 text-sm text-gray-700">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800 text-sm">
          This property cannot be released because it is tied to an active
          binding deal. Contact support or an administrator to resolve the deal
          first.
        </div>
      </div>
    </Modal>
  );
}
