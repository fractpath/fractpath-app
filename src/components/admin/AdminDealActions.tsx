"use client";

import { useState } from "react";

type DealReviewState = "triage_in_progress" | "ready_for_deposit" | "ineligible";

const ACTION_META: Record<DealReviewState, { label: string; description: string; tone: string }> = {
  triage_in_progress: {
    label: "Mark deal review in progress",
    description: "Sets the deal back to active triage review.",
    tone: "neutral",
  },
  ready_for_deposit: {
    label: "Mark ready for deposit request",
    description: "Deal economics and property review are sufficient to request deposit.",
    tone: "success",
  },
  ineligible: {
    label: "Mark ineligible",
    description: "Hard stop. Deal cannot proceed as structured.",
    tone: "danger",
  },
};

const DEFERRED_ACTIONS = [
  { label: "Mark awaiting deposit", reason: "Requires deposit tracking integration" },
  { label: "Mark awaiting AMV", reason: "Requires AMV integration" },
  { label: "Mark counter required", reason: "Requires counter-offer workflow context" },
  { label: "Mark sent for signature", reason: "Requires DocuSign integration" },
  { label: "Mark executed", reason: "Requires signature completion" },
  { label: "Archive deal", reason: "Requires archival flow" },
];

const ACTIVE_STATES = Object.keys(ACTION_META) as DealReviewState[];

export function AdminDealActions({
  dealId,
  currentTriageStatus,
}: {
  dealId: string;
  currentTriageStatus: string | null;
}) {
  const [selectedState, setSelectedState] = useState<DealReviewState>("triage_in_progress");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleApply() {
    setErr(null);
    setSuccess(null);
    if (selectedState === currentTriageStatus) {
      setErr("Select a different state to apply.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/set-review-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ state: selectedState, note: note.trim() || null }),
      });
      const body = await res.json();
      if (!body.ok) {
        setErr(body.error ?? "Failed to update deal review state");
      } else {
        setSuccess(`Review state updated: ${ACTION_META[selectedState].label}`);
        window.location.reload();
      }
    } catch {
      setErr("Network error");
    } finally {
      setPending(false);
    }
  }

  const meta = ACTION_META[selectedState];

  return (
    <div className="space-y-4">
      {/* Active actions */}
      <div className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Deal review actions
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0">Set state</label>
          <select
            className="text-sm border rounded px-2 py-1 bg-background"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value as DealReviewState)}
            disabled={pending}
          >
            {ACTIVE_STATES.map((s) => (
              <option key={s} value={s}>
                {ACTION_META[s].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleApply}
            disabled={pending || selectedState === currentTriageStatus}
            className={`text-xs px-3 py-1 rounded border disabled:opacity-50 ${
              meta.tone === "danger"
                ? "border-red-300 text-red-700 hover:bg-red-50"
                : meta.tone === "success"
                  ? "border-green-300 text-green-700 hover:bg-green-50"
                  : "hover:bg-muted"
            }`}
          >
            {pending ? "Applying…" : "Apply"}
          </button>
        </div>

        {selectedState !== currentTriageStatus && (
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Admin note (optional — logged to deal activity)
          </label>
          <textarea
            className="w-full text-sm border rounded p-2 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for state change…"
            disabled={pending}
          />
        </div>

        {err && <div className="text-xs text-red-600">{err}</div>}
        {success && <div className="text-xs text-green-700">{success}</div>}
      </div>

      {/* Deferred actions */}
      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Deferred actions
        </div>
        <div className="space-y-1.5">
          {DEFERRED_ACTIONS.map((a) => (
            <div key={a.label} className="flex items-center gap-3">
              <button
                type="button"
                disabled
                className="text-xs px-2 py-0.5 rounded border opacity-40 cursor-not-allowed"
              >
                {a.label}
              </button>
              <span className="text-xs text-muted-foreground">{a.reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
