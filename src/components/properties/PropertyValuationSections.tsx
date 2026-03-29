"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValuationSectionsProps = {
  propertyId: string;
  /** RentCast AVM */
  rentcastFmv: number | null;
  rentcastProvider: string | null;
  /** ATTOM enhanced valuation fields (map from escalation_deposit_status / escalation_avm_status) */
  escalationDepositStatus: string | null;
  escalationAvmStatus: string | null;
  /** Whether the owner has already submitted an ATTOM request (logged in audit trail) */
  ownerAttemptedAttom: boolean;
  /** Manual appraisal challenge fields */
  manualAppraisalStatus: string | null;
  manualAppraisalFmv: number | null;
  /** The currently controlling verified FMV and its source */
  latestVerifiedFmv: number | null;
  fmvVerificationSource: string | null;
  /** Linked deal context — used for ineligible-deal branch */
  isDealIneligible: boolean;
  linkedDealId: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function SectionCard({
  title,
  badge,
  badgeCls,
  children,
}: {
  title: string;
  badge?: string | null;
  badgeCls?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/30 border-b px-4 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {badge && (
          <span className={`text-xs rounded-full px-2 py-0.5 font-normal border ${badgeCls ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

// ─── Section 1: RentCast AVM ─────────────────────────────────────────────────

function RentCastSection({
  fmv,
  provider,
  isControlling,
}: {
  fmv: number | null;
  provider: string | null;
  isControlling: boolean;
}) {
  const label = provider ?? "Automated market estimate";
  return (
    <SectionCard
      title="Automated market estimate (RentCast)"
      badge={isControlling ? "Controlling basis" : "Superseded"}
      badgeCls={isControlling ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}
    >
      <p className="text-xs text-muted-foreground">
        An automated market estimate was run for your property using {label}. This provides an
        initial benchmark for your property&apos;s fair market value.
      </p>
      {fmv != null ? (
        <p className="text-sm font-semibold">
          Market estimate: {fmtUsd(fmv)}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground italic">Estimate not yet available.</p>
      )}
      {!isControlling && (
        <p className="text-xs text-muted-foreground italic">
          A stronger valuation basis has been adopted. This estimate is preserved for reference.
        </p>
      )}
    </SectionCard>
  );
}

// ─── Section 2: ATTOM Enhanced Valuation ─────────────────────────────────────

const ATTOM_DEPOSIT_BADGE: Record<string, { label: string; cls: string }> = {
  owner_requested: { label: "Requested by you", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  requested: { label: "Payment required", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  failed: { label: "Payment issue", cls: "bg-red-100 text-red-800 border-red-200" },
  paid: { label: "Payment confirmed", cls: "bg-blue-100 text-blue-800 border-blue-200" },
};
const ATTOM_AVM_BADGE: Record<string, { label: string; cls: string }> = {
  ordered: { label: "In progress", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  completed: { label: "Complete", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

function AttomSection({
  propertyId,
  escalationDepositStatus,
  escalationAvmStatus,
  latestVerifiedFmv,
  fmvVerificationSource,
  ownerAttemptedAttom: initialOwnerAttempted,
  isControlling,
}: {
  propertyId: string;
  escalationDepositStatus: string | null;
  escalationAvmStatus: string | null;
  latestVerifiedFmv: number | null;
  fmvVerificationSource: string | null;
  ownerAttemptedAttom: boolean;
  isControlling: boolean;
}) {
  const router = useRouter();
  const [requested, setRequested] = useState(initialOwnerAttempted);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const avmComplete = escalationAvmStatus === "completed";
  const avmOrdered = escalationAvmStatus === "ordered";
  const depositPaid = escalationDepositStatus === "paid";
  const depositRequested = escalationDepositStatus === "requested";
  const depositFailed = escalationDepositStatus === "failed";
  const nothingStarted = !escalationDepositStatus && !escalationAvmStatus;

  let badge: { label: string; cls: string } | null = null;
  if (avmComplete) badge = ATTOM_AVM_BADGE.completed;
  else if (avmOrdered || depositPaid) badge = ATTOM_AVM_BADGE.ordered;
  else if (depositFailed) badge = ATTOM_DEPOSIT_BADGE.failed;
  else if (depositRequested) badge = ATTOM_DEPOSIT_BADGE.requested;
  else if (requested) badge = ATTOM_DEPOSIT_BADGE.owner_requested;

  async function handleRequest() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/me/properties/${propertyId}/request-valuation`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error ?? "Request failed");
      } else {
        setRequested(true);
        router.refresh();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="ATTOM enhanced valuation"
      badge={badge?.label ?? (nothingStarted && !requested ? "Available" : undefined)}
      badgeCls={badge?.cls ?? "bg-gray-100 text-gray-500 border-gray-200"}
    >
      {/* Simulation disclaimer */}
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
        [Simulation] ATTOM integration is not yet connected. This section mirrors
        the owner-side experience for the enhanced valuation workflow.
      </p>

      <p className="text-xs text-muted-foreground">
        ATTOM provides a data-enhanced property valuation using public record, permit history,
        and comparable sale data. This replaces the automated estimate as your controlling
        property value basis.
      </p>

      {/* State-based content */}
      {avmComplete && (
        <>
          <p className="text-xs text-emerald-800 font-medium">
            Your enhanced valuation is complete.
            {isControlling && latestVerifiedFmv != null && (
              <> Verified value: <span className="font-bold">{fmtUsd(latestVerifiedFmv)}</span></>
            )}
          </p>
          {!isControlling && (
            <p className="text-xs text-muted-foreground italic">
              This ATTOM result has been superseded by a subsequent licensed manual appraisal.
              The ATTOM report remains on file for your reference.
            </p>
          )}
        </>
      )}

      {(avmOrdered || depositPaid) && !avmComplete && (
        <p className="text-xs text-blue-800">
          Your enhanced valuation is currently in progress. We will notify you when the
          report is complete.
        </p>
      )}

      {depositRequested && !depositPaid && !avmOrdered && !avmComplete && (
        <p className="text-xs text-orange-800">
          A payment request for the enhanced valuation fee has been sent to you. Please
          check your email and complete the payment to proceed.
        </p>
      )}

      {depositFailed && (
        <p className="text-xs text-red-800">
          There was an issue processing your payment. Please contact our team so we can
          assist you.
        </p>
      )}

      {nothingStarted && requested && (
        <p className="text-xs text-yellow-800">
          Your request has been received. Our team will reach out with payment details
          for the enhanced valuation shortly.
        </p>
      )}

      {nothingStarted && !requested && (
        <>
          <p className="text-xs text-muted-foreground">
            Request an enhanced valuation to obtain a stronger, verified FMV basis for your
            property. This typically strengthens your deal&apos;s eligibility profile.
          </p>
          <button
            disabled={busy}
            onClick={handleRequest}
            className="text-xs rounded border px-2.5 py-1.5 bg-white hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Submitting…" : "Request enhanced valuation"}
          </button>
        </>
      )}

      {err && (
        <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">{err}</p>
      )}
    </SectionCard>
  );
}

// ─── Section 3: Manual Appraisal ─────────────────────────────────────────────

const MANUAL_BADGE: Record<string, { label: string; cls: string }> = {
  available: { label: "Challenge available", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  payment_pending: { label: "Payment requested", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  in_progress: { label: "Appraisal in progress", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  complete: { label: "Appraisal complete", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

function ManualAppraisalSection({
  status,
  fmv,
  isControlling,
  propertyId,
  attomComplete,
}: {
  status: string | null;
  fmv: number | null;
  isControlling: boolean;
  propertyId: string;
  attomComplete: boolean;
}) {
  const router = useRouter();
  const [initiating, setInitiating] = useState(false);
  const [initiateErr, setInitiateErr] = useState<string | null>(null);
  const badge = status ? MANUAL_BADGE[status] : null;

  async function handleInitiate() {
    setInitiating(true);
    setInitiateErr(null);
    try {
      const res = await fetch(`/api/me/properties/${propertyId}/initiate-manual-appraisal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setInitiateErr(json.error ?? "Request failed");
      } else {
        router.refresh();
      }
    } catch (e: unknown) {
      setInitiateErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setInitiating(false);
    }
  }

  return (
    <SectionCard
      title="Licensed manual appraisal"
      badge={badge?.label ?? "Not yet initiated"}
      badgeCls={badge?.cls ?? "bg-gray-100 text-gray-500 border-gray-200"}
    >
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
        [Simulation] Real appraisal ordering and payment collection are not connected.
      </p>

      <p className="text-xs text-muted-foreground">
        A licensed manual appraisal provides the strongest available FMV basis. If the
        appraised value exceeds the current ATTOM result, it becomes the new controlling
        value and deal eligibility is re-evaluated.
      </p>

      {status === "available" && (
        <p className="text-xs text-yellow-800">
          Our team has noted your intent to commission a licensed manual appraisal. We will
          reach out with scheduling and payment details.
        </p>
      )}
      {status === "payment_pending" && (
        <p className="text-xs text-orange-800">
          A payment request for the appraisal fee has been sent. Once received, your
          appraisal will be scheduled with a licensed appraiser.
        </p>
      )}
      {status === "in_progress" && (
        <p className="text-xs text-blue-800">
          A licensed appraiser is currently evaluating your property. We will notify you
          when the appraisal report is complete.
        </p>
      )}
      {status === "complete" && (
        <>
          <p className="text-xs text-emerald-800">
            Your licensed appraisal has been completed.
            {fmv != null && (
              <> Appraised value: <span className="font-bold">{fmtUsd(fmv)}</span>.</>
            )}
            {isControlling
              ? " This result is now the controlling FMV basis for your deal."
              : " This result is on file for reference."}
          </p>
          {isControlling && (
            <p className="text-xs text-muted-foreground">
              Our team will re-evaluate your deal eligibility under the updated value. You will
              be notified if the terms are now within policy.
            </p>
          )}
        </>
      )}
      {!status && attomComplete && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            The enhanced valuation is complete. You may initiate a licensed manual appraisal
            to challenge the result. A fee applies — our team will be in touch with details.
          </p>
          <button
            disabled={initiating}
            onClick={handleInitiate}
            className="text-xs rounded border px-2.5 py-1.5 bg-white hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            {initiating ? "Submitting…" : "Initiate appraisal challenge"}
          </button>
          {initiateErr && <p className="text-xs text-red-700">{initiateErr}</p>}
        </div>
      )}
      {!status && !attomComplete && (
        <p className="text-xs text-muted-foreground">
          To commission a licensed manual appraisal, contact our team and we will guide you
          through the process. A fee applies.
        </p>
      )}
    </SectionCard>
  );
}

// ─── Ineligible deal guidance block ──────────────────────────────────────────

function IneligibleGuidanceBlock({
  linkedDealId,
  manualAppraisalStatus,
}: {
  linkedDealId: string | null;
  manualAppraisalStatus: string | null;
}) {
  const appraisalInProgress =
    manualAppraisalStatus === "payment_pending" ||
    manualAppraisalStatus === "in_progress";
  const appraisalComplete = manualAppraisalStatus === "complete";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
      <p className="text-sm font-semibold text-amber-900">Your deal terms require revision</p>
      <p className="text-xs text-amber-800">
        Based on the enhanced valuation, the current deal terms exceed FractPath&apos;s
        policy thresholds. You have two paths forward:
      </p>
      <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside pl-1">
        <li>
          <strong>Renegotiate the terms</strong> — propose a revised amount within the eligible
          range for the verified value. Navigate to your deal page to start a new proposal.
        </li>
        <li>
          <strong>Challenge the valuation</strong> — if you believe the ATTOM result understates
          your property&apos;s value, you can commission a licensed manual appraisal
          (see section below).
        </li>
      </ul>

      {appraisalInProgress && (
        <p className="text-xs text-blue-800 border-t border-amber-200 pt-2">
          A valuation challenge is currently in progress. Deal eligibility will be re-evaluated
          once the appraisal report is received.
        </p>
      )}
      {appraisalComplete && (
        <p className="text-xs text-emerald-800 border-t border-amber-200 pt-2">
          Your licensed appraisal is complete. Our team is re-evaluating deal eligibility under
          the updated property value.
        </p>
      )}

      {linkedDealId && (
        <div className="border-t border-amber-200 pt-2">
          <Link
            href={`/deal/${linkedDealId}`}
            className="text-xs underline text-amber-900 hover:text-amber-700"
          >
            Go to deal page to renegotiate terms →
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function PropertyValuationSections(props: ValuationSectionsProps) {
  const {
    propertyId,
    rentcastFmv,
    rentcastProvider,
    escalationDepositStatus,
    escalationAvmStatus,
    ownerAttemptedAttom,
    manualAppraisalStatus,
    manualAppraisalFmv,
    latestVerifiedFmv,
    fmvVerificationSource,
    isDealIneligible,
    linkedDealId,
  } = props;

  const attomComplete = escalationAvmStatus === "completed";
  const attomStarted = !!(escalationDepositStatus || escalationAvmStatus || ownerAttemptedAttom);
  const manualStarted = !!manualAppraisalStatus;

  const rentcastIsControlling =
    fmvVerificationSource == null ||
    fmvVerificationSource === "rentcast_sim" ||
    fmvVerificationSource === "rentcast";
  const attomIsControlling =
    fmvVerificationSource === "escalation_avm_sim" ||
    fmvVerificationSource === "attom_sim";
  const manualIsControlling =
    fmvVerificationSource === "manual_appraisal_sim";

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Property valuations</h2>

      {/* 1. RentCast — always show when fmv is available */}
      {rentcastFmv != null && (
        <RentCastSection
          fmv={rentcastFmv}
          provider={rentcastProvider}
          isControlling={rentcastIsControlling}
        />
      )}

      {/* 2. ATTOM — show when AVM journey has started or after rentcast is done */}
      {(attomStarted || rentcastFmv != null) && (
        <AttomSection
          propertyId={propertyId}
          escalationDepositStatus={escalationDepositStatus}
          escalationAvmStatus={escalationAvmStatus}
          latestVerifiedFmv={latestVerifiedFmv}
          fmvVerificationSource={fmvVerificationSource}
          ownerAttemptedAttom={ownerAttemptedAttom}
          isControlling={attomIsControlling}
        />
      )}

      {/* Ineligible deal guidance — shown when deal is ineligible and ATTOM is complete */}
      {isDealIneligible && attomComplete && (
        <IneligibleGuidanceBlock
          linkedDealId={linkedDealId}
          manualAppraisalStatus={manualAppraisalStatus}
        />
      )}

      {/* 3. Manual appraisal — show when deal is ineligible, ATTOM is complete, or appraisal has been initiated */}
      {(isDealIneligible || attomComplete || manualStarted) && (
        <ManualAppraisalSection
          status={manualAppraisalStatus}
          fmv={manualAppraisalFmv}
          isControlling={manualIsControlling}
          propertyId={propertyId}
          attomComplete={attomComplete}
        />
      )}
    </div>
  );
}
