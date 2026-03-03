"use client";

import { useCallback, useEffect, useState } from "react";
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

export function ThreadDetailView({ threadId }: { threadId: string }) {
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    const meRes = await fetch("/api/me", { credentials: "include" });
    if (!meRes.ok) return;
    const meData = await meRes.json().catch(() => ({}));
    setCurrentUserId(meData?.user?.id ?? meData?.id ?? null);
  }, []);

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
  }, [threadId]);

  const refreshProposals = useCallback(async () => {
    const propRes = await fetch(`/api/threads/${threadId}/proposals`, {
      credentials: "include",
    });
    if (!propRes.ok) {
      // proposals are optional; don’t fail the whole page
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
    (currentUserId && thread.owner_user_id === currentUserId) ||
    participants.some(
      (p) =>
        p.user_id === currentUserId &&
        p.role === "owner" &&
        p.status === "active",
    );

  const latestSubmitted = proposals.find((p) => p.status === "submitted");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Thread Detail</h1>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="font-medium text-gray-500">Thread ID</dt>
        <dd className="font-mono text-xs break-all">{thread.id}</dd>

        <dt className="font-medium text-gray-500">Status</dt>
        <dd>
          <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold">
            {thread.status}
          </span>
        </dd>

        <dt className="font-medium text-gray-500">Property</dt>
        <dd className="font-mono text-xs break-all">
          {thread.property_id ?? "—"}
        </dd>

        <dt className="font-medium text-gray-500">Buyer</dt>
        <dd className="font-mono text-xs break-all">{thread.buyer_user_id}</dd>

        <dt className="font-medium text-gray-500">Owner</dt>
        <dd className="font-mono text-xs break-all">
          {thread.owner_user_id ?? "not set"}
        </dd>

        <dt className="font-medium text-gray-500">Created</dt>
        <dd>{new Date(thread.created_at).toLocaleString()}</dd>

        <dt className="font-medium text-gray-500">Updated</dt>
        <dd>{new Date(thread.updated_at).toLocaleString()}</dd>
      </dl>

      {participants.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Participants</h2>
          <ul className="space-y-1 text-sm">
            {participants.map((p) => (
              <li key={p.user_id} className="flex items-center gap-2">
                <span className="font-mono text-xs">
                  {p.user_id.slice(0, 8)}...
                </span>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                  {p.role}
                </span>
                <span className="text-xs text-gray-500">{p.permission}</span>
                {p.status !== "active" && (
                  <span className="text-xs text-red-500">({p.status})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {proposals.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Proposals</h2>
          <ul className="space-y-1 text-sm">
            {proposals.map((pr) => (
              <li key={pr.id} className="flex items-center gap-2">
                <span className="font-mono text-xs">
                  {pr.id.slice(0, 8)}...
                </span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold">
                  {pr.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(pr.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <hr className="border-gray-200" />

      <ThreadActionPanel
        threadId={thread.id}
        threadStatus={thread.status}
        isOwner={!!isOwner}
        proposalId={latestSubmitted?.id ?? null}
        proposalStatus={latestSubmitted?.status ?? null}
        onDecisionComplete={async () => {
          // Refresh thread + proposals after accept/decline/reject
          await Promise.all([refreshThread(), refreshProposals()]);
        }}
      />
    </div>
  );
}
