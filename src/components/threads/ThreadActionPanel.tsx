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

  async function handleThreadDecision(decision: "accept" | "decline") {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/threads/${threadId}/owner-decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      const body = await res.json();

      setResult(
        res.ok
          ? `Thread ${body.status ?? "updated"}`
          : (body.error ?? `Error ${res.status}`),
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
          ? `Proposal ${body.status ?? decision}ed`
          : (body.error ?? `Error ${res.status}`),
      );
    } catch (err: any) {
      setResult(err?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) return null;

  return (
    <div className="space-y-4">
      <VerificationGateBanner threadId={threadId} />

      {!finalized && (
        <div className="flex flex-wrap gap-3">
          <button
            data-testid="thread-accept-btn"
            disabled={busy || verLoading || !acceptAllowed}
            onClick={() => handleThreadDecision("accept")}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Accept Thread
          </button>
          <button
            data-testid="thread-decline-btn"
            disabled={busy}
            onClick={() => handleThreadDecision("decline")}
            className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300 disabled:opacity-50"
          >
            Decline Thread
          </button>
        </div>
      )}

      {proposalId && proposalStatus === "submitted" && !finalized && (
        <div className="flex flex-wrap gap-3">
          <button
            data-testid="proposal-accept-btn"
            disabled={busy || verLoading || !acceptAllowed}
            onClick={() => handleProposalDecision("accept")}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Accept Proposal
          </button>
          <button
            data-testid="proposal-reject-btn"
            disabled={busy}
            onClick={() => handleProposalDecision("reject")}
            className="rounded-md bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
          >
            Reject Proposal
          </button>
        </div>
      )}

      {result && (
        <p className="text-sm text-gray-700" data-testid="action-result">
          {result}
        </p>
      )}
    </div>
  );
}
