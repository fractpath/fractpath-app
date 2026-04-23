"use client";

import { useState } from "react";
import { ReleaseClaimModal, ReleaseClaimBlockedModal } from "@/components/property/ReleaseClaimModal";

interface Props {
  propertyId: string;
}

type ModalState =
  | { type: "closed" }
  | { type: "loading" }
  | { type: "allowed"; activeNonBindingDeals: number }
  | { type: "blocked"; reasons: string[] }
  | { type: "success" };

export function OwnerReleaseClaimSection({ propertyId }: Props) {
  const [modal, setModal] = useState<ModalState>({ type: "closed" });

  async function handleButtonClick() {
    setModal({ type: "loading" });
    try {
      const res = await fetch(
        `/api/me/properties/${propertyId}/release-claim`,
        { method: "GET" },
      );
      const json = await res.json();

      // 403 means the user is no longer the owner_user_id (already released)
      if (res.status === 403) {
        setModal({ type: "blocked", reasons: ["not_owner"] });
        return;
      }

      if (!json.ok) {
        setModal({ type: "blocked", reasons: ["unknown"] });
        return;
      }

      if (json.allowed) {
        setModal({
          type: "allowed",
          activeNonBindingDeals: json.active_nonbinding_deals ?? 0,
        });
      } else {
        setModal({
          type: "blocked",
          reasons: json.blocked_reasons ?? ["unknown"],
        });
      }
    } catch {
      setModal({ type: "blocked", reasons: ["network_error"] });
    }
  }

  function handleClose() {
    setModal({ type: "closed" });
  }

  function handleSuccess() {
    setModal({ type: "success" });
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1500);
  }

  return (
    <>
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 mb-2">
          No longer want to manage this property on FractPath?
        </p>
        <button
          onClick={handleButtonClick}
          disabled={modal.type === "loading"}
          className="text-sm text-red-600 underline underline-offset-2 hover:text-red-700 disabled:opacity-50 transition-colors"
        >
          {modal.type === "loading" ? "Checking…" : "Release property claim"}
        </button>
      </div>

      {modal.type === "allowed" && (
        <ReleaseClaimModal
          propertyId={propertyId}
          activeNonBindingDeals={modal.activeNonBindingDeals}
          onSuccess={handleSuccess}
          onClose={handleClose}
        />
      )}

      {modal.type === "blocked" && (
        <ReleaseClaimBlockedModal reasons={modal.reasons} onClose={handleClose} />
      )}

      {modal.type === "success" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white px-8 py-6 shadow-xl text-center space-y-2">
            <p className="text-base font-semibold text-gray-800">
              Property claim released
            </p>
            <p className="text-sm text-gray-500">
              Redirecting to your dashboard…
            </p>
          </div>
        </div>
      )}
    </>
  );
}
