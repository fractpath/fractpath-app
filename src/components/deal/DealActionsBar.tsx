"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitOfferModal } from "@/components/deal/SubmitOfferModal";
import { ShareDealModal } from "@/components/deal/ShareDealModal";
import { ArchiveDealModal } from "@/components/deal/ArchiveDealModal";
import { CounterOfferModal } from "@/components/deal/CounterOfferModal";

type AnyRecord = Record<string, unknown>;

type Props = {
  dealId: string;
  propertyId: string | null;
  locked: boolean;
  readOnly: boolean;
  effectiveSnapshot: AnyRecord | null;
  // Explicit role flags derived from negState — these are the source of truth for CTA visibility
  isPropertyOwner: boolean;  // true only for the homeowner (negState.isOwnerSide)
  isBuyer: boolean;          // true only for the deal buyer (negState.isBuyer)
  // Owner action context
  ownerProposalId?: string | null;
  ownerProposalStatus?: string | null;
  ownerTermsSnapshot?: AnyRecord | null;
  // Thread context
  activeThreadId?: string | null;
  activeThreadStatus?: string | null;
  // Current authenticated user — forwarded to SubmitOfferModal for direction detection
  currentUserId?: string | null;
};

export function DealActionsBar({
  dealId,
  propertyId,
  locked,
  readOnly,
  effectiveSnapshot,
  isPropertyOwner,
  isBuyer,
  ownerProposalId,
  ownerProposalStatus,
  ownerTermsSnapshot,
  activeThreadId,
  activeThreadStatus,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [openSubmit, setOpenSubmit] = useState(false);
  const [openShare, setOpenShare] = useState(false);
  const [openArchive, setOpenArchive] = useState(false);
  const [openCounter, setOpenCounter] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [ownerBusy, setOwnerBusy] = useState(false);

  const canSubmit = !!propertyId && !readOnly && !locked;

  // Owner can act when thread is waiting for their decision
  const canOwnerDecide =
    isPropertyOwner &&
    locked &&
    activeThreadStatus === "pending_owner" &&
    !!ownerProposalId &&
    ownerProposalStatus === "submitted";

  // Buyer can withdraw only while their offer is still pending (before any counter)
  const canBuyerWithdraw =
    isBuyer &&
    locked &&
    (activeThreadStatus === "pending_owner" || activeThreadStatus === "pending_buyer") &&
    !!activeThreadId;

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
      // Errors are surfaced by the full ThreadActionPanel below on the page
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handleWithdraw() {
    if (!activeThreadId || withdrawBusy) return;
    setWithdrawBusy(true);
    try {
      const res = await fetch(`/api/threads/${activeThreadId}/withdraw`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // Errors are surfaced by the ActiveThreadBanner below on the page
    } finally {
      setWithdrawBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* ── Owner CTA: Accept / Counter / Reject ─────────────────────────── */}
        {canOwnerDecide && (
          <>
            <button
              type="button"
              disabled={ownerBusy}
              onClick={() => handleOwnerDecision("accept")}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              data-testid="deal-bar-accept-btn"
            >
              Accept
            </button>

            {ownerTermsSnapshot && (
              <button
                type="button"
                disabled={ownerBusy}
                onClick={() => setOpenCounter(true)}
                className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium hover:bg-muted/40 disabled:opacity-50"
                data-testid="deal-bar-counter-btn"
              >
                Counter
              </button>
            )}

            <button
              type="button"
              disabled={ownerBusy}
              onClick={() => handleOwnerDecision("reject")}
              className="rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
              data-testid="deal-bar-reject-btn"
            >
              Reject
            </button>
          </>
        )}

        {/* ── Buyer CTA: Withdraw ───────────────────────────────────────────── */}
        {canBuyerWithdraw && (
          <button
            type="button"
            disabled={withdrawBusy}
            onClick={handleWithdraw}
            className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
            data-testid="deal-bar-withdraw-btn"
          >
            {withdrawBusy ? "Withdrawing…" : "Withdraw Offer"}
          </button>
        )}

        {/* ── Submit offer / Share — hidden when deal is locked ────────────── */}
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

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {!locked && (
        <>
          <SubmitOfferModal
            open={openSubmit}
            onClose={() => setOpenSubmit(false)}
            dealId={dealId}
            propertyId={propertyId}
            effectiveSnapshot={effectiveSnapshot}
            currentUserId={currentUserId ?? null}
          />
          <ShareDealModal
            open={openShare}
            onClose={() => setOpenShare(false)}
            dealId={dealId}
          />
        </>
      )}

      {canOwnerDecide && ownerTermsSnapshot && (
        <div style={{ display: openCounter ? "block" : "none" }}>
          <CounterOfferModal
            open={openCounter}
            onClose={() => setOpenCounter(false)}
            proposalId={ownerProposalId!}
            termsSnapshot={ownerTermsSnapshot}
          />
        </div>
      )}

      <ArchiveDealModal
        open={openArchive}
        onClose={() => setOpenArchive(false)}
        dealId={dealId}
      />
    </>
  );
}
