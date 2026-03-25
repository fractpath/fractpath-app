"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ProposalComparisonCard } from "./ProposalComparisonCard";
import { CounterOfferModal } from "./CounterOfferModal";
import { useThreadVerificationStatus } from "@/hooks/useThreadVerificationStatus";
import { VerificationGateBanner } from "@/components/threads/VerificationGateBanner";

type AnyRecord = Record<string, unknown>;

type Props = {
  threadId: string;
  proposalId: string;
  proposalStatus: string;
  currentTerms: AnyRecord | null;
  previousTerms: AnyRecord | null;
  isOwnerSide: boolean;
};

export function NegotiationSection({
  threadId,
  proposalId,
  proposalStatus,
  currentTerms,
  previousTerms,
  isOwnerSide,
}: Props) {
  const router = useRouter();
  const { data: verStatus, loading: verLoading } =
    useThreadVerificationStatus(threadId);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const acceptAllowed = isOwnerSide ? (verStatus?.accept_allowed ?? false) : true;
  const canAct = proposalStatus === "submitted";

  async function handleDecision(decision: "accept" | "reject") {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/owner-decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? `${decision} failed (${res.status})`);
      }
      setResult(`Proposal ${body.status ?? decision + "ed"}`);
      setAcceptOpen(false);
      setRejectOpen(false);
      router.refresh();
    } catch (err: any) {
      setResult(err?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="negotiation-section">
      <div
        className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950"
        data-testid="negotiation-banner"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
            {previousTerms
              ? "Counter-offer received — review and respond"
              : "Offer awaiting your decision"}
          </span>
        </div>
      </div>

      {previousTerms ? (
        <ProposalComparisonCard
          currentTerms={currentTerms}
          previousTerms={previousTerms}
          currentLabel="Counter-offer"
          previousLabel="Previous offer"
        />
      ) : null}

      {isOwnerSide && <VerificationGateBanner threadId={threadId} />}

      {canAct && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="proposal-accept-btn"
            disabled={busy || verLoading || !acceptAllowed}
            onClick={() => setAcceptOpen(true)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Accept
          </button>

          <button
            type="button"
            data-testid="proposal-counter-btn"
            disabled={busy}
            onClick={() => setCounterOpen(true)}
            className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-600 dark:bg-blue-900 dark:text-blue-200"
          >
            Counter
          </button>

          <button
            type="button"
            data-testid="proposal-reject-btn"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
            className="rounded-md bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900 dark:text-red-200"
          >
            Reject
          </button>
        </div>
      )}

      {result && (
        <p className="text-sm text-gray-700 dark:text-gray-300" data-testid="action-result">
          {result}
        </p>
      )}

      <Modal
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        title="Accept this proposal?"
      >
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <p>
              Accepting means you are agreeing in principle to the economic terms
              shown on this page.
            </p>
            <p>
              <span className="font-medium">Next steps:</span> FractPath will
              review the file, may request additional information, and will
              contact you with the next step in the process.
            </p>
            <p className="text-xs text-gray-500">
              You can still cancel before final contract execution.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setAcceptOpen(false)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || verLoading || !acceptAllowed}
              onClick={() => handleDecision("accept")}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Accepting..." : "Confirm Accept"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject this proposal?"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Rejecting will close this negotiation thread. This action cannot be
            undone.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleDecision("reject")}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Rejecting..." : "Confirm Reject"}
            </button>
          </div>
        </div>
      </Modal>

      {counterOpen && currentTerms && (
        <CounterOfferModal
          open={counterOpen}
          onClose={() => setCounterOpen(false)}
          proposalId={proposalId}
          termsSnapshot={currentTerms}
        />
      )}
    </div>
  );
}
