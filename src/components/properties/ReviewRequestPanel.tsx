"use client";

import { useState } from "react";
import { captureAppEvent } from "@/lib/analytics/events";

export type HomeownerReviewRequest = {
  id: string;
  status: "open" | "submitted" | "resolved";
  requested_items: Array<{ type: string; label: string }>;
  admin_note: string | null;
  homeowner_note: string | null;
  submitted_at: string | null;
  resolved_note: string | null;
  resolved_at: string | null;
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

  const isOpen = request.status === "open";
  const isSubmitted = request.status === "submitted";
  const isResolved = request.status === "resolved";

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
        captureAppEvent("property_verification_submitted", {
          property_id: propertyId,
        });
        setRequest(body.request as HomeownerReviewRequest);
      }
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isResolved) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-green-900">Information request resolved</h2>
            <p className="mt-1 text-xs text-green-700">
              Our team reviewed the information you provided. No further action is needed.
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-800 border border-green-200">
            Resolved
          </span>
        </div>

        {request.requested_items.length > 0 && (
          <div>
            <p className="text-xs font-medium text-green-800 uppercase tracking-wide mb-1.5">
              Items requested
            </p>
            <ul className="space-y-1">
              {request.requested_items.map((item) => (
                <li key={item.type} className="flex items-start gap-2 text-sm text-green-900">
                  <span className="mt-0.5 text-green-600">✓</span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {request.resolved_note && (
          <div className="rounded-md bg-white border border-green-200 px-3 py-2">
            <p className="text-xs font-medium text-green-700 mb-1">Note from FractPath</p>
            <p className="text-sm whitespace-pre-wrap text-green-900">{request.resolved_note}</p>
          </div>
        )}

        {request.resolved_at && (
          <p className="text-xs text-green-700">
            Resolved{" "}
            {new Date(request.resolved_at).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </div>
    );
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

      {/* Submitted state: show homeowner note + timestamp */}
      {isSubmitted && (
        <div className="space-y-1.5">
          {request.homeowner_note && (
            <div className="rounded-md bg-white border border-yellow-200 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Your note</p>
              <p className="text-sm whitespace-pre-wrap">{request.homeowner_note}</p>
            </div>
          )}
          {request.submitted_at && (
            <p className="text-xs text-muted-foreground">
              Submitted{" "}
              {new Date(request.submitted_at).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}
        </div>
      )}

      {/* CTAs — only when open */}
      {isOpen && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenEdit}
            className="rounded px-3 py-1.5 text-xs font-medium border bg-white hover:bg-muted"
          >
            Update property details
          </button>
        </div>
      )}

      {/* Note + submit — only when open */}
      {isOpen && (
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
    </div>
  );
}
