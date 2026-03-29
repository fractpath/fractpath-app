"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminReopenNegotiationButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleReopen() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/reopen-negotiation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error ?? "Request failed");
      } else {
        router.refresh();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 items-end">
      <button
        disabled={busy}
        onClick={handleReopen}
        className="text-xs rounded border px-2.5 py-1.5 bg-white hover:bg-muted disabled:opacity-50 cursor-pointer whitespace-nowrap"
      >
        {busy ? "Processing…" : "Reopen negotiation"}
      </button>
      {err && <p className="text-xs text-red-700">{err}</p>}
    </div>
  );
}
