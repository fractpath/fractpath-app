"use client";

import { useState } from "react";

export type ReviewRequestItem = {
  type: string;
  label: string;
};

export type AdminReviewRequest = {
  id: string;
  deal_id: string;
  property_id: string;
  status: "open" | "submitted" | "resolved";
  requested_items: ReviewRequestItem[];
  admin_note: string | null;
  homeowner_note: string | null;
  submitted_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

const ALL_ITEM_TYPES: ReviewRequestItem[] = [
  { type: "clarify_ownership", label: "Clarify ownership type" },
  { type: "clarify_title_issue", label: "Explain the title issue mentioned" },
  { type: "update_debt_estimate", label: "Update total debt estimate" },
  { type: "upload_mortgage_statement", label: "Upload a recent mortgage statement" },
  { type: "upload_heloc_statement", label: "Upload a HELOC statement" },
  { type: "upload_tax_or_judgment_document", label: "Upload tax or judgment document" },
  { type: "upload_trust_or_estate_document", label: "Upload trust or estate document" },
  { type: "explain_condition_issue", label: "Explain the condition issue" },
  { type: "explain_fmv_basis", label: "Explain FMV estimate basis" },
  { type: "other", label: "Other (see admin note)" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-yellow-100 text-yellow-800" },
  submitted: { label: "Homeowner submitted", cls: "bg-blue-100 text-blue-800" },
  resolved: { label: "Resolved", cls: "bg-green-100 text-green-800" },
};

type Props = {
  dealId: string;
  propertyId: string;
  initialRequest: AdminReviewRequest | null;
};

export function AdminReviewRequestPanel({ dealId, propertyId, initialRequest }: Props) {
  const [request, setRequest] = useState<AdminReviewRequest | null>(initialRequest);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    new Set(initialRequest?.requested_items.map((i) => i.type) ?? []),
  );
  const [adminNote, setAdminNote] = useState(initialRequest?.admin_note ?? "");
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isResolved = request?.status === "resolved";

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function handleSave() {
    setErr(null);
    setSuccess(null);
    if (selectedTypes.size === 0) {
      setErr("Select at least one requested item.");
      return;
    }
    setSaving(true);
    try {
      const items = ALL_ITEM_TYPES.filter((t) => selectedTypes.has(t.type));
      const res = await fetch(`/api/admin/deals/${dealId}/review-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          property_id: propertyId,
          requested_items: items,
          admin_note: adminNote.trim() || null,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setErr(body.error ?? "Failed to save request");
      } else {
        setRequest(body.request as AdminReviewRequest);
        setSuccess(
          request ? "Request updated." : "Request created. Deal marked as additional information required.",
        );
      }
    } catch {
      setErr("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve() {
    if (!request) return;
    setErr(null);
    setSuccess(null);
    setResolving(true);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/review-request`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ request_id: request.id, action: "resolve" }),
      });
      const body = await res.json();
      if (!body.ok) {
        setErr(body.error ?? "Failed to resolve request");
      } else {
        setRequest(body.request as AdminReviewRequest);
        setSuccess("Request marked resolved.");
      }
    } catch {
      setErr("Network error");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center gap-2">
        Additional information request
        {request && (() => {
          const b = STATUS_BADGE[request.status];
          return b ? (
            <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${b.cls}`}>
              {b.label}
            </span>
          ) : null;
        })()}
      </div>

      <div className="p-4 text-sm space-y-4">
        {/* Current request summary */}
        {request && request.status !== "open" && (
          <div className="rounded-md bg-muted/30 px-3 py-2 space-y-2">
            <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
              Current request
            </div>
            <div className="flex flex-wrap gap-1">
              {request.requested_items.map((item) => (
                <span
                  key={item.type}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-foreground"
                >
                  {item.label}
                </span>
              ))}
            </div>
            {request.homeowner_note && (
              <div>
                <div className="text-xs text-muted-foreground">Homeowner note</div>
                <div className="text-sm mt-0.5 whitespace-pre-wrap">
                  {request.homeowner_note}
                </div>
              </div>
            )}
            {request.submitted_at && (
              <div className="text-xs text-muted-foreground">
                Submitted{" "}
                {new Date(request.submitted_at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </div>
            )}
          </div>
        )}

        {/* Form — disabled when resolved */}
        {!isResolved && (
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Requested items
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {ALL_ITEM_TYPES.map((item) => (
                  <label key={item.type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTypes.has(item.type)}
                      onChange={() => toggleType(item.type)}
                      className="h-3.5 w-3.5 rounded border-gray-300 accent-foreground"
                    />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Admin note (optional — visible to homeowner)
              </label>
              <textarea
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Additional context for the homeowner…"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}
            {success && <p className="text-xs text-green-700">{success}</p>}

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded px-3 py-1.5 text-xs font-medium bg-foreground text-background hover:opacity-80 disabled:opacity-50"
              >
                {saving ? "Saving…" : request ? "Update request" : "Create request"}
              </button>

              {request && request.status !== "resolved" && (
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={resolving}
                  className="rounded px-3 py-1.5 text-xs font-medium border hover:bg-muted disabled:opacity-50"
                >
                  {resolving ? "Resolving…" : "Mark resolved"}
                </button>
              )}
            </div>
          </div>
        )}

        {isResolved && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This request has been resolved.{" "}
              {request?.resolved_at && (
                <span>
                  Resolved on{" "}
                  {new Date(request.resolved_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  .
                </span>
              )}
            </p>
            {success && <p className="text-xs text-green-700">{success}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
