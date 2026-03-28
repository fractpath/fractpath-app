"use client";

import { useState } from "react";

type ServicingStatus = "active" | "issue" | null;

interface Props {
  dealId: string;
  threadStatus: string | null;
  packetStatus: string | null;
  servicingStatus: ServicingStatus;
  servicingNote: string | null;
}

const SERVICING_META: Record<
  NonNullable<ServicingStatus>,
  { label: string; badgeCls: string }
> = {
  active: { label: "Servicing active", badgeCls: "bg-emerald-100 text-emerald-800" },
  issue: { label: "Servicing issue", badgeCls: "bg-red-100 text-red-800" },
};

export function AdminDealServicingPanel({
  dealId,
  threadStatus: initialThreadStatus,
  packetStatus,
  servicingStatus: initialServicingStatus,
  servicingNote: initialServicingNote,
}: Props) {
  const [threadStatus, setThreadStatus] = useState(initialThreadStatus);
  const [servicingStatus, setServicingStatus] = useState<ServicingStatus>(
    initialServicingStatus,
  );
  const [note, setNote] = useState(initialServicingNote ?? "");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isDealClosed = threadStatus === "closed";
  const busy = pendingAction !== null;

  async function closeDeal() {
    setPendingAction("close_deal");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Request failed");
      } else {
        setThreadStatus("closed");
        setSuccess("Deal marked as closed. Notification queued.");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setPendingAction(null);
    }
  }

  async function setServicing(action: "active" | "issue" | "reset") {
    setPendingAction(action);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/servicing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Request failed");
      } else {
        const newStatus = json.servicing_status as ServicingStatus;
        setServicingStatus(newStatus);
        const label =
          newStatus
            ? SERVICING_META[newStatus]?.label ?? newStatus
            : "Reset";
        setSuccess(`Servicing status updated: ${label}. Notification queued.`);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setPendingAction(null);
    }
  }

  const servicingMeta = servicingStatus ? SERVICING_META[servicingStatus] : null;

  return (
    <div className="space-y-4 text-sm">
      {/* Deal closed status */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-muted-foreground text-xs">Deal close:</span>
        {isDealClosed ? (
          <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-gray-800 text-white">
            Closed
          </span>
        ) : (
          <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-gray-100 text-gray-500">
            Not closed
          </span>
        )}
        <span className="text-muted-foreground text-xs mx-2">·</span>
        <span className="text-muted-foreground text-xs">Servicing:</span>
        {servicingMeta ? (
          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${servicingMeta.badgeCls}`}>
            {servicingMeta.label}
          </span>
        ) : (
          <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-gray-100 text-gray-500">
            Not started
          </span>
        )}
      </div>

      {/* Evidence note */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Decision note / evidence reference
          <span className="font-normal"> (optional, logged in audit trail)</span>
        </label>
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm resize-none min-h-[56px] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          placeholder="E.g. Signed agreement confirmed. Servicing transfer complete on 2026-03-28."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          rows={2}
        />
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {/* Deal close */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium w-24 shrink-0 text-muted-foreground">
            Deal close
          </span>
          {!isDealClosed ? (
            <button
              onClick={closeDeal}
              disabled={busy}
              title={
                packetStatus !== "completed"
                  ? "Signature packet not yet marked complete — confirm before closing"
                  : undefined
              }
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              {pendingAction === "close_deal" ? "Closing…" : "Close deal"}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              Deal is already closed
            </span>
          )}
          {packetStatus !== "completed" && !isDealClosed && (
            <span className="text-xs text-yellow-700">
              ⚠ Signature packet status: {packetStatus ?? "none"} — verify before closing
            </span>
          )}
        </div>

        {/* Servicing */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium w-24 shrink-0 text-muted-foreground">
            Servicing
          </span>
          {isDealClosed && servicingStatus !== "active" && (
            <button
              onClick={() => setServicing("active")}
              disabled={busy}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {pendingAction === "active" ? "Setting…" : "Set: Servicing active"}
            </button>
          )}
          {servicingStatus === "active" && (
            <button
              onClick={() => setServicing("issue")}
              disabled={busy}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {pendingAction === "issue" ? "Setting…" : "Set: Servicing issue"}
            </button>
          )}
          {servicingStatus === "issue" && (
            <button
              onClick={() => setServicing("active")}
              disabled={busy}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {pendingAction === "active" ? "Resolving…" : "Resolve issue — set active"}
            </button>
          )}
          {servicingStatus !== null && (
            <button
              onClick={() => setServicing("reset")}
              disabled={busy}
              className="px-3 py-1.5 rounded-md text-xs font-medium border hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {pendingAction === "reset" ? "Resetting…" : "Reset servicing"}
            </button>
          )}
          {!isDealClosed && (
            <span className="text-xs text-muted-foreground italic">
              Close the deal first before activating servicing
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
      {success && (
        <p className="text-xs text-emerald-700 font-medium">{success}</p>
      )}

      {/* Stage guide */}
      <div className="rounded-md bg-muted/30 border px-3 py-2 text-xs text-muted-foreground space-y-0.5">
        <div className="font-medium text-foreground mb-1">Stage guide (deal-owned)</div>
        <div><span className="font-medium">Close deal</span> — Sets the deal thread to closed. Signed agreement should already be in the signature section above.</div>
        <div><span className="font-medium">Servicing active</span> — Signals that recurring payments have commenced. Customer sees "Payments active".</div>
        <div><span className="font-medium">Servicing issue</span> — Flags a servicing problem. Customer sees "Servicing issue". Resolve by setting back to active.</div>
        <div className="pt-1 italic">
          Deal artifacts (signed agreement, certificate) are in the signature section above.
          Property artifacts (title docs, review notes) are on the property review page.
        </div>
      </div>
    </div>
  );
}
