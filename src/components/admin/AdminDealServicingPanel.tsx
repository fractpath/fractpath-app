"use client";

import { useState } from "react";

type ServicingStatus = "active" | null;

interface Props {
  dealId: string;
  threadStatus: string | null;
  packetStatus: string | null;
  servicingStatus: ServicingStatus;
  servicingNote: string | null;
}

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
  const isDealActive = servicingStatus === "active";
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

  async function setActive() {
    setPendingAction("active");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/servicing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "active", note: note || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Request failed");
      } else {
        setServicingStatus("active");
        setSuccess("Deal marked as active. Notification queued.");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      {/* Status row */}
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
        <span className="text-muted-foreground text-xs">Deal status:</span>
        {isDealActive ? (
          <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-emerald-100 text-emerald-800">
            Deal active
          </span>
        ) : (
          <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-gray-100 text-gray-500">
            Not yet active
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
          placeholder="E.g. Signed agreement confirmed and on file. Agreement effective as of 2026-03-28."
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
          <span className="text-xs font-medium w-28 shrink-0 text-muted-foreground">
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

        {/* Mark deal active */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium w-28 shrink-0 text-muted-foreground">
            Deal active
          </span>
          {isDealClosed && !isDealActive ? (
            <button
              onClick={setActive}
              disabled={busy}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {pendingAction === "active" ? "Setting…" : "Mark deal active"}
            </button>
          ) : isDealActive ? (
            <span className="text-xs text-emerald-700 font-medium">
              Deal is active
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              Close the deal first
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
        <div><span className="font-medium">Mark deal active</span> — Confirms the agreement is in effect. Customer sees "Deal active".</div>
        <div className="pt-1 italic">
          Deal artifacts (signed agreement, certificate) are in the signature section above.
          Property artifacts (title docs, review notes) are on the property review page.
        </div>
      </div>
    </div>
  );
}
