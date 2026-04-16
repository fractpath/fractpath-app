"use client";

import { useState } from "react";
import {
  RELEASE_REASON_CODES,
  VOID_AND_RELEASE_CONFIRMATION,
} from "@/lib/property/claimRelease";

const REASON_CODE_LABELS: Record<string, string> = {
  stale_test_data: "Stale test data",
  erroneous_acceptance: "Erroneous acceptance",
  duplicate_property: "Duplicate property",
  wrong_owner_attached: "Wrong owner attached",
  support_remediation: "Support remediation",
  compliance_legal_instruction: "Compliance / legal instruction",
  internal_qa_cleanup: "Internal QA cleanup",
  other: "Other",
};

interface Props {
  propertyId: string;
  /** Accepted deal thread ID — if present, enables the void+release action */
  acceptedThreadId: string | null;
  hasOwner: boolean;
  /** Called after a successful action; defaults to full page reload */
  onActionComplete?: () => void;
}

type ActiveAction = "release" | "reset" | "void" | null;

export function AdminClaimReleasePanel({
  propertyId,
  acceptedThreadId,
  hasOwner,
  onActionComplete,
}: Props) {
  const defaultComplete = () => {
    if (typeof window !== "undefined") window.location.reload();
  };
  const handleComplete = onActionComplete ?? defaultComplete;
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  function cancel() {
    setActiveAction(null);
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-red-800">
          Destructive admin actions
        </span>
      </div>
      <p className="text-xs text-red-700">
        These actions are irreversible and must only be used for support
        remediation, stale test data, and compliance scenarios. All events are
        permanently logged.
      </p>

      {activeAction === null && (
        <div className="flex flex-col gap-2 pt-1">
          {hasOwner && (
            <button
              onClick={() => setActiveAction("release")}
              className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
            >
              Release property claim
            </button>
          )}
          <button
            onClick={() => setActiveAction("reset")}
            className="w-full rounded-md border border-orange-300 bg-white px-3 py-2 text-left text-sm font-medium text-orange-700 hover:bg-orange-100 transition-colors"
          >
            Reset property operational state
          </button>
          {acceptedThreadId && (
            <button
              onClick={() => setActiveAction("void")}
              className="w-full rounded-md border border-red-500 bg-red-600 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              Void accepted agreement + release property
            </button>
          )}
        </div>
      )}

      {activeAction === "release" && (
        <ReleaseClaimForm
          propertyId={propertyId}
          onSuccess={handleComplete}
          onCancel={cancel}
        />
      )}

      {activeAction === "reset" && (
        <ResetOperationalStateForm
          propertyId={propertyId}
          onSuccess={handleComplete}
          onCancel={cancel}
        />
      )}

      {activeAction === "void" && acceptedThreadId && (
        <VoidAndReleaseForm
          propertyId={propertyId}
          threadId={acceptedThreadId}
          onSuccess={handleComplete}
          onCancel={cancel}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Release claim form
// ---------------------------------------------------------------------------

function ReleaseClaimForm({
  propertyId,
  onSuccess,
  onCancel,
}: {
  propertyId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reasonCode) {
      setError("Select a reason code");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/release-claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason_code: reasonCode, notes: notes.trim() || null }),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Release failed");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error — please try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-red-300 bg-white p-3">
      <p className="text-xs font-semibold text-red-800">Release property claim</p>
      <p className="text-xs text-gray-600">
        This will remove the current ownership association from this property,
        purge owner-linked private data from active use, and make the property
        claimable again unless an admin hold is applied. Audit history will be
        preserved.
      </p>
      <ReasonCodeSelect value={reasonCode} onChange={setReasonCode} />
      <NotesField value={notes} onChange={setNotes} required={false} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ActionButtons
        onConfirm={handleSubmit}
        onCancel={onCancel}
        pending={pending}
        confirmLabel="Release claim"
        confirmClass="bg-red-600 text-white hover:bg-red-700"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reset operational state form
// ---------------------------------------------------------------------------

function ResetOperationalStateForm({
  propertyId,
  onSuccess,
  onCancel,
}: {
  propertyId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reasonCode) {
      setError("Select a reason code");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/reset-operational-state`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason_code: reasonCode, notes: notes.trim() || null }),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Reset failed");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error — please try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-orange-300 bg-white p-3">
      <p className="text-xs font-semibold text-orange-800">
        Reset property operational state
      </p>
      <p className="text-xs text-gray-600">
        This resets verification and review workflow flags (verification state,
        review status, escalation flags) so the property re-enters the intake
        flow. It does <strong>not</strong> release the owner claim,{" "}
        <strong>not</strong> void or close any deal threads, and does{" "}
        <strong>not</strong> remove photos or owner-linked data. To release the
        claim, use &ldquo;Release property claim&rdquo; or &ldquo;Void accepted
        agreement + release property&rdquo; instead.
      </p>
      <ReasonCodeSelect value={reasonCode} onChange={setReasonCode} />
      <NotesField value={notes} onChange={setNotes} required={false} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ActionButtons
        onConfirm={handleSubmit}
        onCancel={onCancel}
        pending={pending}
        confirmLabel="Reset state"
        confirmClass="bg-orange-600 text-white hover:bg-orange-700"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Void and release form
// ---------------------------------------------------------------------------

function VoidAndReleaseForm({
  propertyId,
  threadId,
  onSuccess,
  onCancel,
}: {
  propertyId: string;
  threadId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmationMatch = confirmed === VOID_AND_RELEASE_CONFIRMATION;
  const canSubmit =
    !!reasonCode && notes.trim().length > 0 && confirmationMatch && acknowledged;

  async function handleSubmit() {
    if (!canSubmit) {
      setError("All fields required and confirmation must match exactly");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/void-and-release`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason_code: reasonCode,
            notes: notes.trim(),
            confirmation: confirmed,
            acknowledged,
            thread_id: threadId,
          }),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Void and release failed");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error — please try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border-2 border-red-600 bg-white p-3">
      <p className="text-xs font-bold text-red-800 uppercase tracking-wide">
        Void accepted agreement and release property
      </p>
      <p className="text-xs text-gray-700">
        This will permanently terminate the accepted agreement, remove the
        owner&apos;s active claim to the property, purge owner-linked private
        data from operational use, and make the property claimable again if
        configured. This action will preserve audit history and cannot
        automatically restore the prior workflow.
      </p>
      <ReasonCodeSelect value={reasonCode} onChange={setReasonCode} />
      <NotesField value={notes} onChange={setNotes} required />
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
          />
          I acknowledge this action is irreversible and will terminate the
          accepted agreement and purge owner-linked data.
        </label>
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700">
          Type{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-red-700">
            {VOID_AND_RELEASE_CONFIRMATION}
          </code>{" "}
          to confirm
        </label>
        <input
          type="text"
          value={confirmed}
          onChange={(e) => setConfirmed(e.target.value)}
          placeholder={VOID_AND_RELEASE_CONFIRMATION}
          className={`w-full rounded-md border px-2 py-1.5 text-sm font-mono ${
            confirmed && !confirmationMatch
              ? "border-red-400 bg-red-50"
              : "border-gray-300"
          }`}
          spellCheck={false}
        />
        {confirmed && !confirmationMatch && (
          <p className="text-xs text-red-600">Does not match — must be exact</p>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ActionButtons
        onConfirm={handleSubmit}
        onCancel={onCancel}
        pending={pending}
        disabled={!canSubmit}
        confirmLabel="Void and release"
        confirmClass="bg-red-700 text-white hover:bg-red-800 disabled:opacity-40"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ReasonCodeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">
        Reason code <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
      >
        <option value="">Select reason…</option>
        {RELEASE_REASON_CODES.map((code) => (
          <option key={code} value={code}>
            {REASON_CODE_LABELS[code] ?? code}
          </option>
        ))}
      </select>
    </div>
  );
}

function NotesField({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  required: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">
        Notes{" "}
        {required ? (
          <span className="text-red-500">*</span>
        ) : (
          <span className="text-gray-400">(optional if no deal history)</span>
        )}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm resize-none"
        placeholder="Describe the reason for this action…"
      />
    </div>
  );
}

function ActionButtons({
  onConfirm,
  onCancel,
  pending,
  disabled,
  confirmLabel,
  confirmClass,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
  disabled?: boolean;
  confirmLabel: string;
  confirmClass: string;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={onConfirm}
        disabled={pending || disabled}
        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${confirmClass}`}
      >
        {pending ? "Processing…" : confirmLabel}
      </button>
      <button
        onClick={onCancel}
        disabled={pending}
        className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
