"use client";

import { useState } from "react";
import { useThreadVerificationStatus } from "@/hooks/useThreadVerificationStatus";
import { VerificationGateBanner } from "./VerificationGateBanner";

type Props = {
  threadId: string;
  threadStatus: string;
  isOwner: boolean;
  proposalId?: string | null;
  proposalStatus?: string | null;
  onDecisionComplete?: () => void | Promise<void>;
};

export function ThreadActionPanel({
  threadId,
  threadStatus,
  isOwner,
  proposalId,
  proposalStatus,
  onDecisionComplete,
}: Props) {
  const { data: verStatus, loading: verLoading } =
    useThreadVerificationStatus(threadId);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const acceptAllowed = verStatus?.accept_allowed ?? false;
  const finalized = ["accepted", "active", "declined", "closed"].includes(
    threadStatus,
  );

  async function handleProposalDecision(decision: "accept" | "reject") {
    if (!proposalId) return;
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

      setResult(
        res.ok
          ? `Proposal ${body.status ?? decision + "ed"}`
          : (body.error ?? `Error ${res.status}`),
      );

      if (res.ok) {
        await onDecisionComplete?.();
        // Sprint 13: return owner to dashboard queue after a decision
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      setResult(err?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function handleProposalSubmit() {
    if (!proposalId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json();
      setResult(
        res.ok ? `Proposal submitted` : (body.error ?? `Error ${res.status}`),
      );
      if (res.ok) {
        await onDecisionComplete?.();
      }
    } catch (err: any) {
      setResult(err?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  // OWNER VIEW (Sprint 13): decisions happen at proposal level
  if (isOwner) {
    const canDecideProposal =
      !!proposalId &&
      proposalStatus === "submitted" &&
      threadStatus === "pending_owner" &&
      !finalized;

    return (
      <div className="space-y-4">
        <VerificationGateBanner threadId={threadId} />

        {!proposalId && !finalized && (
          <p className="text-sm text-gray-500">
            No proposal found for this thread yet.
          </p>
        )}

        {proposalId && proposalStatus !== "submitted" && !finalized && (
          <p className="text-sm text-gray-600">
            Latest proposal is{" "}
            <span className="font-medium">{proposalStatus}</span>.
          </p>
        )}

        {canDecideProposal && (
          <div className="flex flex-wrap gap-3">
            <button
              data-testid="proposal-accept-btn"
              disabled={busy || verLoading || !acceptAllowed}
              onClick={() => handleProposalDecision("accept")}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Accept Offer
            </button>

            <button
              data-testid="proposal-reject-btn"
              disabled={busy}
              onClick={() => handleProposalDecision("reject")}
              className="rounded-md bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
            >
              Reject Offer
            </button>
          </div>
        )}

        {!canDecideProposal &&
          !finalized &&
          proposalId &&
          proposalStatus === "submitted" && (
            <p className="text-sm text-gray-600">
              This thread is <span className="font-medium">{threadStatus}</span>
              . Owner decisions are available only when the thread is{" "}
              <span className="font-medium">pending_owner</span>.
            </p>
          )}

       

        {result && (
          <p className="text-sm text-gray-700" data-testid="action-result">
            {result}
          </p>
        )}
      </div>
    );
  }

  // NON-OWNER VIEW
  return (
    <div className="space-y-4">
      {proposalId && proposalStatus === "draft" && !finalized && (
        <div className="flex flex-wrap gap-3">
          <button
            data-testid="proposal-submit-btn"
            disabled={busy}
            onClick={handleProposalSubmit}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Submit Proposal
          </button>
        </div>
      )}

      {proposalId && proposalStatus === "submitted" && (
        <p className="text-sm text-gray-600">
          Your proposal has been submitted and is awaiting the owner's review.
        </p>
      )}

      {!proposalId && !finalized && (
        <p className="text-sm text-gray-500">
          Create a proposal in the deal editor to submit an offer on this
          thread.
        </p>
      )}

      {finalized ? null : null}

      {result && (
        <p className="text-sm text-gray-700" data-testid="action-result">
          {result}
        </p>
      )}
    </div>
  );
}
