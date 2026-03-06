"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ThreadActionPanel } from "./ThreadActionPanel";

type ThreadData = {
  id: string;
  property_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_by_user_id: string;
  buyer_user_id: string;
  owner_user_id: string | null;
};

type Participant = {
  user_id: string;
  role: string;
  permission: string;
  status: string;
};

type Proposal = {
  id: string;
  thread_id: string;
  status: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function StatusPill({ status }: { status: string }) {
  const label = formatStatusLabel(status);
  const isPositive = status === "accepted" || status === "active";
  const isNegative = status === "declined" || status === "closed";
  const tone = isPositive
    ? "bg-emerald-50 text-emerald-700"
    : isNegative
      ? "bg-red-50 text-red-700"
      : "bg-gray-100 text-gray-700";

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

export function ThreadDetailView({ threadId }: { threadId: string }) {
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debug = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, []);

  const refreshMe = useCallback(async () => {
    const meRes = await fetch("/api/me", { credentials: "include" });
    if (!meRes.ok) return;
    const meData = await meRes.json().catch(() => ({}));
    setCurrentUserId(meData?.user?.id ?? meData?.id ?? null);
  }, []);

  const [isPropertyOwner, setIsPropertyOwner] = useState(false);

  const refreshThread = useCallback(async () => {
    const viewRes = await fetch(`/api/threads/${threadId}/view`, {
      credentials: "include",
    });
    if (!viewRes.ok) {
      const body = await viewRes.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${viewRes.status}`);
    }
    const viewData = await viewRes.json();
    setThread(viewData.thread);
    setParticipants(viewData.participants ?? []);
    setIsPropertyOwner(!!viewData.is_property_owner);
  }, [threadId]);

  const refreshProposals = useCallback(async () => {
    const propRes = await fetch(`/api/threads/${threadId}/proposals`, {
      credentials: "include",
    });
    if (!propRes.ok) {
      setProposals([]);
      return;
    }
    const propData = await propRes.json().catch(() => ({}));
    setProposals(propData.proposals ?? []);
  }, [threadId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([refreshThread(), refreshMe(), refreshProposals()]);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }, [refreshMe, refreshProposals, refreshThread]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="p-6 text-gray-500">Loading thread...</p>;
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  if (!thread) {
    return <p className="p-6 text-gray-500">Thread not found</p>;
  }

  const isOwner =
    isPropertyOwner ||
    (currentUserId && thread.owner_user_id === currentUserId) ||
    participants.some(
      (p) =>
        p.user_id === currentUserId &&
        p.role === "owner" &&
        p.status === "active",
    );

  const latestSubmitted = proposals.find((p) => p.status === "submitted");
  const myLatestDraft = proposals.find(
    (p) => p.status === "draft" && p.created_by_user_id === currentUserId,
  );
  const actionableProposal = latestSubmitted ?? myLatestDraft ?? null;

  const finalized = ["accepted", "active", "closed"].includes(
    thread.status,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {/* Owner-facing header */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Offer review</h2>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Status:</span>
          <StatusPill status={thread.status} />
        </div>
        {finalized ? (
          <p className="text-sm text-gray-600">
            This thread has been {formatStatusLabel(thread.status)}.
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            Review the submitted offer and choose accept or reject.
          </p>
        )}
      </div>

      {/* Actions first (primary owner task) */}
      <ThreadActionPanel
        threadId={thread.id}
        threadStatus={thread.status}
        isOwner={!!isOwner}
        proposalId={actionableProposal?.id ?? null}
        proposalStatus={actionableProposal?.status ?? null}
        onDecisionComplete={async () => {
          await Promise.all([refreshThread(), refreshProposals()]);
        }}
      />

      {/* Minimal context (no machine IDs) */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="text-sm text-gray-700">
          <div className="font-medium">Summary</div>
          <div className="text-gray-600">
            {finalized
              ? "Decision recorded."
              : actionableProposal?.status === "submitted"
                ? "A proposal has been submitted and is awaiting your decision."
                : actionableProposal?.status === "draft"
                  ? "A draft proposal exists (not yet submitted)."
                  : "No proposal found yet."}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="text-gray-500">Created</div>
          <div>{new Date(thread.created_at).toLocaleString()}</div>

          <div className="text-gray-500">Updated</div>
          <div>{new Date(thread.updated_at).toLocaleString()}</div>
        </div>
      </div>

      {/* Debug-only technical details */}
      {debug ? (
        <section className="rounded-lg border p-4 bg-muted/30 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Debug</h3>
            <span className="text-xs text-gray-500">?debug=1</span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="font-medium text-gray-500">Thread ID</dt>
            <dd className="font-mono break-all">{thread.id}</dd>

            <dt className="font-medium text-gray-500">Property ID</dt>
            <dd className="font-mono break-all">{thread.property_id ?? "—"}</dd>

            <dt className="font-medium text-gray-500">Buyer user_id</dt>
            <dd className="font-mono break-all">{thread.buyer_user_id}</dd>

            <dt className="font-medium text-gray-500">Owner user_id</dt>
            <dd className="font-mono break-all">
              {thread.owner_user_id ?? "—"}
            </dd>

            <dt className="font-medium text-gray-500">Created by</dt>
            <dd className="font-mono break-all">{thread.created_by_user_id}</dd>

            <dt className="font-medium text-gray-500">Me</dt>
            <dd className="font-mono break-all">{currentUserId ?? "—"}</dd>
          </dl>

          {participants.length > 0 ? (
            <div>
              <div className="mb-2 text-sm font-semibold">Participants</div>
              <ul className="space-y-1 text-xs">
                {participants.map((p) => (
                  <li
                    key={`${p.user_id}:${p.role}`}
                    className="flex items-center gap-2"
                  >
                    <span className="font-mono">
                      {p.user_id.slice(0, 8)}...
                    </span>
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                      {p.role}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {p.permission}
                    </span>
                    {p.status !== "active" ? (
                      <span className="text-[11px] text-red-500">
                        ({p.status})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {proposals.length > 0 ? (
            <div>
              <div className="mb-2 text-sm font-semibold">Proposals</div>
              <ul className="space-y-1 text-xs">
                {proposals.map((pr) => (
                  <li key={pr.id} className="flex items-center gap-2">
                    <span className="font-mono">{pr.id.slice(0, 8)}...</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold">
                      {pr.status}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(pr.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
