"use client";

import { useState } from "react";

export type HomeownerReviewRequest = {
  id: string;
  status: "open" | "submitted" | "resolved";
  requested_items: Array<{ type: string; label: string }>;
  admin_note: string | null;
  submitted_at: string | null;
};

type Props = {
  request: HomeownerReviewRequest;
  propertyId: string;
  onOpenEdit: () => void;
  onOpenDocuments?: () => void;
};

export function ReviewRequestPanel({
  request: initialRequest,
  propertyId,
  onOpenEdit,
}: Props) {
  const [request, setRequest] = useState<HomeownerReviewRequest>(initialRequest);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isSubmitted = request.status === "submitted";

  async function handleSubmit() {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/me/properties/${propertyId}/review-request-submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ request_id: request.id, homeowner_note: note }),
        },
      );
      const body = await res.json();
      if (!body.ok) {
        setErr(body.error ?? "Failed to submit. Please try again.");
      } else {
        setRequest(body.request as HomeownerReviewRequest);
      }
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Additional information required</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSubmitted
              ? "Your updates have been received. Our team will review them shortly."
              : "FractPath needs a few more details before this review can continue."}
          </p>
        </div>
        {isSubmitted && (
          <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800">
            Updates submitted
          </span>
        )}
      </div>

      {/* Requested items */}
      {request.requested_items.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Requested items
          </p>
          <ul className="space-y-1">
            {request.requested_items.map((item) => (
              <li key={item.type} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-yellow-600">•</span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Admin note */}
      {request.admin_note && (
        <div className="rounded-md bg-white border border-yellow-200 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Note from FractPath</p>
          <p className="text-sm whitespace-pre-wrap">{request.admin_note}</p>
        </div>
      )}

      {/* CTAs */}
      {!isSubmitted && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenEdit}
            className="rounded px-3 py-1.5 text-xs font-medium border bg-white hover:bg-muted"
          >
            Edit property details
          </button>
          <button
            type="button"
            onClick={onOpenEdit}
            className="rounded px-3 py-1.5 text-xs font-medium border bg-white hover:bg-muted"
          >
            Upload / replace documents
          </button>
        </div>
      )}

      {/* Note + submit */}
      {!isSubmitted && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground block">
            Your note (optional)
          </label>
          <textarea
            rows={3}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Add any context or explanation here…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded px-4 py-1.5 text-xs font-semibold bg-foreground text-background hover:opacity-80 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit updates for review"}
          </button>
        </div>
      )}

      {isSubmitted && request.submitted_at && (
        <p className="text-xs text-muted-foreground">
          Submitted{" "}
          {new Date(request.submitted_at).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
    </div>
  );
}
