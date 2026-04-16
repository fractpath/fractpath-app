"use client";

import { useState } from "react";

export type ReviewRequestItem = {
  type: string;
  label: string;
};

export type AdminReviewRequest = {
  id: string;
  deal_id: string | null;
  property_id: string;
  status: "open" | "submitted" | "resolved";
  requested_items: ReviewRequestItem[];
  admin_note: string | null;
  homeowner_note: string | null;
  resolved_note: string | null;
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

type NextTriageStatus = "triage_in_progress" | "ready_for_deposit" | "ineligible";

const NEXT_STEP_OPTIONS: Array<{ value: NextTriageStatus; label: string; description: string }> = [
  {
    value: "triage_in_progress",
    label: "Back to triage in progress",
    description: "Continue manual review — information is sufficient to proceed.",
  },
  {
    value: "ready_for_deposit",
    label: "Ready for deposit request",
    description: "Move deal straight to deposit stage.",
  },
  {
    value: "ineligible",
    label: "Ineligible",
    description: "Mark deal ineligible based on information received.",
  },
];

const NEXT_STEP_LABEL: Record<NextTriageStatus, string> = {
  triage_in_progress: "Back to triage in progress",
  ready_for_deposit: "Ready for deposit request",
  ineligible: "Ineligible",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-yellow-100 text-yellow-800" },
  submitted: { label: "Homeowner submitted", cls: "bg-blue-100 text-blue-800" },
  resolved: { label: "Resolved", cls: "bg-green-100 text-green-800" },
};

type Props = {
  /** null when operating in property-review mode (no linked deal). */
  dealId: string | null;
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

  // Resolve flow state
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [nextTriageStatus, setNextTriageStatus] = useState<NextTriageStatus>("triage_in_progress");
  const [resolvedNote, setResolvedNote] = useState("");
  const [resolving, setResolving] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isResolved = request?.status === "resolved";
  const canResolve = request && (request.status === "open" || request.status === "submitted");

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // true = property-review mode (no linked deal); false = deal-review mode
  const isPropertyMode = dealId === null;

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
      const url = isPropertyMode
        ? `/api/admin/properties/${propertyId}/review-request`
        : `/api/admin/deals/${dealId}/review-request`;
      const bodyPayload = isPropertyMode
        ? { requested_items: items, admin_note: adminNote.trim() || null }
        : { property_id: propertyId, requested_items: items, admin_note: adminNote.trim() || null };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyPayload),
      });
      const body = await res.json();
      if (!body.ok) {
        setErr(body.error ?? "Failed to save request");
      } else {
        setRequest(body.request as AdminReviewRequest);
        setSuccess(
          request
            ? "Request updated."
            : isPropertyMode
              ? "Request created. Owner will be notified."
              : "Request created. Deal marked as additional information required.",
        );
      }
    } catch {
      setErr("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmResolve() {
    if (!request) return;
    setErr(null);
    setSuccess(null);
    setResolving(true);
    try {
      const url = isPropertyMode
        ? `/api/admin/properties/${propertyId}/review-request`
        : `/api/admin/deals/${dealId}/review-request`;
      const bodyPayload = isPropertyMode
        ? { request_id: request.id, resolved_note: resolvedNote.trim() || null }
        : {
            request_id: request.id,
            action: "resolve",
            next_triage_status: nextTriageStatus,
            resolved_note: resolvedNote.trim() || null,
          };
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(bodyPayload),
      });
      const body = await res.json();
      if (!body.ok) {
        setErr(body.error ?? "Failed to resolve request");
      } else {
        setRequest(body.request as AdminReviewRequest);
        setShowResolveForm(false);
        setSuccess(
          isPropertyMode
            ? "Request resolved."
            : `Request resolved. Deal advanced to: ${NEXT_STEP_LABEL[nextTriageStatus]}.`,
        );
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
        {/* Current request summary (when submitted or resolved) */}
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

        {/* Edit form — shown when not yet resolved and not showing confirm-resolve panel */}
        {!isResolved && !showResolveForm && (
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

              {canResolve && (
                <button
                  type="button"
                  onClick={() => {
                    setErr(null);
                    setSuccess(null);
                    setShowResolveForm(true);
                  }}
                  className="rounded px-3 py-1.5 text-xs font-medium border hover:bg-muted"
                >
                  Resolve…
                </button>
              )}
            </div>
          </div>
        )}

        {/* Two-phase resolve confirmation panel */}
        {!isResolved && showResolveForm && (
          <div className="space-y-4 rounded-md border border-orange-200 bg-orange-50/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">
              Confirm resolution
            </div>

            {/* Deal-mode only: next triage step picker */}
            {!isPropertyMode && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Next step for the linked deal
                </div>
                <div className="space-y-2">
                  {NEXT_STEP_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="radio"
                        name="next_triage_status"
                        value={opt.value}
                        checked={nextTriageStatus === opt.value}
                        onChange={() => setNextTriageStatus(opt.value)}
                        className="mt-0.5 h-3.5 w-3.5 accent-foreground"
                      />
                      <span className="text-sm">
                        <span className="font-medium">{opt.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {opt.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Outcome note (optional — admin only)
              </label>
              <textarea
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring bg-white"
                placeholder="What was resolved? What actions were taken?…"
                value={resolvedNote}
                onChange={(e) => setResolvedNote(e.target.value)}
              />
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmResolve}
                disabled={resolving}
                className="rounded px-3 py-1.5 text-xs font-medium bg-foreground text-background hover:opacity-80 disabled:opacity-50"
              >
                {resolving ? "Resolving…" : "Confirm resolve"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResolveForm(false);
                  setErr(null);
                }}
                disabled={resolving}
                className="rounded px-3 py-1.5 text-xs font-medium border hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Resolved state */}
        {isResolved && (
          <div className="space-y-3">
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2.5 space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-800">
                Resolved
              </div>
              {request?.resolved_at && (
                <p className="text-xs text-green-700">
                  {new Date(request.resolved_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              )}
              {(request as any)?.resolved_note && (
                <div className="mt-1">
                  <div className="text-xs text-green-700 font-medium">Outcome note</div>
                  <p className="text-sm whitespace-pre-wrap text-green-900 mt-0.5">
                    {(request as any).resolved_note}
                  </p>
                </div>
              )}
            </div>

            {!isPropertyMode && (
              <a
                href={`/deal/${dealId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs underline text-muted-foreground hover:text-foreground"
              >
                View linked deal →
              </a>
            )}

            {success && <p className="text-xs text-green-700">{success}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
