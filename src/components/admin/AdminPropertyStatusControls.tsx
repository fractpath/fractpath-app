"use client";

import { useState } from "react";

type Status = "unverified" | "under_review" | "verified" | "archived";
const STATUSES: Status[] = ["unverified", "under_review", "verified", "archived"];

export function AdminPropertyStatusControls({
  propertyId,
  currentStatus,
}: {
  propertyId: string;
  currentStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(currentStatus);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/set-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      const text = await res.text();
      if (!res.ok) {
        setErr(text || `HTTP ${res.status}`);
        return;
      }
      window.location.href = `/admin/properties/${propertyId}`;
    } catch (e: any) {
      setErr(e?.message ?? "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="text-sm font-medium">Admin status override</div>

      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-xs text-muted-foreground">Status</label>
        <select
          className="text-sm border rounded px-2 py-1"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          disabled={pending}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="text-xs px-3 py-1 rounded border hover:bg-muted disabled:opacity-50"
          disabled={pending || status === currentStatus}
          onClick={submit}
        >
          {pending ? "Saving..." : "Set status"}
        </button>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Notes (optional)
        </label>
        <textarea
          className="w-full text-sm border rounded p-2 min-h-[70px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason for override..."
          disabled={pending}
        />
      </div>

      {err && <div className="text-xs text-red-600 break-words">{err}</div>}
    </div>
  );
}
