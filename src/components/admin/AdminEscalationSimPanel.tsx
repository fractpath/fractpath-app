"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  propertyId: string;
  depositStatus: string | null;
  avmStatus: string | null;
  suggestedFmv: number | null;
};

const DEPOSIT_BADGE: Record<string, { label: string; cls: string }> = {
  requested: { label: "Requested", cls: "bg-blue-100 text-blue-800" },
  paid: { label: "Paid", cls: "bg-green-100 text-green-800" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-800" },
};

const AVM_BADGE: Record<string, { label: string; cls: string }> = {
  ordered: { label: "Ordered", cls: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-800" },
};

export function AdminEscalationSimPanel({
  propertyId,
  depositStatus,
  avmStatus,
  suggestedFmv,
}: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fmvInput, setFmvInput] = useState(
    suggestedFmv != null ? String(Math.round(suggestedFmv)) : "",
  );

  async function callRoute(path: string, body: unknown) {
    setIsBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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

  const depositBase = `/api/admin/properties/${propertyId}/escalation/deposit`;
  const avmBase = `/api/admin/properties/${propertyId}/escalation/avm`;

  const depositPaid = depositStatus === "paid";
  const avmComplete = avmStatus === "completed";

  return (
    <div className="space-y-4">
      {/* Simulation disclaimer */}
      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 space-y-0.5">
        <div className="font-semibold">[SIMULATION] Admin-only placeholder</div>
        <div>
          Real payment collection and licensed appraiser ordering are not connected.
          This section simulates the manual appraisal payment and result workflow without
          affecting homeowner-facing views or live payment systems.
        </div>
      </div>

      {/* Step 1: Payment */}
      <div className="rounded-md border px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap text-sm font-medium">
          <span>Step 1 — Manual appraisal payment</span>
          {/* TODO(stripe): Replace with live Stripe payment-intent creation */}
          {depositStatus ? (
            <span
              className={`text-xs rounded-full px-2 py-0.5 font-normal ${
                DEPOSIT_BADGE[depositStatus]?.cls ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {DEPOSIT_BADGE[depositStatus]?.label ?? depositStatus}
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
              Not requested
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!depositStatus && (
            <button
              disabled={isBusy}
              onClick={() => callRoute(depositBase, { action: "request" })}
              className="text-xs rounded border px-2.5 py-1.5 hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              Mark payment requested
            </button>
          )}
          {depositStatus === "requested" && (
            <>
              <button
                disabled={isBusy}
                onClick={() => callRoute(depositBase, { action: "mark_paid" })}
                className="text-xs rounded border px-2.5 py-1.5 bg-green-50 border-green-200 hover:bg-green-100 disabled:opacity-50 cursor-pointer"
              >
                Mark payment received
              </button>
              <button
                disabled={isBusy}
                onClick={() => callRoute(depositBase, { action: "fail" })}
                className="text-xs rounded border px-2.5 py-1.5 bg-red-50 border-red-200 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
              >
                Mark payment failed
              </button>
            </>
          )}
          {depositStatus === "failed" && (
            <p className="text-xs text-red-700">
              Payment failed. Reset to retry the simulation.
            </p>
          )}
          {depositStatus && (
            <button
              disabled={isBusy}
              onClick={() => callRoute(depositBase, { action: "reset" })}
              className="text-xs rounded border px-2.5 py-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Step 2: Appraisal result */}
      <div
        className={`rounded-md border px-4 py-3 space-y-2.5 transition-opacity ${
          !depositPaid ? "opacity-40 pointer-events-none" : ""
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap text-sm font-medium">
          <span>Step 2 — Manual appraisal result</span>
          {/* TODO(appraisal): Replace with real licensed appraiser report ingestion */}
          {avmStatus ? (
            <span
              className={`text-xs rounded-full px-2 py-0.5 font-normal ${
                AVM_BADGE[avmStatus]?.cls ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {AVM_BADGE[avmStatus]?.label ?? avmStatus}
            </span>
          ) : (
            <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
              Not sent
            </span>
          )}
          {!depositPaid && (
            <span className="text-xs text-muted-foreground italic">(requires payment received)</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {!avmStatus && (
            <button
              disabled={isBusy}
              onClick={() => callRoute(avmBase, { action: "order" })}
              className="text-xs rounded border px-2.5 py-1.5 hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              Mark sent to appraiser
            </button>
          )}

          {avmStatus === "ordered" && (
            <>
              <input
                type="number"
                min={1}
                step={1000}
                placeholder="Appraised FMV ($)"
                value={fmvInput}
                onChange={(e) => setFmvInput(e.target.value)}
                className="text-xs rounded border px-2 py-1.5 w-40 font-mono"
              />
              <button
                disabled={isBusy || !fmvInput || Number(fmvInput) <= 0}
                onClick={() =>
                  callRoute(avmBase, { action: "complete", fmv_amount: Number(fmvInput) })
                }
                className="text-xs rounded border px-2.5 py-1.5 bg-green-50 border-green-200 hover:bg-green-100 disabled:opacity-50 cursor-pointer"
              >
                Submit — apply appraisal FMV
              </button>
            </>
          )}

          {avmStatus && (
            <button
              disabled={isBusy}
              onClick={() => callRoute(avmBase, { action: "reset" })}
              className="text-xs rounded border px-2.5 py-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        {avmComplete && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
            Licensed appraisal FMV applied as the controlling value basis (source:{" "}
            <span className="font-mono">manual_appraisal_sim</span>). Deal-term eligibility
            re-derives automatically from the updated basis — see the{" "}
            <strong>Linked deal</strong> section below for the current outcome.
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
