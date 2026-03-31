"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * liveIneligiblePhase describes the current unhappy-path state for the linked deal:
 *
 * - 'attom_required'   — deal is ineligible under RentCast alone; ATTOM has not yet completed;
 *                        renegotiation and manual appraisal challenge are NOT available yet.
 * - 'void_renegotiable' — ATTOM has completed and the deal is still ineligible; the deal is
 *                          void/non-executable; owner may renegotiate or commission manual appraisal.
 * - null               — no live ineligible deal (proactive-only context or deal is eligible).
 */
export type LiveIneligiblePhase = "attom_required" | "void_renegotiable" | null;

export type ValuationSectionsProps = {
  propertyId: string;
  /** RentCast AVM */
  rentcastFmv: number | null;
  rentcastProvider: string | null;
  /** ATTOM enhanced valuation fields */
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
  /**
   * Live ineligible deal phase — drives guidance block content and manual appraisal copy.
   * Replaces the old isDealIneligible boolean.
   */
  liveIneligiblePhase: LiveIneligiblePhase;
  linkedDealId: string | null;
  /**
   * ISO timestamp of when the most recent real ATTOM admin screening completed.
   * Used to show "independently reviewed on [date]" on the owner page.
   * Owner-safe: shown as a date only, no internal ATTOM details are exposed.
   */
  attomScreeningCompletedAt?: string | null;
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
  isRealAttomComplete,
  liveIneligiblePhase,
  attomScreeningCompletedAt,
}: {
  propertyId: string;
  escalationDepositStatus: string | null;
  escalationAvmStatus: string | null;
  latestVerifiedFmv: number | null;
  fmvVerificationSource: string | null;
  ownerAttemptedAttom: boolean;
  isControlling: boolean;
  isRealAttomComplete: boolean;
  liveIneligiblePhase: LiveIneligiblePhase;
  attomScreeningCompletedAt?: string | null;
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

  // When real ATTOM screening (admin-triggered) has completed and become
  // the controlling FMV basis, override the escalation sim state machine.
  const effectiveComplete = isRealAttomComplete || avmComplete;
  const effectiveControllingBadge = effectiveComplete
    ? ATTOM_AVM_BADGE.completed
    : badge;

  return (
    <SectionCard
      title="Enhanced valuation"
      badge={effectiveControllingBadge?.label ?? (nothingStarted && !requested ? "Available" : undefined)}
      badgeCls={effectiveControllingBadge?.cls ?? "bg-gray-100 text-gray-500 border-gray-200"}
    >
      {/* ATTOM-first policy banner — shown when a live accepted deal requires ATTOM */}
      {liveIneligiblePhase === "attom_required" && !effectiveComplete && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 space-y-1">
          <p className="font-semibold">Required next step for your active deal</p>
          <p>
            Your deal could not be confirmed under the automated estimate alone. The enhanced
            valuation must complete before the deal can continue, or before you can revise terms
            or commission a manual appraisal.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        A data-enhanced property valuation uses public record, permit history,
        and comparable sale data. This replaces the automated estimate as your controlling
        property value basis.
      </p>

      {/* Real ATTOM or simulation AVM complete */}
      {effectiveComplete && (
        <>
          {/* When real ATTOM admin screening is the source — show owner-safe enhanced review state */}
          {isRealAttomComplete ? (
            <div className="space-y-1.5">
              <p className="text-xs text-emerald-800 font-semibold">
                Enhanced data review complete.
              </p>
              <p className="text-xs text-emerald-800">
                An independent data review of your property has been completed
                {attomScreeningCompletedAt ? (() => {
                  try {
                    const d = new Date(attomScreeningCompletedAt);
                    return ` on ${d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
                  } catch { return ""; }
                })() : ""}.
                {isControlling && latestVerifiedFmv != null && (
                  <> The verified property value established through this review is{" "}
                    <span className="font-bold">{fmtUsd(latestVerifiedFmv)}</span>.
                  </>
                )}
              </p>
              {isControlling && (
                <p className="text-xs text-muted-foreground">
                  This independently reviewed value is currently used as the verified basis
                  for your property. Our team will notify you if any further steps are needed.
                </p>
              )}
              {!isControlling && (
                <p className="text-xs text-muted-foreground italic">
                  This review is on file. A subsequent appraisal has established the current
                  controlling value.
                </p>
              )}
            </div>
          ) : (
            /* Escalation sim path */
            <>
              <p className="text-xs text-emerald-800 font-medium">
                Your enhanced valuation is complete.
                {isControlling && latestVerifiedFmv != null && (
                  <> Verified value: <span className="font-bold">{fmtUsd(latestVerifiedFmv)}</span>.</>
                )}
              </p>
              {!isControlling && (
                <p className="text-xs text-muted-foreground italic">
                  This result has been superseded by a subsequent licensed manual appraisal.
                  The report remains on file for your reference.
                </p>
              )}
            </>
          )}
        </>
      )}

      {!effectiveComplete && (avmOrdered || depositPaid) && (
        <p className="text-xs text-blue-800">
          Your enhanced valuation is currently in progress. We will notify you when the
          report is complete.
        </p>
      )}

      {!effectiveComplete && depositRequested && !depositPaid && !avmOrdered && (
        <p className="text-xs text-orange-800">
          A payment request for the enhanced valuation fee has been sent to you. Please
          check your email and complete the payment to proceed.
        </p>
      )}

      {!effectiveComplete && depositFailed && (
        <p className="text-xs text-red-800">
          There was an issue processing your payment. Please contact our team so we can
          assist you.
        </p>
      )}

      {!effectiveComplete && nothingStarted && requested && (
        <p className="text-xs text-yellow-800">
          Your request has been received. Our team will reach out with next steps
          for the enhanced valuation shortly.
        </p>
      )}

      {!effectiveComplete && nothingStarted && !requested && (
        <>
          <p className="text-xs text-muted-foreground">
            Request an enhanced valuation to obtain a stronger, verified basis for your
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
  liveIneligiblePhase,
}: {
  status: string | null;
  fmv: number | null;
  isControlling: boolean;
  propertyId: string;
  attomComplete: boolean;
  liveIneligiblePhase: LiveIneligiblePhase;
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
      <p className="text-xs text-muted-foreground">
        A licensed manual appraisal provides the strongest available FMV basis. If the
        appraised value exceeds the current verified result, it becomes the new controlling
        value and deal eligibility is re-evaluated.
      </p>

      {/* ATTOM-first policy note — shown when there's a live deal requiring ATTOM first */}
      {!status && liveIneligiblePhase === "attom_required" && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 space-y-1">
          <p className="font-semibold">Deal escalation note</p>
          <p>
            For your active deal, the enhanced valuation (ATTOM) must complete before a manual
            appraisal can count as an official deal escalation. You may still proactively order
            an appraisal below — it will be on file and applied once ATTOM is complete.
          </p>
        </div>
      )}

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

      {/* Initiate button — available proactively at any time when no appraisal started */}
      {!status && (
        <div className="space-y-1.5">
          {attomComplete ? (
            <p className="text-xs text-muted-foreground">
              The enhanced valuation is complete. You may initiate a licensed manual appraisal
              to challenge the result. A fee applies — our team will be in touch with details.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              You may proactively commission a licensed manual appraisal at any time. A fee
              applies — our team will be in touch with details. For active deals, the manual
              appraisal result is applied once the enhanced valuation is also complete.
            </p>
          )}
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
    </SectionCard>
  );
}

// ─── Ineligible deal guidance block ──────────────────────────────────────────

function IneligibleGuidanceBlock({
  linkedDealId,
  manualAppraisalStatus,
  liveIneligiblePhase,
}: {
  linkedDealId: string | null;
  manualAppraisalStatus: string | null;
  liveIneligiblePhase: LiveIneligiblePhase;
}) {
  if (liveIneligiblePhase === "attom_required") {
    // ATTOM has not completed yet — renegotiation and manual challenge are not available.
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
        <p className="text-sm font-semibold text-amber-900">Enhanced valuation required</p>
        <p className="text-xs text-amber-800">
          Your deal terms could not be confirmed under the automated property estimate alone.
          The ATTOM enhanced valuation must complete before you can revise the deal terms or
          commission a manual appraisal.
        </p>
        <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside pl-1">
          <li>
            Request the enhanced valuation below using the ATTOM section. Our team will send
            payment details.
          </li>
          <li>
            Once the enhanced valuation completes, you will be able to renegotiate terms or
            challenge the valuation.
          </li>
        </ul>
        {linkedDealId && (
          <div className="border-t border-amber-200 pt-2">
            <Link
              href={`/deal/${linkedDealId}`}
              className="text-xs underline text-amber-900 hover:text-amber-700"
            >
              View deal status →
            </Link>
          </div>
        )}
      </div>
    );
  }

  // void_renegotiable: ATTOM complete, deal still ineligible
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
    liveIneligiblePhase,
    linkedDealId,
    attomScreeningCompletedAt,
  } = props;

  const attomComplete = escalationAvmStatus === "completed";
  const attomStarted = !!(escalationDepositStatus || escalationAvmStatus || ownerAttemptedAttom);
  const manualStarted = !!manualAppraisalStatus;

  // fmv_verification_source values:
  //   "rentcast" / "rentcast_sim"       → RentCast controlling
  //   "escalation_avm_sim" / "attom_sim" → ATTOM escalation simulation controlling
  //   "attom"                            → Real ATTOM admin screening controlling
  //   "manual_appraisal_sim"             → Manual appraisal controlling
  //   null                               → No controlling FMV yet (default to rentcast section shown)
  const rentcastIsControlling =
    fmvVerificationSource == null ||
    fmvVerificationSource === "rentcast_sim" ||
    fmvVerificationSource === "rentcast";
  const attomIsControlling =
    fmvVerificationSource === "escalation_avm_sim" ||
    fmvVerificationSource === "attom_sim" ||
    fmvVerificationSource === "attom";
  const manualIsControlling =
    fmvVerificationSource === "manual_appraisal_sim";

  // True when real ATTOM admin screening (not escalation sim) is the controlling source.
  const isRealAttomComplete = fmvVerificationSource === "attom";

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

      {/* 2. ATTOM — show when AVM journey has started, real ATTOM is controlling,
                     rentcast is done, or deal requires ATTOM */}
      {(attomStarted || attomIsControlling || rentcastFmv != null || liveIneligiblePhase !== null) && (
        <AttomSection
          propertyId={propertyId}
          escalationDepositStatus={escalationDepositStatus}
          escalationAvmStatus={escalationAvmStatus}
          latestVerifiedFmv={latestVerifiedFmv}
          fmvVerificationSource={fmvVerificationSource}
          ownerAttemptedAttom={ownerAttemptedAttom}
          isControlling={attomIsControlling}
          isRealAttomComplete={isRealAttomComplete}
          liveIneligiblePhase={liveIneligiblePhase}
          attomScreeningCompletedAt={attomScreeningCompletedAt}
        />
      )}

      {/* Ineligible deal guidance — shown for either attom_required or void_renegotiable phase */}
      {liveIneligiblePhase !== null && (
        <IneligibleGuidanceBlock
          linkedDealId={linkedDealId}
          manualAppraisalStatus={manualAppraisalStatus}
          liveIneligiblePhase={liveIneligiblePhase}
        />
      )}

      {/* 3. Manual appraisal — show when deal is ineligible, ATTOM is complete, or appraisal started */}
      {(liveIneligiblePhase !== null || attomComplete || isRealAttomComplete || manualStarted) && (
        <ManualAppraisalSection
          status={manualAppraisalStatus}
          fmv={manualAppraisalFmv}
          isControlling={manualIsControlling}
          propertyId={propertyId}
          attomComplete={attomComplete || isRealAttomComplete}
          liveIneligiblePhase={liveIneligiblePhase}
        />
      )}
    </div>
  );
}
