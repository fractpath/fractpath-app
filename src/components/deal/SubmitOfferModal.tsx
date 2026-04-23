"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { usePageLoading } from "@/components/ui/PageLoadingOverlay";

type AnyRecord = Record<string, unknown>;

type Props = {
  open: boolean;
  onClose: () => void;
  dealId: string;
  propertyId: string | null;
  effectiveSnapshot: AnyRecord | null;
  currentUserId?: string | null;
};

type PropertyInfo = {
  id: string;
  status: string | null;
  owner_user_id: string | null;
};

type OfferMode = "verified_owner" | "known_email" | "outreach" | "owner_to_buyer";

export function SubmitOfferModal({ open, onClose, dealId, propertyId, effectiveSnapshot, currentUserId }: Props) {
  const router = useRouter();
  const pageLoading = usePageLoading();
  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo | null>(null);
  const [loading, setLoading] = useState(false);
  // Buyer-side segments (used when acting as buyer)
  const [segment, setSegment] = useState<"known_email" | "outreach">("known_email");
  // Owner-side segments (used when acting as property owner → submit to buyer)
  const [ownerBuyerSegment, setOwnerBuyerSegment] = useState<"known_buyer_email" | "outreach">("known_buyer_email");
  const [email, setEmail] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !propertyId) return;
    setLoading(true);
    setError(null);
    setPropertyInfo(null);

    fetch(`/api/properties/${propertyId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const p = data?.property ?? data;
        setPropertyInfo({
          id: p?.id ?? propertyId,
          status: p?.status ?? null,
          owner_user_id: p?.owner_user_id ?? null,
        });
      })
      .catch(() => {
        setPropertyInfo({ id: propertyId, status: null, owner_user_id: null });
      })
      .finally(() => setLoading(false));
  }, [open, propertyId]);

  // The current user IS the verified property owner — submitting to a potential buyer
  const isActingAsOwner =
    !!currentUserId &&
    !!propertyInfo?.owner_user_id &&
    propertyInfo.owner_user_id === currentUserId &&
    propertyInfo.status === "verified";

  // Property has a verified owner that is NOT the current user — buyer can send directly
  const isVerifiedOwner =
    !isActingAsOwner &&
    propertyInfo?.status === "verified" &&
    !!propertyInfo?.owner_user_id;

  const snapshotMissing = !effectiveSnapshot || !effectiveSnapshot.inputs;

  const handleSubmit = useCallback(async () => {
    if (!propertyId) return;
    if (snapshotMissing) {
      setError("Deal terms are required before submitting an offer.");
      return;
    }
    setBusy(true);
    setError(null);
    pageLoading.show("Submitting…");

    let mode: OfferMode;
    const payload: Record<string, any> = {
      property_id: propertyId,
      terms_snapshot: effectiveSnapshot,
    };

    if (isActingAsOwner) {
      mode = "owner_to_buyer";
      payload.mode = mode;
      if (ownerBuyerSegment === "known_buyer_email") {
        const trimmed = buyerEmail.trim().toLowerCase();
        if (!trimmed || !trimmed.includes("@")) {
          setError("Please enter a valid buyer email address.");
          setBusy(false);
          pageLoading.hide();
          return;
        }
        payload.invitee_email = trimmed;
      }
    } else if (isVerifiedOwner) {
      mode = "verified_owner";
      payload.mode = mode;
    } else {
      mode = segment;
      payload.mode = mode;
      if (mode === "known_email") {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !trimmed.includes("@")) {
          setError("Please enter a valid email address.");
          setBusy(false);
          pageLoading.hide();
          return;
        }
        payload.invitee_email = trimmed;
      }
    }

    try {
      const res = await fetch(`/api/deals/${dealId}/submit-offer`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? `Submit failed (${res.status})`);
      }

      onClose();
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setBusy(false);
      pageLoading.hide();
    }
  }, [dealId, propertyId, isActingAsOwner, isVerifiedOwner, ownerBuyerSegment, buyerEmail, segment, email, onClose, router, snapshotMissing, effectiveSnapshot, pageLoading]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isActingAsOwner ? "Send to Potential Buyer" : "Submit Offer"}
    >
      <div data-testid="submit-offer-modal">
        {snapshotMissing ? (
          <div className="text-sm text-red-600">
            Deal terms are required before submitting an offer. Configure deal terms and compute a scenario first.
          </div>
        ) : !propertyId ? (
          <div className="text-sm text-red-600">
            Add a property to your deal before submitting an offer.
          </div>
        ) : loading ? (
          <div className="text-sm text-gray-500">Loading property details...</div>
        ) : isActingAsOwner ? (
          /* ── Owner → Buyer direction ─────────────────────────────────────── */
          <div className="space-y-4">
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
              <div className="text-sm font-medium text-blue-800">You are the property owner</div>
              <div className="mt-1 text-xs text-blue-700">
                Send this deal to a specific buyer for review, or make the property visible on FractPath for interested parties to discover.
              </div>
            </div>

            <div className="flex rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setOwnerBuyerSegment("known_buyer_email")}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  ownerBuyerSegment === "known_buyer_email"
                    ? "bg-foreground text-background"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
                data-testid="segment-known-buyer-email"
              >
                I know a buyer
              </button>
              <button
                type="button"
                onClick={() => setOwnerBuyerSegment("outreach")}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  ownerBuyerSegment === "outreach"
                    ? "bg-foreground text-background"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
                data-testid="segment-owner-outreach"
              >
                Make property visible
              </button>
            </div>

            {ownerBuyerSegment === "known_buyer_email" ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Buyer's email address
                </label>
                <input
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="buyer@example.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
                  data-testid="buyer-email-input"
                />
                <div className="text-xs text-gray-500">
                  We'll send an invitation to the buyer to review this deal.
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                <div className="text-sm font-medium text-blue-800">Public visibility</div>
                <div className="mt-1 text-xs text-blue-700">
                  Make this property visible on FractPath so interested parties can view it and start a deal.
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={handleSubmit}
              className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
              data-testid="submit-offer-owner-btn"
            >
              {busy ? "Submitting..." : ownerBuyerSegment === "known_buyer_email" ? "Share with buyer" : "Make visible"}
            </button>
          </div>
        ) : isVerifiedOwner ? (
          /* ── Buyer → verified owner direction ───────────────────────────── */
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 border border-green-200 p-3">
              <div className="text-sm font-medium text-green-800">Verified owner found</div>
              <div className="mt-1 text-xs text-green-700">
                This property has a verified owner. Your offer will be sent directly to them.
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleSubmit}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              data-testid="submit-offer-verified-btn"
            >
              {busy ? "Submitting..." : "Submit offer to verified owner"}
            </button>
          </div>
        ) : (
          /* ── Buyer → unverified owner / no owner ─────────────────────────── */
          <div className="space-y-4">
            <div className="flex rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setSegment("known_email")}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  segment === "known_email"
                    ? "bg-foreground text-background"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
                data-testid="segment-known-email"
              >
                I know the owner
              </button>
              <button
                type="button"
                onClick={() => setSegment("outreach")}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  segment === "outreach"
                    ? "bg-foreground text-background"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
                data-testid="segment-outreach"
              >
                FractPath find the owner
              </button>
            </div>

            {segment === "known_email" ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Owner's email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@example.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
                  data-testid="owner-email-input"
                />
                <div className="text-xs text-gray-500">
                  We'll send an invitation to the owner to review your offer.
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                <div className="text-sm font-medium text-blue-800">FractPath outreach</div>
                <div className="mt-1 text-xs text-blue-700">
                  Our team will attempt to identify and contact the property owner on your behalf.
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={handleSubmit}
              className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
              data-testid="submit-offer-btn"
            >
              {busy ? "Submitting..." : "Submit Offer"}
            </button>
          </div>
        )}

        {error ? (
          <div className="mt-3 text-xs text-red-600" data-testid="submit-offer-error">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
