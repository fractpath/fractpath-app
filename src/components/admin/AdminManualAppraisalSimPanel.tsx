"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  propertyId: string;
  appraisalStatus: string | null;
  appraisalFmv: number | null;
  escalatedFmv: number | null;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  available: { label: "Challenge available", cls: "bg-yellow-100 text-yellow-800" },
  payment_pending: { label: "Payment pending", cls: "bg-orange-100 text-orange-800" },
  in_progress: { label: "Appraisal in progress", cls: "bg-blue-100 text-blue-800" },
  complete: { label: "Completed", cls: "bg-emerald-100 text-emerald-800" },
};

export function AdminManualAppraisalSimPanel({
  propertyId,
  appraisalStatus,
  appraisalFmv,
  escalatedFmv,
}: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fmvInput, setFmvInput] = useState(
    escalatedFmv != null ? String(Math.round(escalatedFmv)) : "",
  );

  async function callRoute(action: string, extra?: Record<string, unknown>) {
    setIsBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/manual-appraisal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
      } else {
        router.refresh();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIsBusy(false);
    }
  }

  const badge = appraisalStatus ? STATUS_BADGE[appraisalStatus] : null;

  return (
    <div className="space-y-4">
      {/* Simulation disclaimer */}
      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 space-y-0.5">
        <div className="font-semibold">[SIMULATION] Admin-only placeholder</div>
        <div>
          Real licensed appraisal ordering, payment collection, and report delivery are not connected.
          This section simulates the manual appraisal challenge branch without affecting
          live payment systems or real appraisal vendors.
        </div>
      </div>

      {/* Context */}
      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-800 space-y-0.5">
        <div className="font-semibold">Purpose</div>
        <div>
          When a deal is ineligible because the stronger (escalated) AVM makes deal terms exceed
          FractPath&apos;s LTV policy, the homeowner can challenge the automated valuation by
          commissioning a licensed manual appraisal. If the manual appraisal returns a higher FMV,
          the controlling basis is updated and deal eligibility is re-evaluated.
        </div>
      </div>

      {/* Current status */}
      <div className="rounded-md border px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap text-sm font-medium">
          <span>Manual appraisal challenge</span>
          {badge ? (
            <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${badge.cls}`}>
              {badge.label}
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
              Not initiated
            </span>
          )}
        </div>

        {appraisalStatus === "complete" && appraisalFmv != null && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
            Manual appraisal FMV applied as new controlling basis:{" "}
            <span className="font-semibold">
              ${Math.round(appraisalFmv).toLocaleString()}
            </span>{" "}
            (source: <span className="font-mono">manual_appraisal_sim</span>).
            Admin must retriage the linked deal to re-evaluate eligibility under the new FMV.
          </div>
        )}

        {/* Step buttons */}
        <div className="flex flex-wrap gap-2 items-start">
          {/* Step 1: Initiate */}
          {(!appraisalStatus || appraisalStatus === "complete") && (
            <button
              disabled={isBusy}
              onClick={() => callRoute("initiate")}
              className="text-xs rounded border px-2.5 py-1.5 hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              Initiate challenge
            </button>
          )}

          {/* Step 2: Payment pending */}
          {appraisalStatus === "available" && (
            <button
              disabled={isBusy}
              onClick={() => callRoute("mark_payment_pending")}
              className="text-xs rounded border px-2.5 py-1.5 bg-orange-50 border-orange-200 hover:bg-orange-100 disabled:opacity-50 cursor-pointer"
            >
              Mark payment pending
            </button>
          )}

          {/* Step 3: In progress */}
          {appraisalStatus === "payment_pending" && (
            <button
              disabled={isBusy}
              onClick={() => callRoute("mark_in_progress")}
              className="text-xs rounded border px-2.5 py-1.5 bg-blue-50 border-blue-200 hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
            >
              Mark in progress (payment confirmed)
            </button>
          )}

          {/* Step 4: Complete */}
          {appraisalStatus === "in_progress" && (
            <>
              <input
                type="number"
                min={1}
                step={1000}
                placeholder="Manual appraisal FMV ($)"
                value={fmvInput}
                onChange={(e) => setFmvInput(e.target.value)}
                className="text-xs rounded border px-2 py-1.5 w-48 font-mono"
              />
              <button
                disabled={isBusy || !fmvInput || Number(fmvInput) <= 0}
                onClick={() =>
                  callRoute("complete", { fmv_amount: Number(fmvInput) })
                }
                className="text-xs rounded border px-2.5 py-1.5 bg-green-50 border-green-200 hover:bg-green-100 disabled:opacity-50 cursor-pointer"
              >
                Complete — apply manual FMV
              </button>
            </>
          )}

          {/* Reset */}
          {appraisalStatus && (
            <button
              disabled={isBusy}
              onClick={() => callRoute("reset")}
              className="text-xs rounded border px-2.5 py-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
