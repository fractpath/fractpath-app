"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ============================================================
// Types
// ============================================================

export type SignaturePacketView = {
  id: string;
  status: string;
  provider: string;
  sent_at: string | null;
  completed_at: string | null;
  voided_at: string | null;
  declined_at: string | null;
  executed_document_path: string | null;
  certificate_document_path: string | null;
};

export type SignatureRecipientView = {
  role: string;
  display_name: string | null;
  email: string | null;
  provider_status: string | null;
  signed_at: string | null;
};

type Props = {
  dealId: string;
  /** null = no thread; "accepted" = deal accepted; other = negotiating/pending */
  threadStatus: string | null;
  packet: SignaturePacketView | null;
  recipients: SignatureRecipientView[];
  isAdmin: boolean;
  execAgreementUrl: string | null;
  certificateUrl: string | null;
};

// ============================================================
// Presentation mapping helpers
// ============================================================

type CardState =
  | "pre_acceptance"
  | "ready"
  | "prepared"
  | "sent"
  | "partially_signed"
  | "completed"
  | "declined"
  | "voided"
  | "error";

function deriveCardState(
  threadStatus: string | null,
  packet: SignaturePacketView | null,
): CardState {
  if (!packet) {
    return threadStatus === "accepted" ? "ready" : "pre_acceptance";
  }
  const s = packet.status;
  if (s === "sent" || s === "delivered") return "sent";
  if (s === "partially_signed") return "partially_signed";
  if (s === "completed") return "completed";
  if (s === "declined") return "declined";
  if (s === "voided") return "voided";
  if (s === "error") return "error";
  if (s === "prepared") return "prepared";
  return "ready";
}

const STATE_LABEL: Record<CardState, string> = {
  pre_acceptance: "Available after acceptance",
  ready: "Ready for agreement",
  prepared: "Agreement prepared",
  sent: "Sent for signature",
  partially_signed: "Partially signed",
  completed: "Executed",
  declined: "Signature declined",
  voided: "Signature voided",
  error: "Needs attention",
};

type BadgeTone =
  | "gray"
  | "amber"
  | "blue"
  | "green"
  | "red";

const STATE_BADGE: Record<CardState, BadgeTone> = {
  pre_acceptance: "gray",
  ready: "amber",
  prepared: "amber",
  sent: "blue",
  partially_signed: "blue",
  completed: "green",
  declined: "red",
  voided: "gray",
  error: "red",
};

const STATE_CARD_CLASSES: Record<CardState, string> = {
  pre_acceptance: "border-gray-200 bg-gray-50",
  ready: "border-amber-200 bg-amber-50",
  prepared: "border-amber-200 bg-amber-50",
  sent: "border-blue-200 bg-blue-50",
  partially_signed: "border-blue-200 bg-blue-50",
  completed: "border-green-300 bg-green-50",
  declined: "border-red-200 bg-red-50",
  voided: "border-gray-200 bg-gray-50",
  error: "border-red-200 bg-red-50",
};

const BADGE_CLASSES: Record<BadgeTone, string> = {
  gray: "bg-gray-100 text-gray-600",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
  green: "bg-green-100 text-green-800",
  red: "bg-red-100 text-red-800",
};

// ============================================================
// Tracker
// ============================================================

type TrackerStageState = "complete" | "active" | "pending";

type TrackerStage = {
  label: string;
  sublabel?: string;
  timestamp?: string;
};

