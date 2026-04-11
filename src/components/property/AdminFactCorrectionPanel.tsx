"use client";

import { useState } from "react";
import type { PropertyFactCorrection } from "@/lib/property/photos";

type Props = {
  propertyId: string;
  initialCorrections: PropertyFactCorrection[];
};

const STATUS_BADGE: Record<
  PropertyFactCorrection["review_status"],
  { label: string; cls: string }
> = {
  pending: {
    label: "Pending",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  approved: {
    label: "Approved",
    cls: "bg-green-50 text-green-700 border-green-200",
  },
  rejected: {
    label: "Rejected",
    cls: "bg-red-50 text-red-700 border-red-200",
  },
};

function StatusBadge({ status }: { status: PropertyFactCorrection["review_status"] }) {
  const { label, cls } = STATUS_BADGE[status];
  return (
    <span
      className={`inline-block text-[11px] font-medium border rounded px-1.5 py-0.5 ${cls}`}
    >
      {label}
    </span>
  );
}

type ReviewState = {
  action: "approve" | "reject";
  note: string;
};

export function AdminFactCorrectionPanel({
  propertyId,
  initialCorrections,
}: Props) {
  const [corrections, setCorrections] =
    useState<PropertyFactCorrection[]>(initialCorrections);
  const [reviewing, setReviewing] = useState<Record<string, ReviewState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = corrections.filter((c) => c.review_status === "pending");
  const resolved = corrections.filter((c) => c.review_status !== "pending");

  function startReview(id: string, action: "approve" | "reject") {
    setReviewing((prev) => ({ ...prev, [id]: { action, note: "" } }));
  }

  function cancelReview(id: string) {
    setReviewing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function submitReview(correctionId: string) {
    const state = reviewing[correctionId];
    if (!state) return;
    setBusy(correctionId);
    setError(null);

    const res = await fetch(
      `/api/admin/properties/${propertyId}/corrections/${correctionId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: state.action,
          reviewer_note: state.note.trim() || null,
        }),
      },
    );

    if (res.ok) {
      const data = await res.json();
      setCorrections((prev) =>
        prev.map((c) => (c.id === correctionId ? data.correction : c)),
      );
      cancelReview(correctionId);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to submit review.");
    }
    setBusy(null);
  }

  if (corrections.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/20 px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No fact corrections submitted for this property.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Pending ────────────────────────────────────────────────────────── */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">
            Pending review ({pending.length})
          </h4>
          {pending.map((c) => {
            const reviewState = reviewing[c.id];
            const isBusy = busy === c.id;
            return (
              <div
                key={c.id}
                className="rounded-lg border bg-background p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-semibold">{c.display_label}</p>
                    <div className="flex items-center gap-4 text-sm">
                      <span>
                        <span className="text-muted-foreground">Recorded: </span>
                        <span className="font-medium">
                          {c.canonical_value ?? "—"}
                        </span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Suggested: </span>
                        <span className="font-semibold text-foreground">
                          {c.owner_submitted_value}
                        </span>
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Submitted{" "}
                      {new Date(c.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <StatusBadge status={c.review_status} />
                </div>

                {/* Review form */}
                {reviewState ? (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-xs font-medium capitalize text-foreground">
                      {reviewState.action === "approve"
                        ? "Confirm approval"
                        : "Confirm rejection"}
                    </p>
                    <textarea
                      rows={2}
                      value={reviewState.note}
                      onChange={(e) =>
                        setReviewing((prev) => ({
                          ...prev,
                          [c.id]: { ...prev[c.id], note: e.target.value },
                        }))
                      }
                      placeholder="Optional note for the owner…"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => submitReview(c.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                          reviewState.action === "approve"
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-destructive hover:bg-destructive/90"
                        }`}
                      >
                        {isBusy && (
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        )}
                        {reviewState.action === "approve"
                          ? "Approve"
                          : "Reject"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => cancelReview(c.id)}
                        className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted/50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 border-t pt-3">
                    <button
                      type="button"
                      onClick={() => startReview(c.id, "approve")}
                      className="rounded-lg bg-green-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => startReview(c.id, "reject")}
                      className="rounded-lg border border-destructive/50 text-destructive px-3 py-1.5 text-sm font-medium hover:bg-destructive/10"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Resolved ───────────────────────────────────────────────────────── */}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">
            Resolved ({resolved.length})
          </h4>
          {resolved.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border bg-muted/20 p-4 flex items-start justify-between gap-4"
            >
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-medium">{c.display_label}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Recorded: {c.canonical_value ?? "—"}</span>
                  <span>Suggested: {c.owner_submitted_value}</span>
                </div>
                {c.reviewer_note && (
                  <p className="text-xs text-muted-foreground italic mt-1">
                    Note: {c.reviewer_note}
                  </p>
                )}
              </div>
              <StatusBadge status={c.review_status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
