"use client";

import { useState } from "react";

type DealReviewState = "triage_in_progress" | "ready_for_signatures" | "ineligible";

const ACTION_META: Record<DealReviewState, { label: string; description: string; tone: string }> = {
  triage_in_progress: {
    label: "Mark deal review in progress",
    description: "Sets the deal back to active triage review.",
    tone: "neutral",
  },
  ready_for_signatures: {
    label: "Mark ready for signatures",
    description:
      "Property valuation is sufficient and deal terms are eligible. Advances deal to the DocuSign signature stage.",
    tone: "success",
  },
  ineligible: {
    label: "Mark ineligible",
    description: "Hard stop. Deal cannot proceed as structured.",
    tone: "danger",
  },
};

const ACTIVE_STATES = Object.keys(ACTION_META) as DealReviewState[];

// AVM/LTV results that hard-block progression to ready_for_signatures
const HARD_BLOCKED_RESULTS = new Set([
  "blocked_pending_fmv",
  "ineligible_ltv",
  "escalated_review_required",
]);

const PROGRESSION_BLOCK_REASON: Record<string, string> = {
  blocked_pending_fmv:
    "Cannot advance to 'Ready for signatures': no verified AVM is on file for this property. Complete the AVM run on the property review page first.",
  ineligible_ltv:
    "Cannot advance to 'Ready for signatures': requested cash exceeds the maximum eligible cash under the LTV policy. Deal terms must be revised.",
  escalated_review_required:
    "Cannot advance to 'Ready for signatures': AVM deviation exceeds the escalation threshold. Resolve via the stronger valuation pathway on the property review page.",
  manual_review_required:
    "AVM deviation exceeds the manual review threshold. Enter an admin note acknowledging the deviation before advancing to 'Ready for signatures'.",
};

// Normalize DB value: the DB stores "ready_for_deposit" for the state the UI
// calls "ready_for_signatures" (the CHECK constraint predates the rename).
function normalizeTriageStatus(raw: string | null): string | null {
  if (raw === "ready_for_deposit") return "ready_for_signatures";
  return raw;
}

export function AdminDealActions({
  dealId,
  currentTriageStatus,
  avmEligibilityResult,
  hasOpenReviewRequest = false,
}: {
  dealId: string;
  currentTriageStatus: string | null;
  avmEligibilityResult: string | null;
  hasOpenReviewRequest?: boolean;
}) {
  const [selectedState, setSelectedState] = useState<DealReviewState>("triage_in_progress");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Normalize so "ready_for_deposit" (DB value) compares correctly to "ready_for_signatures" (UI key).
  const normalizedTriageStatus = normalizeTriageStatus(currentTriageStatus);

  // When the deal is already signature-ready, remove "Mark ready for signatures" from the
  // dropdown — it's not a useful action once the state is set and the signature section is live.
  const availableStates: DealReviewState[] =
    normalizedTriageStatus === "ready_for_signatures"
      ? ACTIVE_STATES.filter((s) => s !== "ready_for_signatures")
      : ACTIVE_STATES;

  // Derive AVM gate for the currently-selected state.
  // Only "ready_for_signatures" is a progression action — the other two are always allowed.
  const isProgressionAction = selectedState === "ready_for_signatures";
  const isHardBlocked =
    isProgressionAction &&
    avmEligibilityResult !== null &&
    HARD_BLOCKED_RESULTS.has(avmEligibilityResult);
  const isManualReview =
    isProgressionAction && avmEligibilityResult === "manual_review_required";
  // Manual review blocks until an admin note is provided as acknowledgment
  const isManualReviewBlocked = isManualReview && note.trim() === "";

  const avmBlockReason =
    isHardBlocked || isManualReviewBlocked
      ? (PROGRESSION_BLOCK_REASON[avmEligibilityResult ?? ""] ?? null)
      : null;

  const applyDisabled =
    pending ||
    selectedState === normalizedTriageStatus ||
    isHardBlocked ||
    isManualReviewBlocked;

  async function handleApply() {
    setErr(null);
    setSuccess(null);
    if (selectedState === normalizedTriageStatus) {
      setErr("Select a different state to apply.");
      return;
    }
    if (isHardBlocked || isManualReviewBlocked) {
      setErr(avmBlockReason ?? "AVM/LTV gate is blocking this action.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/set-review-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          state: selectedState,
          note: note.trim() || null,
          avm_eligibility_result: avmEligibilityResult ?? null,
        }),
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
            {availableStates.map((s) => (
              <option key={s} value={s}>
                {ACTION_META[s].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleApply}
            disabled={applyDisabled}
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

        {selectedState !== normalizedTriageStatus && !avmBlockReason && (
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        )}

        {/* Open review request soft warning */}
        {hasOpenReviewRequest && isProgressionAction && (
          <div className="rounded-md px-3 py-2 text-xs border bg-yellow-50 border-yellow-200 text-yellow-800">
            <span className="font-semibold">Open information request</span>
            {" — "}
            There is an unresolved additional-information request on this property. Resolve it on the
            property review page before advancing to{" "}
            <span className="font-medium">Ready for signatures</span>, or proceed only if the
            outstanding information is no longer required.
          </div>
        )}

        {/* AVM/LTV blocking reason */}
        {avmBlockReason && (
          <div className={`rounded-md px-3 py-2 text-xs border ${
            isHardBlocked
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-orange-50 border-orange-200 text-orange-800"
          }`}>
            <span className="font-semibold">
              {isHardBlocked ? "AVM/LTV gate — blocked" : "AVM/LTV gate — acknowledgment required"}
            </span>
            <span className="ml-1">{avmBlockReason}</span>
          </div>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Admin note{isManualReview ? " (required to acknowledge AVM deviation)" : " (optional — logged to deal activity)"}
          </label>
          <textarea
            className="w-full text-sm border rounded p-2 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isManualReview
                ? "Acknowledge AVM deviation and explain basis for proceeding…"
                : "Reason for state change…"
            }
            disabled={pending}
          />
        </div>

        {err && <div className="text-xs text-red-600">{err}</div>}
        {success && <div className="text-xs text-green-700">{success}</div>}
      </div>
    </div>
  );
}