function buildTrackerStages(
  state: CardState,
  packet: SignaturePacketView | null,
  recipients: SignatureRecipientView[],
): Array<TrackerStage & { stageState: TrackerStageState }> {
  const buyer = recipients.find((r) => r.role === "Buyer") ?? null;
  const owner = recipients.find((r) => r.role === "Owner") ?? null;

  const buyerSigned = buyer?.provider_status?.toLowerCase() === "completed";
  const ownerSigned = owner?.provider_status?.toLowerCase() === "completed";

  function fmt(ts: string | null | undefined): string | undefined {
    if (!ts) return undefined;
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const buyerLabel = buyer?.display_name
    ? `${buyer.display_name}`
    : buyer?.email
    ? buyer.email
    : "Buyer";

  const ownerLabel = owner?.display_name
    ? `${owner.display_name}`
    : owner?.email
    ? owner.email
    : "Owner";

  type RawStage = TrackerStage & { stageState: TrackerStageState };

  const stages: RawStage[] = [
    {
      label: "Deal accepted",
      stageState:
        state === "pre_acceptance"
          ? "pending"
          : "complete",
    },
    {
      label: "Agreement prepared",
      stageState:
        state === "pre_acceptance" || state === "ready"
          ? "pending"
          : "complete",
    },
    {
      label: "Sent for signature",
      timestamp:
        state !== "pre_acceptance" && state !== "ready" && state !== "prepared"
          ? fmt(packet?.sent_at)
          : undefined,
      stageState:
        state === "pre_acceptance" || state === "ready" || state === "prepared"
          ? state === "prepared"
            ? "active"
            : "pending"
          : "complete",
    },
    {
      label: buyerSigned
        ? "Buyer signed"
        : state === "sent" || state === "partially_signed"
        ? `Waiting on Buyer`
        : "Buyer signs",
      sublabel: buyerSigned
        ? buyerLabel
        : state === "sent" || state === "partially_signed"
        ? buyerLabel
        : undefined,
      timestamp: buyerSigned ? fmt(buyer?.signed_at) : undefined,
      stageState:
        buyerSigned
          ? "complete"
          : state === "sent" || state === "partially_signed"
          ? "active"
          : "pending",
    },
    {
      label: ownerSigned
        ? "Owner signed"
        : state === "partially_signed" && buyerSigned
        ? `Waiting on Owner`
        : state === "sent"
        ? `Waiting on Owner`
        : "Owner signs",
      sublabel:
        ownerSigned || state === "partially_signed" || state === "sent"
          ? ownerLabel
          : undefined,
      timestamp: ownerSigned ? fmt(owner?.signed_at) : undefined,
      stageState:
        ownerSigned
          ? "complete"
          : state === "partially_signed" || state === "sent"
          ? "active"
          : "pending",
    },
    {
      label: "Executed documents available",
      timestamp:
        state === "completed" ? fmt(packet?.completed_at) : undefined,
      stageState: state === "completed" ? "complete" : "pending",
    },
  ];

  // For declined/voided/error, flatten the tracker to a minimal view
  if (state === "declined" || state === "voided" || state === "error") {
    return [
      { label: "Deal accepted", stageState: "complete" },
      {
        label: STATE_LABEL[state],
        sublabel:
          state === "declined"
            ? "One or more parties declined to sign."
            : state === "voided"
            ? "The signature request was voided."
            : "An error occurred. Contact support.",
        timestamp:
          state === "declined"
            ? fmt(packet?.voided_at)
            : state === "voided"
            ? fmt(packet?.voided_at)
            : undefined,
        stageState: "active",
      },
    ];
  }

  return stages;
}

// ============================================================
// Tracker sub-component
// ============================================================

function StageIndicator({ stageState }: { stageState: TrackerStageState }) {
  if (stageState === "complete") {
    return (
      <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-green-500 bg-green-500">
        <svg
          className="h-3 w-3 text-white"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 6l3 3 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (stageState === "active") {
    return (
      <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-500">
        <div className="h-2 w-2 rounded-full bg-white" />
      </div>
    );
  }
  return (
    <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white" />
  );
}

function SignatureTracker({
  stages,
}: {
  stages: Array<TrackerStage & { stageState: TrackerStageState }>;
}) {
  return (
    <div>
      {stages.map((stage, idx) => {
        const isLast = idx === stages.length - 1;
        return (
          <div key={idx} className="relative flex gap-3">
            {/* Vertical connecting line */}
            {!isLast && (
              <div className="absolute left-3 top-6 bottom-0 w-px bg-gray-200" />
            )}
            {/* Stage indicator dot */}
            <div className="pt-0.5 pb-0">
              <StageIndicator stageState={stage.stageState} />
            </div>
            {/* Stage content */}
            <div className={`flex-1 ${isLast ? "pb-0" : "pb-4"}`}>
              <p
                className={`text-sm font-medium leading-tight ${
                  stage.stageState === "pending"
                    ? "text-muted-foreground"
                    : stage.stageState === "active"
                    ? "text-foreground"
                    : "text-foreground"
                }`}
              >
                {stage.label}
              </p>
              {stage.sublabel && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stage.sublabel}
                </p>
              )}
              {stage.timestamp && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stage.timestamp}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Admin action buttons (live POST handlers)
// ============================================================

function AdminActionButton({
  dealId,
  packetStatus,
}: {
  dealId: string;
  packetStatus: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePrepare = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/signature/prepare`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? `Prepare failed (${res.status})`);
      }
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }, [dealId, router]);

  const handleSend = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/signature/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? `Send failed (${res.status})`);
      }
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }, [dealId, router]);

  const showPrepare = !packetStatus;
  const showSend = packetStatus === "prepared";

  if (!showPrepare && !showSend) return null;

  return (
    <div className="space-y-2">
      {showPrepare && (
        <button
          type="button"
          disabled={busy}
          onClick={handlePrepare}
          className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {busy ? "Preparing…" : "Prepare agreement"}
        </button>
      )}
      {showSend && (
        <button
          type="button"
          disabled={busy}
          onClick={handleSend}
          className="rounded-md border border-blue-400 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send with DocuSign"}
        </button>
      )}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

// ============================================================
// Main card
// ============================================================

export function SignatureCard({
  dealId,
  threadStatus,
  packet,
  recipients,
  isAdmin,
  execAgreementUrl,
  certificateUrl,
}: Props) {
  const state = deriveCardState(threadStatus, packet);
  const label = STATE_LABEL[state];
  const badgeTone = STATE_BADGE[state];
  const cardClasses = STATE_CARD_CLASSES[state];
  const stages = buildTrackerStages(state, packet, recipients);

  // Explainer copy per state
  const explainerCopy: Record<CardState, string | null> = {
    pre_acceptance:
      "Once a deal is accepted, FractPath prepares the agreement, routes it for signature, and stores the executed documents here.",
    ready: "The deal is accepted. The agreement will be prepared and sent for signature shortly.",
    prepared: "The agreement is ready. It will be sent to both parties for electronic signature.",
    sent: "Both parties have been sent a signature request. You will be notified when complete.",
    partially_signed: "One party has signed. Waiting for the other party to complete their signature.",
    completed: "The agreement has been fully executed and is stored securely.",
    declined: "A party declined to sign. Please contact FractPath to discuss next steps.",
    voided: "The signature request was voided. Please contact FractPath to discuss next steps.",
    error: "An issue occurred with the signature request. Please contact FractPath support.",
  };

  const copy = explainerCopy[state];

  const hasDocuments = !!(execAgreementUrl || certificateUrl);

  return (
    <div
      className={`rounded-md border p-4 space-y-4 ${cardClasses}`}
      data-testid="signature-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">
            Signature &amp; Documents
          </h2>
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${BADGE_CLASSES[badgeTone]}`}
          >
            {label}
          </span>
        </div>

        {/* View documents CTA — completed state */}
        {state === "completed" && (execAgreementUrl || certificateUrl) && (
          <a
            href={execAgreementUrl ?? certificateUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md border border-green-400 bg-white px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
            data-testid="view-documents-cta"
          >
            View documents
          </a>
        )}
      </div>

      {/* Explainer copy */}
      {copy && (
        <p className="text-xs text-muted-foreground">{copy}</p>
      )}

      {/* Tracker — shown in all states except pre-acceptance */}
      {state !== "pre_acceptance" && stages.length > 0 && (
        <div className="pt-1">
          <SignatureTracker stages={stages} />
        </div>
      )}

      {/* Document links — completed state with multiple documents */}
      {state === "completed" && hasDocuments && (
        <div className="space-y-1 border-t border-green-200 pt-3">
          <p className="text-xs font-medium text-foreground">Executed documents</p>
          <div className="space-y-1">
            {execAgreementUrl && (
              <a
                href={execAgreementUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-700 hover:underline"
                data-testid="exec-agreement-link"
              >
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 2h7l3 3v9H3V2z"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 2v3h3"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                </svg>
                Executed agreement
              </a>
            )}
            {certificateUrl && (
              <a
                href={certificateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-700 hover:underline"
                data-testid="certificate-link"
              >
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 2h7l3 3v9H3V2z"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 2v3h3"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                </svg>
                Certificate of completion
              </a>
            )}
          </div>
        </div>
      )}

      {/* Admin-only actions */}
      {isAdmin && (state === "ready" || state === "prepared") && (
        <div className="border-t border-current/10 pt-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Admin
          </p>
          <AdminActionButton
            dealId={dealId}
            packetStatus={packet?.status ?? null}
          />
        </div>
      )}
    </div>
  );
}
