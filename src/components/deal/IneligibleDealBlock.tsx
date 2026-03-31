"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Property review blocked-state cue ────────────────────────────────────────
// Shown on the owner deal page when an accepted deal is waiting on a property-side
// action the owner specifically needs to take (e.g. admin has sent an information
// request that requires owner documentation).

type PropertyReviewBlockedProps = {
  propertyId: string;
};

export function PropertyReviewBlockedOwnerBanner({ propertyId }: PropertyReviewBlockedProps) {
  return (
    <div
      className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-3 dark:border-orange-800 dark:bg-orange-950"
      data-testid="property-review-blocked-banner"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-orange-500 dark:text-orange-400 flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
            Your property needs additional information
          </p>
          <p className="text-xs text-orange-800 dark:text-orange-200">
            This deal is waiting on property details that our team has requested from you.
            Please visit your property page to review and respond to the outstanding request —
            the deal cannot advance until this information is provided.
          </p>
        </div>
      </div>
      <Link
        href={`/properties/${propertyId}`}
        className="inline-block text-xs rounded border border-orange-300 bg-white px-3 py-1.5 font-medium text-orange-900 hover:bg-orange-50 dark:bg-orange-900/30 dark:text-orange-100 dark:border-orange-700 dark:hover:bg-orange-900/60"
      >
        Go to property page →
      </Link>
    </div>
  );
}

// ─── ATTOM-required blocks (Case 2) ───────────────────────────────────────────
// Shown when the deal is ineligible under RentCast alone and ATTOM has not yet
// completed. Renegotiation and manual appraisal are NOT available yet.

type AttomRequiredOwnerProps = {
  propertyId: string | null;
};

export function AttomRequiredDealOwnerBlock({ propertyId }: AttomRequiredOwnerProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-amber-900">
          Enhanced valuation required before this deal can continue
        </p>
        <p className="text-xs text-amber-800">
          The deal terms could not be confirmed under the automated property estimate alone.
          A data-enhanced valuation (ATTOM) is the required next step — it uses public record,
          permit history, and comparable sale data to establish a stronger verified value.
        </p>
        <p className="text-xs text-amber-800">
          Once the enhanced valuation is complete, you will be able to revise the deal terms
          or commission a licensed manual appraisal if needed. No action is required on this
          page until that review is finished.
        </p>
      </div>
      {propertyId && (
        <Link
          href={`/properties/${propertyId}`}
          className="inline-block text-xs rounded border border-amber-300 px-2.5 py-1.5 bg-white hover:bg-muted cursor-pointer"
        >
          Go to property page to request enhanced valuation →
        </Link>
      )}
    </div>
  );
}

export function AttomRequiredDealBuyerBlock() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-1.5">
      <p className="text-sm font-semibold text-amber-900">Enhanced valuation in progress</p>
      <p className="text-xs text-amber-800">
        An enhanced property valuation is required before this deal can proceed. This review is
        currently being arranged. You will be notified when it is complete and the deal can
        continue.
      </p>
    </div>
  );
}

// ─── Owner-side block (Case 4: ATTOM complete, still ineligible) ───────────────

type OwnerProps = {
  dealId: string;
  propertyId: string | null;
  manualAppraisalStatus: string | null;
  exceptionDescription: string | null;
  /** Pre-seeds the renegotiation "already logged" state when DB confirms it was requested. */
  renegotiationAlreadyRequested?: boolean;
};

