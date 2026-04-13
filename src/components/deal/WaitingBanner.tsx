"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  threadId: string;
  isSender: boolean;
};

export function WaitingBanner({ threadId, isSender }: Props) {
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

  return (
    <div
      className="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950"
      data-testid="waiting-banner"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
          </span>
          <div>
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Waiting for the other party to respond
            </div>
            <div className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
              Your proposal has been sent. You will be notified when they respond.
            </div>
          </div>
        </div>
        {isSender && (
          <button
            type="button"
            disabled={busy}
            onClick={handleWithdraw}
            className="shrink-0 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-600 dark:bg-blue-900 dark:text-blue-200"
            data-testid="withdraw-offer-btn"
          >
            {busy ? "Withdrawing..." : "Withdraw"}
          </button>
        )}
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-600" data-testid="withdraw-error">
          {error}
        </div>
      )}
    </div>
  );
}
