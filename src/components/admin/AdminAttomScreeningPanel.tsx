"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NormalizedScreeningResult } from "@/lib/property/screening";

// ─── Sub-types for normalized_payload fields we display ──────────────────────

type LastRun = {
  status: string;
  requested_at: string;
  normalized_payload: NormalizedScreeningResult | null;
};

type Props = {
  propertyId: string;
  lastRun: LastRun | null;
  // Canonical property fields materialised by the last completed screening run
  verificationState: string | null;
  eligibilityPosture: string | null;
  limitingFactorsJson: unknown;
  latestVerifiedFmv: number | null;
  fmvVerificationSource: string | null;
  eligibleCashCap: number | null;
};

// ─── Display helpers ──────────────────────────────────────────────────────────

function fmtCurrency(val: number | null | undefined): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(val);
  }
}

const OUTCOME_BADGE: Record<string, { label: string; cls: string }> = {
  clean: { label: "Clean", cls: "bg-green-100 text-green-800" },
  discrepancy: { label: "Discrepancy", cls: "bg-yellow-100 text-yellow-800" },
  disputed: { label: "Disputed", cls: "bg-red-100 text-red-800" },
  weak: { label: "Weak AVM", cls: "bg-orange-100 text-orange-800" },
  stale: { label: "Stale", cls: "bg-gray-100 text-gray-600" },
  unsupported: { label: "Unsupported", cls: "bg-red-100 text-red-800" },
};

const SEVERITY_CLS: Record<string, string> = {
  none: "text-green-700",
  minor: "text-yellow-700",
  significant: "text-orange-700",
  blocking: "text-red-700",
};

const LIMITING_SEVERITY_CLS: Record<string, string> = {
  warning: "bg-yellow-100 text-yellow-800",
  blocking: "bg-red-100 text-red-800",
};

const POSTURE_BADGE: Record<string, { label: string; cls: string }> = {
  eligible: { label: "Eligible", cls: "bg-green-100 text-green-800" },
  under_review: { label: "Under review", cls: "bg-yellow-100 text-yellow-800" },
  requires_enhanced_review: { label: "Enhanced review required", cls: "bg-orange-100 text-orange-800" },
  ineligible: { label: "Ineligible", cls: "bg-red-100 text-red-800" },
};