export function IneligibleDealOwnerBlock({
  dealId,
  propertyId,
  manualAppraisalStatus,
  exceptionDescription,
  renegotiationAlreadyRequested = false,
}: OwnerProps) {
  const router = useRouter();
  const [logged, setLogged] = useState(renegotiationAlreadyRequested);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const appraisalInProgress =
    manualAppraisalStatus === "payment_pending" || manualAppraisalStatus === "in_progress";
  const appraisalComplete = manualAppraisalStatus === "complete";

  async function logRenegotiationRequest() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/me/deals/${dealId}/log-renegotiation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error ?? "Request failed");
      } else {
        setLogged(true);
        router.refresh();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-amber-900">
          Revised terms required — deal is not executable under current terms
        </p>
        <p className="text-xs text-amber-800">
          {exceptionDescription ??
            "Based on the enhanced valuation, the current deal terms are not eligible under the verified property value. " +
            "Our team will work with you on what revised terms might look like."}
        </p>
      </div>

      {/* Path options */}
      <div className="space-y-2 border-t border-amber-200 pt-3">
        <p className="text-xs font-semibold text-amber-900">Your options:</p>

        {/* Path A — renegotiate */}
        <div className="rounded-md bg-white border border-amber-200 px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-medium text-foreground">A — Propose revised terms</p>
          <p className="text-xs text-muted-foreground">
            Work with the buyer to adjust the requested amount so it falls within the eligible range
            for your verified property value. Use the button below to notify our team that you want
            to renegotiate.
          </p>
          {!logged ? (
            <button
              disabled={busy}
              onClick={logRenegotiationRequest}
              className="text-xs rounded border px-2.5 py-1.5 bg-white hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              {busy ? "Submitting…" : "Notify team — I want to renegotiate"}
            </button>
          ) : (
            <p className="text-xs text-emerald-800 font-medium">
              ✓ Renegotiation request logged — our team will be in touch.
            </p>
          )}
          {err && <p className="text-xs text-red-700">{err}</p>}
        </div>

        {/* Path B — valuation challenge */}
        <div className="rounded-md bg-white border border-amber-200 px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-medium text-foreground">B — Challenge the property valuation</p>
          <p className="text-xs text-muted-foreground">
            If you believe the enhanced valuation understates your property&apos;s fair market value,
            you can commission a licensed manual appraisal. If the result is higher, deal
            eligibility is re-evaluated.
          </p>

          {appraisalInProgress && (
            <p className="text-xs text-blue-800 font-medium">
              Valuation challenge in progress — we&apos;ll notify you when complete.
            </p>
          )}
          {appraisalComplete && (
            <p className="text-xs text-emerald-800 font-medium">
              ✓ Appraisal complete — eligibility re-evaluation in progress.
            </p>
          )}
          {!appraisalInProgress && !appraisalComplete && propertyId && (
            <Link
              href={`/properties/${propertyId}`}
              className="inline-block text-xs underline text-amber-900 hover:text-amber-700"
            >
              Go to property page to request a valuation challenge →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Buyer / shared-deal block (Case 4: ATTOM complete, still ineligible) ─────

type BuyerProps = {
  manualAppraisalStatus: string | null;
  /** When true, renegotiation has been formally requested — show pending copy instead of action copy. */
  renegotiationRequested?: boolean;
};

export function IneligibleDealBuyerBlock({ manualAppraisalStatus, renegotiationRequested = false }: BuyerProps) {
  const appraisalInProgress =
    manualAppraisalStatus === "payment_pending" || manualAppraisalStatus === "in_progress";
  const appraisalComplete = manualAppraisalStatus === "complete";

  if (renegotiationRequested) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-1.5">
        <p className="text-sm font-semibold text-blue-900">Revised terms being prepared</p>
        <p className="text-xs text-blue-800">
          The homeowner has requested revised terms. Our team is working with both parties to
          explore options. You will be notified when updated terms are ready to review.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-1.5">
      <p className="text-sm font-semibold text-amber-900">Accepted terms no longer valid — revised terms required</p>
      <p className="text-xs text-amber-800">
        The previously accepted deal terms could not be confirmed under the enhanced property
        valuation. Those terms are no longer executable. The homeowner is working to resolve
        this — either by proposing revised terms or through an additional valuation review.
      </p>
      {appraisalInProgress && (
        <p className="text-xs text-blue-800">
          An additional valuation review is currently in progress.
        </p>
      )}
      {appraisalComplete && (
        <p className="text-xs text-blue-800">
          An additional valuation review has been completed. Deal eligibility is being
          re-evaluated.
        </p>
      )}
    </div>
  );
}
