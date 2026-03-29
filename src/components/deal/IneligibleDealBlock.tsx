"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Owner-side block ─────────────────────────────────────────────────────────

type OwnerProps = {
  dealId: string;
  propertyId: string | null;
  manualAppraisalStatus: string | null;
  exceptionDescription: string | null;
};

export function IneligibleDealOwnerBlock({
  dealId,
  propertyId,
  manualAppraisalStatus,
  exceptionDescription,
}: OwnerProps) {
  const router = useRouter();
  const [logged, setLogged] = useState(false);
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
          Action required — revised terms or valuation challenge needed
        </p>
        <p className="text-xs text-amber-800">
          {exceptionDescription ??
            "The current deal terms are not eligible under the verified property value. " +
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
            If you believe the verified value understates your property&apos;s fair market value,
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

// ─── Buyer / shared-deal block ────────────────────────────────────────────────

type BuyerProps = {
  manualAppraisalStatus: string | null;
};

export function IneligibleDealBuyerBlock({ manualAppraisalStatus }: BuyerProps) {
  const appraisalInProgress =
    manualAppraisalStatus === "payment_pending" || manualAppraisalStatus === "in_progress";
  const appraisalComplete = manualAppraisalStatus === "complete";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-1.5">
      <p className="text-sm font-semibold text-amber-900">Revised terms required</p>
      <p className="text-xs text-amber-800">
        The current deal terms require revision based on the property valuation review. The
        homeowner is working to resolve this — either by proposing revised terms or through an
        additional valuation review.
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
