"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminDealDeleteButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/delete`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? `Delete failed (${res.status})`);
      }
      router.push("/admin/deals?triage=draft");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Network error");
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
      >
        Delete deal
      </button>
    );
  }

  return (
    <div className="rounded border border-red-200 bg-red-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-red-800">
        Permanently delete this draft deal?
      </p>
      <p className="text-xs text-red-700">
        This removes the deal, its snapshots, events, and any stale threads. This action cannot be undone.
      </p>
      {err && <p className="text-xs text-red-600 font-medium">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={pending}
          className="inline-flex items-center rounded border border-red-400 bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          onClick={() => { setConfirming(false); setErr(null); }}
          disabled={pending}
          className="inline-flex items-center rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
