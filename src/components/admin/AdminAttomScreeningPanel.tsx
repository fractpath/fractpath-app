"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NormalizedScreeningResult } from "@/lib/property/screening";
import type { AttomRawComposite } from "@/lib/property-review/providers/attom/types";

// ─── Sub-types ────────────────────────────────────────────────────────────────

type LastRun = {
  status: string;
  requested_at: string;
  normalized_payload: NormalizedScreeningResult | null;
  raw_payload: AttomRawComposite | null;
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

function fmtPct(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${(val * 100).toFixed(1)}%`;
}

// ─── Badge maps ───────────────────────────────────────────────────────────────

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

const CONFIDENCE_CLS: Record<string, string> = {
  high: "text-green-700",
  medium: "text-yellow-700",
  low: "text-red-700",
};

// ─── Helpers for deriving AVM confidence from raw range ───────────────────────

function deriveConfidenceFromRange(
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): "high" | "medium" | "low" | null {
  if (!value || value <= 0 || low == null || high == null) return null;
  const spreadRatio = (high - low) / value;
  if (spreadRatio <= 0.08) return "high";
  if (spreadRatio <= 0.15) return "medium";
  return "low";
}

// ─── Section A: ATTOM Native Facts ────────────────────────────────────────────

function AttomFactsSection({ raw }: { raw: AttomRawComposite }) {
  const pd = raw.propertyDetail;
  const avmRec = raw.avmDetail;

  const attomId =
    pd?.identifier?.attomId ??
    avmRec?.identifier?.attomId ??
    null;

  const matchedAddress = pd?.address
    ? [
        pd.address.line1,
        pd.address.locality,
        pd.address.countrySubd,
        pd.address.postal1,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  const avmValue = avmRec?.avm?.amount?.value ?? null;
  const avmLow = avmRec?.avm?.amount?.low ?? null;
  const avmHigh = avmRec?.avm?.amount?.high ?? null;
  const confidence = deriveConfidenceFromRange(avmValue, avmLow, avmHigh);
  const propIndicator = avmRec?.avm?.condition?.propIndicator ?? null;

  const estEquity = avmRec?.homeEquity?.estEquity ?? null;
  const estEquityPct = avmRec?.homeEquity?.estEquityPct ?? null;
  const estEstimatedValue = avmRec?.homeEquity?.estEstimatedValue ?? null;

  const proptype = pd?.summary?.proptype ?? null;
  const propclass = pd?.summary?.propclass ?? null;
  const yearbuilt = pd?.summary?.yearbuilt ?? null;
  const propLandUse = pd?.summary?.propLandUse ?? null;

  const owner1 = pd?.owner?.owner1;
  const owner2 = pd?.owner?.owner2;
  const corpIndicator = pd?.owner?.corporateIndicator ?? null;

  function Row({ label, value }: { label: string; value: React.ReactNode }) {
    if (value == null || value === "" || value === "—") return null;
    return (
      <div className="flex items-start gap-3">
        <span className="w-44 shrink-0 text-xs text-muted-foreground leading-5">{label}</span>
        <span className="text-xs text-foreground leading-5 font-medium">{value}</span>
      </div>
    );
  }

  const hasAnyData =
    attomId != null ||
    matchedAddress != null ||
    avmValue != null ||
    estEquity != null ||
    proptype != null ||
    owner1 != null;

  if (!hasAnyData) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No raw ATTOM payload available for this run.
      </div>
    );
  }

  return (
    <div className="space-y-2">

      {/* Property identity */}
      {(attomId != null || matchedAddress != null) && (
        <div className="space-y-1">
          <Row label="ATTOM property ID" value={attomId != null ? String(attomId) : null} />
          <Row label="Matched address" value={matchedAddress} />
        </div>
      )}

      {/* Property type */}
      {(proptype != null || propclass != null || yearbuilt != null || propLandUse != null) && (
        <div className="pt-1 space-y-1">
          <Row label="Property type" value={proptype} />
          <Row label="Property class" value={propclass} />
          <Row label="Land use" value={propLandUse} />
          <Row label="Year built" value={yearbuilt != null ? String(yearbuilt) : null} />
        </div>
      )}

      {/* AVM */}
      {avmValue != null && (
        <div className="pt-1 rounded-md border bg-muted/20 px-3 py-2 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">ATTOM AVM</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <div className="text-xs text-muted-foreground">Point estimate</div>
              <div className="text-xs font-semibold">{fmtCurrency(avmValue)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Range</div>
              <div className="text-xs font-medium">
                {avmLow != null && avmHigh != null
                  ? `${fmtCurrency(avmLow)} – ${fmtCurrency(avmHigh)}`
                  : "—"}
              </div>
            </div>
            {confidence != null && (
              <div>
                <div className="text-xs text-muted-foreground">Derived confidence</div>
                <div className={`text-xs font-medium capitalize ${CONFIDENCE_CLS[confidence] ?? ""}`}>
                  {confidence}
                </div>
              </div>
            )}
            {propIndicator != null && (
              <div>
                <div className="text-xs text-muted-foreground">Prop indicator</div>
                <div className="text-xs font-medium">{propIndicator}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Home equity signals */}
      {(estEquity != null || estEstimatedValue != null) && (
        <div className="pt-1 rounded-md border bg-muted/20 px-3 py-2 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">ATTOM home equity signals</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {estEstimatedValue != null && (
              <div>
                <div className="text-xs text-muted-foreground">Est. market value</div>
                <div className="text-xs font-medium">{fmtCurrency(estEstimatedValue)}</div>
              </div>
            )}
            {estEquity != null && (
              <div>
                <div className="text-xs text-muted-foreground">Est. equity</div>
                <div className="text-xs font-medium">{fmtCurrency(estEquity)}</div>
              </div>
            )}
            {estEquityPct != null && (
              <div>
                <div className="text-xs text-muted-foreground">Equity %</div>
                <div className="text-xs font-medium">{fmtPct(estEquityPct)}</div>
              </div>
            )}
            {estEquity != null && avmValue != null && (
              <div>
                <div className="text-xs text-muted-foreground">Implied lien total</div>
                <div className="text-xs font-medium">{fmtCurrency(Math.max(0, avmValue - estEquity))}</div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground italic">
            Implied lien = AVM value − est. equity (ATTOM secondary signal, not a title search).
          </p>
        </div>
      )}

      {/* Owner record */}
      {(owner1 != null || owner2 != null || corpIndicator != null) && (
        <div className="pt-1 space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Owner record (ATTOM)</div>
          {owner1 && (
            <Row
              label="Owner 1"
              value={[owner1.firstNameAndMi, owner1.lastName].filter(Boolean).join(" ") || "—"}
            />
          )}
          {owner2 && (
            <Row
              label="Owner 2"
              value={[owner2.firstNameAndMi, owner2.lastName].filter(Boolean).join(" ") || "—"}
            />
          )}
          {corpIndicator != null && (
            <Row label="Corporate indicator" value={corpIndicator} />
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground pt-1">
        Fetched: {fmtDate(raw.fetchedAt)}
      </p>
    </div>
  );
}

// ─── Section B: FractPath Interpretation ─────────────────────────────────────

function FractpathInterpretationSection({
  payload,
  outcomeBadge,
}: {
  payload: NormalizedScreeningResult;
  outcomeBadge: { label: string; cls: string } | null;
}) {
  return (
    <div className="space-y-3">
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
          <div className="text-xs text-muted-foreground">Controlling FMV candidate</div>
          <div className="font-medium">{fmtCurrency(payload.controllingFmvCandidate)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Eligible cash (policy-adjusted)</div>
          <div className="font-medium">{fmtCurrency(payload.fractpathEligibleCashCap)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Raw estimated cash (pre-cap)</div>
          <div className="font-medium">{fmtCurrency(payload.rawEstimatedAvailableCash)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Next verification state</div>
          <div className="text-xs font-medium text-muted-foreground font-mono">
            {payload.nextVerificationState ?? "—"}
          </div>
        </div>
      </div>

      {/* FMV discrepancy */}
      {payload.valueDiscrepancyResult && (
        <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">FMV discrepancy analysis</div>
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
          {payload.valueDiscrepancyResult.notes && (
            <div className="text-xs text-muted-foreground mt-1">{payload.valueDiscrepancyResult.notes}</div>
          )}
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
              <div className="text-muted-foreground">ATTOM equity-implied</div>
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

      {/* Owner match (FractPath assessment) */}
      <div className="flex items-start gap-3 text-xs">
        <span className="text-muted-foreground shrink-0">Owner identity assessment:</span>
        {payload.ownerMatchResult ? (
          <div>
            <span className={`font-medium ${payload.ownerMatchResult.matched ? "text-green-700" : "text-orange-700"}`}>
              {payload.ownerMatchResult.matched ? "Matched" : "No match"}
              {payload.ownerMatchResult.confidence && (
                <span className="ml-1 font-normal opacity-75">({payload.ownerMatchResult.confidence} confidence)</span>
              )}
            </span>
            {payload.ownerMatchResult.notes && (
              <p className="text-muted-foreground mt-0.5">{payload.ownerMatchResult.notes}</p>
            )}
          </div>
        ) : "—"}
      </div>

      {/* Limiting factors */}
      {payload.limitingFactors.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Limiting factors</div>
          <div className="flex flex-wrap gap-1.5">
            {payload.limitingFactors.map((f) => (
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

      {/* Review notes */}
      {payload.reviewNotes && (
        <div className="text-xs text-muted-foreground italic border-t pt-2">
          {payload.reviewNotes}
        </div>
      )}
    </div>
  );
}

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
  const rawPayload = lastRun?.raw_payload ?? null;

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

        {/* ── Applied property state (canonical DB fields) ─────────────────── */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Applied to property
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
              <div className="text-xs text-muted-foreground">Controlling FMV (canonical)</div>
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
              <div className="text-xs text-muted-foreground">Eligible cash cap (canonical)</div>
              <div className="font-medium">
                {eligibleCashCap != null ? fmtCurrency(eligibleCashCap) : (
                  <span className="text-muted-foreground text-xs">Not set</span>
                )}
              </div>
            </div>
          </div>

          {limitingFactors.length > 0 && (
            <div className="pt-1 space-y-1">
              <div className="text-xs text-muted-foreground">Canonical limiting factors</div>
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

        {/* ── Last run detail ────────────────────────────────────────────────── */}
        {lastRun && (payload || rawPayload) && (
          <div className="border-t pt-4 space-y-5">
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

            {/* ── A: ATTOM Facts ────────────────────────────────────────────── */}
            {rawPayload && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold text-foreground">ATTOM data</div>
                  <span className="text-xs rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200">
                    Vendor-native
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Raw facts returned by ATTOM Data Solutions. Presented without FractPath policy interpretation.
                </p>
                <AttomFactsSection raw={rawPayload} />
              </div>
            )}

            {/* ── B: FractPath Interpretation ───────────────────────────────── */}
            {payload && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold text-foreground">FractPath interpretation</div>
                  <span className="text-xs rounded-full px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200">
                    Internal policy / underwriting
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  FractPath&apos;s policy-derived assessment of the ATTOM data. Outcome labels (e.g. "clean", "weak") reflect
                  FractPath underwriting logic, not ATTOM&apos;s own classifications.
                </p>
                <FractpathInterpretationSection payload={payload} outcomeBadge={outcomeBadge} />
              </div>
            )}
          </div>
        )}

        {/* ── In-session run result (before page refresh) ──────────────────── */}
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

        {/* ── Trigger ────────────────────────────────────────────────────────── */}
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
