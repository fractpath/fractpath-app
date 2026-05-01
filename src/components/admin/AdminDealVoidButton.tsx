"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminDealVoidButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleVoid() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setErr("A reason is required before voiding.");
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/void`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? `Void failed (${res.status})`);
      }
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Network error");
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100"
      >
        Void deal
      </button>
    );
  }

  return (
    <div className="rounded border border-orange-200 bg-orange-50 p-4 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-orange-900">Void this deal?</p>
        <p className="text-xs text-orange-800">
          This closes all active threads and proposals without releasing the property owner
          claim or altering property verification. The deal will be marked voided and will
          no longer block new test flows. This action is recorded in the audit log.
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-orange-900" htmlFor="void-reason">
          Reason (required)
        </label>
        <textarea
          id="void-reason"
          rows={3}
          disabled={pending}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Test deal — owner-to-buyer flow testing complete"
          className="w-full rounded border border-orange-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-50"
        />
      </div>
      {err && (
        <p className="text-xs text-red-700 font-medium">{err}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleVoid}
          disabled={pending || !reason.trim()}
          className="inline-flex items-center rounded border border-orange-500 bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {pending ? "Voiding…" : "Confirm void"}
        </button>
        <button
          onClick={() => { setOpen(false); setReason(""); setErr(null); }}
          disabled={pending}
          className="inline-flex items-center rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