const VSTATE_BADGE: Record<string, { label: string; cls: string }> = {
  verified_for_deals: { label: "Verified for deals", cls: "bg-green-100 text-green-800" },
  owner_clarification_required: { label: "Owner clarification required", cls: "bg-yellow-100 text-yellow-800" },
  manual_review_required: { label: "Manual review required", cls: "bg-orange-100 text-orange-800" },
  ineligible: { label: "Ineligible", cls: "bg-red-100 text-red-800" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminAttomScreeningPanel({
  propertyId,
  lastRun,
  verificationState,
  eligibilityPosture,
  limitingFactorsJson,
  latestVerifiedFmv,
  fmvVerificationSource,
  eligibleCashCap,
}: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    outcome: string;
    nextVerificationState: string;
    becameControlling: boolean;
    limitingFactors: Array<{ code: string; label: string; severity: string }>;
  } | null>(null);

  async function handleRunAttom() {
    setIsBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/review/run-attom-screening`,
        { method: "POST", credentials: "include" },
      );
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? `ATTOM screening failed (${res.status})`);
      } else {
        setLastResult({
          outcome: body.outcome,
          nextVerificationState: body.nextVerificationState,
          becameControlling: body.becameControlling,
          limitingFactors: body.limitingFactors ?? [],
        });
        router.refresh();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIsBusy(false);
    }
  }

  const payload = lastRun?.normalized_payload ?? null;

  const outcomeBadge = payload?.outcome ? (OUTCOME_BADGE[payload.outcome] ?? null) : null;
  const postureBadge = eligibilityPosture ? (POSTURE_BADGE[eligibilityPosture] ?? null) : null;
  const vstateBadge = verificationState ? (VSTATE_BADGE[verificationState] ?? null) : null;

  const limitingFactors = Array.isArray(limitingFactorsJson)
    ? (limitingFactorsJson as Array<{ code: string; label: string; severity: string }>)
    : [];

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/40 px-4 py-2 text-sm font-semibold border-b flex items-center gap-2 flex-wrap">
        <span>ATTOM enhanced screening</span>
        {outcomeBadge && (
          <span className={`text-xs rounded-full px-2 py-0.5 font-normal ${outcomeBadge.cls}`}>
            {outcomeBadge.label}
          </span>
        )}
        {!lastRun && (
          <span className="text-xs rounded-full px-2 py-0.5 font-normal bg-gray-100 text-gray-500">
            Not run
          </span>
        )}
      </div>

      <div className="p-4 space-y-5 text-sm">

        {/* ── Canonical property screening state ─────────────────────── */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Canonical screening state (applied to property)
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <div className="text-xs text-muted-foreground">Verification state</div>
              <div className="font-medium">
                {vstateBadge ? (
                  <span className={`text-xs rounded-full px-2 py-0.5 ${vstateBadge.cls}`}>
                    {vstateBadge.label}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{verificationState?.replace(/_/g, " ") ?? "—"}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Eligibility posture</div>
              <div className="font-medium">
                {postureBadge ? (
                  <span className={`text-xs rounded-full px-2 py-0.5 ${postureBadge.cls}`}>
                    {postureBadge.label}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{eligibilityPosture?.replace(/_/g, " ") ?? "—"}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Controlling FMV (ATTOM)</div>
              <div className="font-medium">
                {fmtCurrency(latestVerifiedFmv)}
                {fmvVerificationSource && (
                  <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                    [{fmvVerificationSource}]
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Eligible cash cap</div>
              <div className="font-medium">
                {eligibleCashCap != null ? fmtCurrency(eligibleCashCap) : (
                  <span className="text-muted-foreground text-xs">Not set</span>
                )}
              </div>
            </div>
          </div>

          {limitingFactors.length > 0 && (
            <div className="pt-1 space-y-1">
              <div className="text-xs text-muted-foreground">Limiting factors</div>
              <div className="flex flex-wrap gap-1.5">
                {limitingFactors.map((f) => (
                  <span
                    key={f.code}
                    className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                      LIMITING_SEVERITY_CLS[f.severity] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Last run result ───────────────────────────────────────── */}
        {lastRun && payload && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Last run
              </div>
              <span className="text-xs text-muted-foreground">
                {fmtDate(lastRun.requested_at)}
              </span>
              {lastRun.status !== "completed" && (
                <span className="text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                  {lastRun.status}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <div className="text-xs text-muted-foreground">Outcome</div>
                <div className="font-medium capitalize">
                  {outcomeBadge ? (
                    <span className={`text-xs rounded-full px-2 py-0.5 ${outcomeBadge.cls}`}>
                      {outcomeBadge.label}
                    </span>
                  ) : (payload.outcome ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Became controlling</div>
                <div className={`font-medium ${payload.becameControlling ? "text-green-700" : "text-muted-foreground"}`}>
                  {payload.becameControlling ? "Yes — FMV applied" : "No"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">AVM FMV candidate</div>
                <div className="font-medium">{fmtCurrency(payload.controllingFmvCandidate)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Eligible cash (policy-adjusted)</div>
                <div className="font-medium">{fmtCurrency(payload.fractpathEligibleCashCap)}</div>
              </div>
            </div>

            {/* FMV discrepancy */}
            {payload.valueDiscrepancyResult && (
              <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">FMV discrepancy</div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <div className="text-muted-foreground">Owner-stated</div>
                    <div className="font-medium">{fmtCurrency(payload.valueDiscrepancyResult.ownerStatedFmv)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">ATTOM AVM</div>
                    <div className="font-medium">{fmtCurrency(payload.valueDiscrepancyResult.screeningFmv)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Delta</div>
                    <div className={`font-medium ${SEVERITY_CLS[payload.valueDiscrepancyResult.severity ?? ""] ?? ""}`}>
                      {payload.valueDiscrepancyResult.deltaPercent != null
                        ? `${payload.valueDiscrepancyResult.deltaPercent > 0 ? "+" : ""}${payload.valueDiscrepancyResult.deltaPercent.toFixed(1)}%`
                        : "—"}
                      {payload.valueDiscrepancyResult.severity && payload.valueDiscrepancyResult.severity !== "none" && (
                        <span className="ml-1.5 capitalize opacity-80">
                          ({payload.valueDiscrepancyResult.severity})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Debt discrepancy */}
            {payload.debtDiscrepancyResult?.discrepancyFound && (
              <div className="rounded-md border bg-yellow-50 border-yellow-200 px-3 py-2.5 space-y-1.5">
                <div className="text-xs font-medium text-yellow-900">Debt discrepancy detected</div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <div className="text-muted-foreground">Owner-declared</div>
                    <div className="font-medium">{fmtCurrency(payload.debtDiscrepancyResult.reportedDebt)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">ATTOM estimate</div>
                    <div className="font-medium">{fmtCurrency(payload.debtDiscrepancyResult.screeningDebt)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Severity</div>
                    <div className={`font-medium capitalize ${SEVERITY_CLS[payload.debtDiscrepancyResult.severity ?? ""] ?? ""}`}>
                      {payload.debtDiscrepancyResult.severity?.replace(/_/g, " ") ?? "—"}
                    </div>
                  </div>
                </div>
                {payload.debtDiscrepancyResult.notes && (
                  <div className="text-xs text-yellow-800 mt-1">{payload.debtDiscrepancyResult.notes}</div>
                )}
              </div>
            )}

            {/* Owner match */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Owner identity match:</span>
              {payload.ownerMatchResult ? (
                <span className={`font-medium ${payload.ownerMatchResult.matched ? "text-green-700" : "text-orange-700"}`}>
                  {payload.ownerMatchResult.matched ? "Matched" : "No match"}
                  {payload.ownerMatchResult.confidence && (
                    <span className="ml-1 font-normal opacity-75">({payload.ownerMatchResult.confidence} confidence)</span>
                  )}
                </span>
              ) : "—"}
            </div>

            {/* Review notes */}
            {payload.reviewNotes && (
              <div className="text-xs text-muted-foreground italic border-t pt-2">
                {payload.reviewNotes}
              </div>
            )}
          </div>
        )}

        {/* ── In-session run result (before page refresh) ──────────── */}
        {lastResult && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2.5 text-xs text-green-800 space-y-1">
            <div className="font-semibold">ATTOM screening complete — page refreshing</div>
            <div>
              Outcome: <span className="font-medium capitalize">{lastResult.outcome}</span>
              {" · "}
              State: <span className="font-medium">{lastResult.nextVerificationState.replace(/_/g, " ")}</span>
              {" · "}
              {lastResult.becameControlling
                ? <span className="font-medium text-green-700">FMV applied as controlling value</span>
                : <span>FMV not applied (non-clean outcome)</span>}
            </div>
            {lastResult.limitingFactors.length > 0 && (
              <div>
                Limiting factors:{" "}
                {lastResult.limitingFactors.map((f) => f.label).join(", ")}
              </div>
            )}
          </div>
        )}

        {/* ── Trigger ──────────────────────────────────────────────── */}
        <div className={lastRun || lastResult ? "border-t pt-4" : ""}>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleRunAttom}
              disabled={isBusy}
              className="text-xs px-3 py-1.5 rounded border bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-800 font-medium disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              {isBusy ? "Running ATTOM screening…" : lastRun ? "Re-run ATTOM screening" : "Run ATTOM screening"}
            </button>
            {lastRun && !lastResult && (
              <span className="text-xs text-muted-foreground">
                Last run: {fmtDate(lastRun.requested_at)}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Fetches live ATTOM property detail + AVM. On a clean outcome the controlling FMV,
            verification state, and eligible cash cap are updated immediately. Runs are logged
            to the screening run history.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

      </div>
    </div>
  );
}
