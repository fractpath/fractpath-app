"use client";

import { useState } from "react";
import { SubmitOfferModal } from "@/components/deal/SubmitOfferModal";
import { ShareDealModal } from "@/components/deal/ShareDealModal";
import { ArchiveDealModal } from "@/components/deal/ArchiveDealModal";

type AnyRecord = Record<string, unknown>;

type Props = {
  dealId: string;
  propertyId: string | null;
  locked: boolean;
  readOnly: boolean;
  effectiveSnapshot: AnyRecord | null;
  // Owner action context — passed when the current user is the homeowner
  ownerProposalId?: string | null;
  ownerProposalStatus?: string | null;
  activeThreadStatus?: string | null;
};

export function DealActionsBar({
  dealId,
  propertyId,
  locked,
  readOnly,
  effectiveSnapshot,
  ownerProposalId,
  ownerProposalStatus,
  activeThreadStatus,
}: Props) {
  const [openSubmit, setOpenSubmit] = useState(false);
  const [openShare, setOpenShare] = useState(false);
  const [openArchive, setOpenArchive] = useState(false);
  const [ownerBusy, setOwnerBusy] = useState(false);

  const isOwner = !readOnly;
  const canSubmit = !!propertyId && !readOnly && !locked;

  // Owner can accept/decline when thread is waiting for their decision
  const canOwnerDecide =
    isOwner &&
    locked &&
    activeThreadStatus === "pending_owner" &&
    !!ownerProposalId &&
    ownerProposalStatus === "submitted";

  async function handleOwnerDecision(decision: "accept" | "reject") {
    if (!ownerProposalId || ownerBusy) return;
    setOwnerBusy(true);
    try {
      const res = await fetch(`/api/proposals/${ownerProposalId}/owner-decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        window.location.href = "/dashboard";
      }
    } catch {
      // Errors are handled by the full ThreadActionPanel below
    } finally {
      setOwnerBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Owner accept/decline — shown in top bar when a proposal is awaiting decision */}
        {canOwnerDecide && (
          <>
            <button
              type="button"
              disabled={ownerBusy}
              onClick={() => handleOwnerDecision("accept")}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              data-testid="deal-bar-accept-btn"
            >
              Accept Offer
            </button>
            <button
              type="button"
              disabled={ownerBusy}
              onClick={() => handleOwnerDecision("reject")}
              className="rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
              data-testid="deal-bar-decline-btn"
            >
              Decline
            </button>
          </>
        )}

        {/* Submit offer — hidden when deal is locked (offer already pending or thread closed) */}
        {!locked && (
          <button
            type="button"
            onClick={() => setOpenSubmit(true)}
            disabled={!canSubmit}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
            data-testid="deal-action-submit"
            title={!propertyId ? "Add a property first" : undefined}
          >
            Submit offer
          </button>
        )}

        {/* Share — hidden when deal is locked */}
        {!locked && (
          <button
            type="button"
            onClick={() => setOpenShare(true)}
            disabled={readOnly}
            className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            data-testid="deal-action-share"
          >
            Share
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpenArchive(true)}
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium"
          data-testid="deal-action-archive"
        >
          Archive
        </button>
      </div>

      {!locked && (
        <>
          <SubmitOfferModal
            open={openSubmit}
            onClose={() => setOpenSubmit(false)}
            dealId={dealId}
            propertyId={propertyId}
            effectiveSnapshot={effectiveSnapshot}
          />

          <ShareDealModal
            open={openShare}
            onClose={() => setOpenShare(false)}
            dealId={dealId}
          />
        </>
      )}

      <ArchiveDealModal
        open={openArchive}
        onClose={() => setOpenArchive(false)}
        dealId={dealId}
      />
    </>
  );
}
