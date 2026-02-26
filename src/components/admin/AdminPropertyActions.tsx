"use client";

import { useState } from "react";

export function AdminPropertyActions({
  propertyId,
  status,
}: {
  propertyId: string;
  status: string;
}) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(path: string, notes: string, redirectTo: string) {
    setErr(null);
    setPending(true);

    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });

      const text = await res.text();
      if (!res.ok) {
        setErr(text || `HTTP ${res.status}`);
        setPending(false);
        return;
      }

      window.location.href = redirectTo;
    } catch (e: any) {
      setErr(e?.message ?? "Request failed");
      setPending(false);
    }
  }

  const showStartReview = status === "unverified";
  const showVerify = status === "under_review";

  if (!showStartReview && !showVerify) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {showStartReview && (
          <button
            type="button"
            className="text-xs px-3 py-1 rounded border hover:bg-muted disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              post(
                `/api/admin/properties/${propertyId}/start-review`,
                "Initial review",
                `/admin/properties/${propertyId}`,
              )
            }
          >
            {pending ? "Working..." : "Start review"}
          </button>
        )}

        {showVerify && (
          <button
            type="button"
            className="text-xs px-3 py-1 rounded border hover:bg-muted disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              post(
                `/api/admin/properties/${propertyId}/verify`,
                "Verified for participation",
                `/admin/properties?status=queue`,
              )
            }
          >
            {pending ? "Working..." : "Verify"}
          </button>
        )}
      </div>

      {err && <div className="text-xs text-red-600 break-words">{err}</div>}
    </div>
  );
}
