"use client";

import { useState } from "react";

export type PropertyReviewStatus =
  | "under_review"
  | "information_requested"
  | "ready_for_deposit"
  | "amv_ordered"
  | "amv_complete"
  | "property_review_complete"
  | "property_review_expired";

export const REVIEW_STATUS_META: Record<
  PropertyReviewStatus,
  { label: string; badgeCls: string; description: string }
> = {
  under_review: {
    label: "Under review",
    badgeCls: "bg-blue-100 text-blue-800",
    description: "Diligence in progress.",
  },
  information_requested: {
    label: "Information requested",
    badgeCls: "bg-yellow-100 text-yellow-800",
    description: "Waiting for homeowner to supply requested information.",
  },
  ready_for_deposit: {
    label: "Ready for deposit",
    badgeCls: "bg-green-100 text-green-800",
    description: "Sufficient information collected to request deposit.",
  },
  amv_ordered: {
    label: "AMV ordered",
    badgeCls: "bg-blue-100 text-blue-800",
    description: "Automated market valuation ordered and pending.",
  },
  amv_complete: {
    label: "AMV complete",
    badgeCls: "bg-green-100 text-green-800",
    description: "Market valuation received.",
  },
  property_review_complete: {
    label: "Review complete",
    badgeCls: "bg-emerald-100 text-emerald-800",
    description: "Property review fully complete. Reusable for associated deals.",
  },
  property_review_expired: {
    label: "Review expired",
    badgeCls: "bg-gray-100 text-gray-600",
    description: "Review has passed its freshness window.",
  },
};

const REVIEW_STATUSES = Object.keys(REVIEW_STATUS_META) as PropertyReviewStatus[];

type Props = {
  propertyId: string;
  currentReviewStatus: PropertyReviewStatus | null;
};

export function AdminPropertyReviewControls({ propertyId, currentReviewStatus }: Props) {
  const [selectedStatus, setSelectedStatus] = useState<PropertyReviewStatus>(
    currentReviewStatus ?? "under_review",
  );
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleApply() {
    setErr(null);
    setSuccess(null);
    if (selectedStatus === currentReviewStatus) {
      setErr("Select a different status to apply.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/set-review-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: selectedStatus, note: note.trim() || null }),
      });
      const body = await res.json();
      if (!body.ok) {
        setErr(body.error ?? "Failed to update review status");
      } else {
        setSuccess(`Review status updated to: ${REVIEW_STATUS_META[selectedStatus].label}`);
        // Reload so all server-rendered panels reflect the change
        window.location.reload();
      }
    } catch {
      setErr("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">Set status</label>
        <select
          className="text-sm border rounded px-2 py-1 bg-background"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as PropertyReviewStatus)}
          disabled={pending}
        >
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REVIEW_STATUS_META[s].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleApply}
          disabled={pending || selectedStatus === currentReviewStatus}
          className="text-xs px-3 py-1 rounded border hover:bg-muted disabled:opacity-50"
        >
          {pending ? "Applying…" : "Apply"}
        </button>
      </div>

      {selectedStatus !== currentReviewStatus && (
        <p className="text-xs text-muted-foreground">
          {REVIEW_STATUS_META[selectedStatus].description}
        </p>
      )}

      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Review note (optional — admin only)
        </label>
        <textarea
          className="w-full text-sm border rounded p-2 min-h-[64px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for status change or review observation…"
          disabled={pending}
        />
      </div>

      {err && <div className="text-xs text-red-600">{err}</div>}
      {success && <div className="text-xs text-green-700">{success}</div>}
    </div>
  );
}
