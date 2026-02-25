"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminPropertyActions({
  propertyId,
  status,
}: {
  propertyId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function post(path: string, notes: string) {
    setErr(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });

    const text = await res.text();
    if (!res.ok) {
      setErr(text || `HTTP ${res.status}`);
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {status === "unverified" && (
          <button
            className="text-xs px-3 py-1 rounded border hover:bg-muted disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              post(
                `/api/admin/properties/${propertyId}/start-review`,
                "Initial review",
              )
            }
          >
            Start review
          </button>
        )}

        {status === "under_review" && (
          <button
            className="text-xs px-3 py-1 rounded border hover:bg-muted disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              post(
                `/api/admin/properties/${propertyId}/verify`,
                "Verified for participation",
              )
            }
          >
            Verify
          </button>
        )}
      </div>

      {err && (
        <div className="text-xs text-red-600 break-words">{err}</div>
      )}
    </div>
  );
}
