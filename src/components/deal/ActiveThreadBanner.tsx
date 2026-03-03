"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  threadId: string;
  threadStatus: string;
};

export function ActiveThreadBanner({ threadId, threadStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWithdraw = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/threads/${threadId}/withdraw`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? `Withdraw failed (${res.status})`);
      }
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }, [threadId, router]);

  if (threadStatus !== "pending_owner") return null;

  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4" data-testid="active-thread-banner">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-amber-900">
            This offer is under review. Withdraw to make changes.
          </div>
          <div className="mt-1 text-xs text-amber-700">
            While your offer is pending, the deal calculator is locked.
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={handleWithdraw}
          className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          data-testid="withdraw-offer-btn"
        >
          {busy ? "Withdrawing..." : "Withdraw Offer"}
        </button>
      </div>
      {error ? (
        <div className="mt-2 text-xs text-red-600" data-testid="withdraw-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}
