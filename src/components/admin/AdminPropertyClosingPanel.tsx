"use client";

import { useState } from "react";

type ClosingReviewStatus = "pending" | "issue_found" | "ready" | null;

interface Props {
  propertyId: string;
  dealId: string | null;
  closingReviewStatus: ClosingReviewStatus;
  closingReviewNote: string | null;
}

const STATUS_META: Record<
  NonNullable<ClosingReviewStatus>,
  { label: string; badgeCls: string }
> = {
  pending: { label: "Closing review pending", badgeCls: "bg-blue-100 text-blue-800" },
  issue_found: { label: "Issue found", badgeCls: "bg-red-100 text-red-800" },
  ready: { label: "Ready for closing", badgeCls: "bg-emerald-100 text-emerald-800" },
};

export function AdminPropertyClosingPanel({
  propertyId,
  dealId,
  closingReviewStatus: initialStatus,
  closingReviewNote: initialNote,
}: Props) {
  const [status, setStatus] = useState<ClosingReviewStatus>(initialStatus);
  const [note, setNote] = useState(initialNote ?? "");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function act(action: string) {
    setPendingAction(action);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/closing-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note: note || null }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Request failed");
      } else {
        const newStatus = json.closing_review_status as ClosingReviewStatus;
        setStatus(newStatus);
        setSuccess(
          newStatus
            ? `Status updated to "${STATUS_META[newStatus]?.label ?? newStatus}".${dealId ? " Notification queued." : ""}`
            : "Status reset.",
        );
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setPendingAction(null);
    }
  }

  const statusMeta = status ? STATUS_META[status] : null;
  const busy = pendingAction !== null;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-muted-foreground text-xs">Current status:</span>
        {statusMeta ? (
          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${statusMeta.badgeCls}`}>
            {statusMeta.label}
          </span>
        ) : (
          <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-gray-100 text-gray-500">
            Not started
          </span>
        )}
        {!dealId && (
          <span className="text-xs text-muted-foreground ml-auto italic">
            No linked deal — notifications will be skipped
          </span>
        )}
      </div>

      {/* Evidence note */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Decision note / evidence reference
          <span className="font-normal"> (optional)</span>
        </label>
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm resize-none min-h-[64px] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          placeholder="E.g. Title search complete — no liens found. Doc ref: title-report-2026-03.pdf"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          This note is stored on the property record and logged in the audit trail.
          {dealId && " A customer notification will include any note you enter."}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {status !== "pending" && (
          <button
            onClick={() => act("pending")}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {pendingAction === "pending" ? "Setting…" : "Set: Closing review pending"}
          </button>
        )}
        {status !== "issue_found" && (
          <button
            onClick={() => act("issue_found")}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {pendingAction === "issue_found" ? "Setting…" : "Set: Issue found"}
          </button>
        )}
        {status !== "ready" && (
          <button
            onClick={() => act("ready")}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {pendingAction === "ready" ? "Setting…" : "Set: Ready for closing"}
          </button>
        )}
        {status !== null && (
          <button
            onClick={() => act("reset")}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-xs font-medium border hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {pendingAction === "reset" ? "Resetting…" : "Reset"}
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
      {success && (
        <p className="text-xs text-emerald-700 font-medium">{success}</p>
      )}

      {/* Stage guide */}
      <div className="rounded-md bg-muted/30 border px-3 py-2 text-xs text-muted-foreground space-y-0.5">
        <div className="font-medium text-foreground mb-1">Stage guide (property-owned)</div>
        <div><span className="font-medium">Closing review pending</span> — Title search and final documentation are being reviewed.</div>
        <div><span className="font-medium">Issue found</span> — A closing blocker has been identified. Customer is notified.</div>
        <div><span className="font-medium">Ready for closing</span> — All closing checks passed. Deal can proceed to close.</div>
        <div className="pt-1 italic">
          Property artifacts (title docs, review notes) should be uploaded to the property document section.
          Deal artifacts (signed docs, servicing) are managed on the deal review page.
        </div>
      </div>
    </div>
  );
}
