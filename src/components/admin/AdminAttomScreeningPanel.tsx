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
//
// Diagnostic-complete rendering of every ATTOM fact group.
//
// Design rules:
//   1. Every group (identity, property type, AVM, equity/debt, mortgage, owner)
//      is ALWAYS rendered — even when the group is empty.
//   2. Every field that is absent shows an explicit absence label so an operator
//      can distinguish: (a) ATTOM did not return it, (b) it is subscription-gated,
//      (c) the whole endpoint returned no payload.
//   3. ATTOM's actual API response uses lowercase field names in several objects
//      (e.g. owner.owner1.lastname, mortgage.deedtype).  The raw payload is stored
//      verbatim from the API response, so we read both lowercase and camelCase to
//      be resilient to field-name drift across subscription tiers / API versions.
//   4. mortgage may be an object OR an array depending on subscription tier.
//      Both formats are handled.

type AbsenceReason =
  | "not returned by ATTOM"
  | "subscription-gated"
  | "endpoint returned no data";

function Field({
  label,
  value,
  absent = "not returned by ATTOM",
  wide,
}: {
  label: string;
  value: React.ReactNode | null | undefined;
  absent?: AbsenceReason | string;
  wide?: boolean;
}) {
  const display = value ?? null;
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="text-xs text-muted-foreground">{label}</div>
      {display != null ? (
        <div className="text-xs font-medium">{display}</div>
      ) : (
        <div className="text-xs text-muted-foreground/50 italic">{absent}</div>
      )}
    </div>
  );
}

function SectionBox({
  title,
  subtitle,
  children,
  absent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  absent?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {subtitle && (
          <span className="text-xs text-muted-foreground/60 italic">{subtitle}</span>
        )}
        {absent && (
          <span className="text-xs text-muted-foreground/50 italic">— {absent}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function DiagRow({
  label,
  ok,
  okLabel,
  failLabel,
}: {
  label: string;
  ok: boolean;
  okLabel: string;
  failLabel: string;
}) {
  return (
    <>
      <div className="text-muted-foreground">{label}</div>
      <div className={ok ? "text-green-700 font-medium" : "text-orange-700 italic"}>
        {ok ? okLabel : failLabel}
      </div>
    </>
  );
}

function AttomFactsSection({ raw }: { raw: AttomRawComposite }) {
  // Cast to any to handle actual ATTOM response field names.
  // ATTOM's API returns lowercase keys in several objects (owner, mortgage).
  // Our TypeScript types define camelCase for clarity, but the stored raw_payload
  // reflects the verbatim API response. We read both cases defensively.
  const pd = raw.propertyDetail as any;
  const avmRec = raw.avmDetail as any;
  // homeEquityDetail is from /valuation/homeequity — the primary current-debt source.
  // May be null for run records created before this endpoint was added to the flow.
  const heRec = (raw as any).homeEquityDetail as any;

  // Per-endpoint audit records — present in runs created after _endpoints tracking
  // was added. Absent (undefined) in older run records.
  const endpoints = (raw as any)._endpoints as NonNullable<AttomRawComposite["_endpoints"]> | undefined;
  const heEp = endpoints?.valuation_homeequity;
  const pdEp = endpoints?.detailmortgageowner;
  const avmEp = endpoints?.attomavm_detail;

  // Was this run created before _endpoints tracking was added?
  const isPreAuditRun = endpoints == null;

  const pdPresent = pd != null;
  const avmPresent = avmRec != null;
  const hePresent = heRec != null;

  // Per-endpoint status (only available in post-audit runs)
  const heEpFulfilled = heEp?.status === "fulfilled";
  const heEpRejected = heEp?.status === "rejected";
  const heEpError = heEp?.errorMessage ?? null;
  const heEpTopLevelKeys: string[] = heEp?.topLevelKeys ?? [];
  const heEpHasPropertyArray = heEpTopLevelKeys.includes("property");
  const heEpExtractedRecord = heEp?.extractedRecord ?? null;
  // fullResponse.property[] length helps diagnose "property array exists but is empty"
  const heEpPropertyArrayLen: number | null =
    heEp?.fullResponse != null
      ? ((heEp.fullResponse as any)?.property?.length ?? null)
      : null;

  // ── A. Property identity ──────────────────────────────────────────────────
  const attomId =
    pd?.identifier?.attomId ??
    pd?.identifier?.Id ??
    avmRec?.identifier?.attomId ??
    avmRec?.identifier?.Id ??
    null;

  const matchedAddress = pd?.address
    ? [
        pd.address.line1,
        pd.address.locality,
        pd.address.countrySubd,
        pd.address.postal1,
      ]
        .filter(Boolean)
        .join(", ") || null
    : null;

  // matchCode — ATTOM address match quality indicator (e.g. "ExaStr" = exact street match)
  const matchCode =
    pd?.address?.matchCode ?? avmRec?.address?.matchCode ?? null;

  // ── B. Property type ──────────────────────────────────────────────────────
  const proptype = pd?.summary?.proptype ?? null;
  const propclass = pd?.summary?.propclass ?? null;
  const yearbuilt = pd?.summary?.yearbuilt ?? null;
  const propLandUse = pd?.summary?.propLandUse ?? null;

  // ── C. AVM ───────────────────────────────────────────────────────────────
  const avmAmount = avmRec?.avm?.amount;
  const avmValue = avmAmount?.value ?? null;
  const avmLow = avmAmount?.low ?? null;
  const avmHigh = avmAmount?.high ?? null;
  // scr is returned inside avm.amount (not avm.condition) in the actual API response.
  // Also check avm.condition.scr as fallback for future API versions.
  const avmScr = avmAmount?.scr ?? avmRec?.avm?.condition?.scr ?? null;
  const propIndicator =
    avmRec?.avm?.condition?.propIndicator ?? pd?.summary?.propIndicator ?? null;
  // ATTOM returns the AVM run date as "eventDate" in the actual response.
  // Our type named this "pubDate"; check both.
  const avmEventDate = avmRec?.avm?.eventDate ?? avmRec?.avm?.pubDate ?? null;
  const confidence = deriveConfidenceFromRange(avmValue, avmLow, avmHigh);

  // ── D. Home equity / debt signals ─────────────────────────────────────────
  // homeEquity is subscription-gated. If avmRec is present but homeEquity is absent,
  // this subscription tier does not include equity signals.
  const homeEquityBlock = avmRec?.homeEquity ?? null;
  const homeEquityPresent = homeEquityBlock != null;
  const estEquity = homeEquityBlock?.estEquity ?? null;
  const estEquityPct = homeEquityBlock?.estEquityPct ?? null;
  const estEstimatedValue = homeEquityBlock?.estEstimatedValue ?? null;
  const impliedLien =
    avmValue != null && estEquity != null
      ? Math.max(0, avmValue - estEquity)
      : null;

  // ── E. Mortgage record ───────────────────────────────────────────────────
  // ATTOM may return mortgage as an object OR an array.
  // Fields use lowercase names in the actual API response.
  const mortgageRaw = pd?.mortgage ?? null;
  const mortgagePresent = mortgageRaw != null;
  const mortgage = mortgageRaw
    ? Array.isArray(mortgageRaw)
      ? (mortgageRaw[0] ?? null)
      : mortgageRaw
    : null;

  // Read both ATTOM lowercase names and our camelCase type names
  const mortgageAmount = mortgage?.amount ?? null;
  const mortgageDate = mortgage?.date ?? null;
  const mortgageRate = mortgage?.interestRate ?? null;
  const mortgageLoanType = mortgage?.loanTypeCode ?? mortgage?.loantype ?? null;
  const mortgageDeedType = mortgage?.deedtype ?? mortgage?.deedType ?? null;
  const mortgageTerm = mortgage?.term ?? null;
  const mortgageDueDate =
    (mortgage?.duedate != null && mortgage.duedate !== ""
      ? mortgage.duedate
      : null) ??
    (mortgage?.dueDate != null && mortgage.dueDate !== ""
      ? mortgage.dueDate
      : null);
  const mortgageEquityFlag = mortgage?.equityFlag ?? mortgage?.equityflag ?? null;
  const mortgageRefiFlag = mortgage?.refiFlag ?? mortgage?.refiflag ?? null;
  // lender — extra field returned by detailmortgageowner, not in our type but visible in raw
  const mortgageLender =
    mortgage?.lender?.lastname ??
    mortgage?.lender?.companyName ??
    mortgage?.lender?.companycode ??
    null;

  // ── F. Owner record ────────────────────────────────────────────────────
  // ATTOM returns lowercase field names: lastname, firstnameandmi, corporateindicator.
  // Also has: fullname (convenient concatenation), owner2/3/4 (usually empty objects).
  const ownerBlock = pd?.owner ?? null;
  const ownerPresent = ownerBlock != null;
  const owner1Raw = ownerBlock?.owner1 ?? null;
  const owner2Raw = ownerBlock?.owner2 ?? null;

  // Read both ATTOM lowercase and camelCase type field names
  function extractOwnerName(ownerRaw: Record<string, unknown> | null): string | null {
    if (!ownerRaw) return null;
    const full = ownerRaw.fullname as string | undefined;
    if (full) return full;
    const parts = [
      (ownerRaw.firstnameandmi ?? ownerRaw.firstNameAndMi) as string | undefined,
      (ownerRaw.lastname ?? ownerRaw.lastName) as string | undefined,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : null;
  }

  const owner1Name = extractOwnerName(owner1Raw);
  const owner2Name = extractOwnerName(owner2Raw);

  const corpIndicator =
    ownerBlock?.corporateindicator ??
    ownerBlock?.corporateIndicator ??
    null;

  const absenteeStatus = ownerBlock?.absenteeownerstatus ?? null;

  // ── E. Home equity / debt support (/valuation/homeequity) ─────────────────
  // This is the primary current-debt signal — preferred over AVM-implied equity.
  // heRec may be null for old run records (created before the 3rd endpoint was added).
  const heData = heRec?.homeEquity ?? null;
  const heDataPresent = heData != null;
  const heLtv = heData?.LTV ?? null;
  const heEstAvailEquity = heData?.estimatedAvailableEquity ?? null;
  const heEstLendableEquity = heData?.estimatedLendableEquity ?? null;
  const heFirstLoan = heData?.firstAmortizedLoanAmount ?? null;
  const heSecondLoan = heData?.secondAmortizedLoanAmount ?? null;
  const heThirdLoan = heData?.thirdAmortizedLoanAmount ?? null;
  const heTotalBalance = heData?.totalEstimatedLoanBalance ?? null;
  const heRecordUpdated = heData?.recordLastUpdated ?? null;

  if (!pdPresent && !avmPresent && !hePresent) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No raw ATTOM payload available for this run. All three endpoints returned no data.
      </div>
    );
  }

  const noData = <span className="text-muted-foreground/50 italic text-xs">not returned by ATTOM</span>;
  const subGated = <span className="text-muted-foreground/50 italic text-xs">not returned — subscription-gated</span>;
  const endpointAbsent = <span className="text-muted-foreground/50 italic text-xs">endpoint returned no payload</span>;

  function val(v: string | number | null | undefined, fmt?: (x: number) => string): React.ReactNode | null {
    if (v == null) return null;
    if (typeof v === "number" && fmt) return fmt(v);
    return String(v);
  }

  return (
    <div className="space-y-3">

      {/* ── A. Property identity ─────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          A — Property identity
          {!pdPresent && <span className="ml-1.5 font-normal normal-case text-muted-foreground/50 italic">(detailmortgageowner returned no payload)</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Field label="ATTOM property ID" value={attomId != null ? String(attomId) : null} />
          <Field label="Match code" value={val(matchCode)} absent="not returned by ATTOM" />
          <Field label="Matched address" value={matchedAddress} wide absent="not returned by ATTOM" />
        </div>
      </div>

      {/* ── B. Property type ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          B — Property type
          {!pdPresent && <span className="ml-1.5 font-normal normal-case text-muted-foreground/50 italic">(detailmortgageowner returned no payload)</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Field label="Property type" value={val(proptype)} />
          <Field label="Property class" value={val(propclass)} />
          <Field label="Land use" value={val(propLandUse)} />
          <Field label="Year built" value={val(yearbuilt)} />
        </div>
      </div>

      {/* ── C. AVM data ──────────────────────────────────────────────────── */}
      <SectionBox
        title="C — AVM data"
        subtitle={avmPresent ? "(attomavm/detail)" : undefined}
        absent={!avmPresent ? "attomavm/detail returned no payload" : undefined}
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Field
            label="Point estimate"
            value={avmValue != null ? fmtCurrency(avmValue) : null}
          />
          <Field
            label="Range (low – high)"
            value={
              avmLow != null && avmHigh != null
                ? `${fmtCurrency(avmLow)} – ${fmtCurrency(avmHigh)}`
                : null
            }
          />
          <Field
            label="ATTOM scr confidence"
            value={avmScr != null ? String(avmScr) : null}
            absent="not returned by ATTOM"
          />
          <Field
            label="Derived confidence (spread)"
            value={confidence != null ? `${confidence} (${
              avmLow != null && avmHigh != null && avmValue != null
                ? `${(((avmHigh - avmLow) / avmValue) * 100).toFixed(1)}% spread`
                : "—"
            })` : null}
            absent="not derivable — AVM absent"
          />
          <Field
            label="Prop indicator"
            value={val(propIndicator)}
            absent="not returned by ATTOM"
          />
          <Field
            label="AVM run date (eventDate)"
            value={val(avmEventDate)}
            absent="not returned by ATTOM"
          />
        </div>
        <p className="text-xs text-muted-foreground/60 italic pt-0.5">
          scr is returned inside avm.amount in the API response (not avm.condition).
        </p>
      </SectionBox>

      {/* ── D. attomavm equity signals (subscription-gated legacy) ─────────── */}
      <SectionBox
        title="D — AVM equity signals"
        subtitle="(attomavm/detail homeEquity — subscription-gated)"
      >
        {!avmPresent ? (
          <p className="text-xs text-muted-foreground/50 italic">endpoint returned no payload</p>
        ) : !homeEquityPresent ? (
          <div className="space-y-1">
            <p className="text-xs text-orange-700 font-medium">
              attomavm homeEquity block absent — confirmed subscription-gated at current tier
            </p>
            <p className="text-xs text-muted-foreground/60 italic">
              estEquity, estEstimatedValue, estEquityPct are not returned in /attomavm/detail
              at this subscription level. See section E (/valuation/homeequity) for current
              debt-support signals.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <Field label="Est. market value" value={estEstimatedValue != null ? fmtCurrency(estEstimatedValue) : null} absent="subscription-gated" />
            <Field label="Est. equity" value={estEquity != null ? fmtCurrency(estEquity) : null} absent="subscription-gated" />
            <Field label="Equity %" value={estEquityPct != null ? fmtPct(estEquityPct) : null} absent="subscription-gated" />
            <Field label="Implied lien (AVM − equity)" value={impliedLien != null ? fmtCurrency(impliedLien) : null} absent="not derivable — equity absent" />
          </div>
        )}
        {homeEquityPresent && (
          <p className="text-xs text-muted-foreground/60 italic pt-0.5">
            Implied lien = AVM value − est. equity (ATTOM secondary signal, not a title search).
          </p>
        )}
      </SectionBox>

      {/* ── E. Home equity / debt support (/valuation/homeequity) ─────────── */}
      <SectionBox
        title="E — Home equity / debt support"
        subtitle="(/valuation/homeequity — primary current-debt source)"
      >
        {!hePresent ? (
          <div className="space-y-2">
            {/* ── Pre-audit run (no _endpoints tracking) ─────────────── */}
            {isPreAuditRun && (
              <p className="text-xs text-orange-700 font-medium">
                Stale run — created before per-endpoint tracking was added.
                Re-run ATTOM screening to populate this section.
              </p>
            )}

            {/* ── Post-audit: endpoint was rejected (HTTP error or network) ─ */}
            {!isPreAuditRun && heEpRejected && (
              <div className="space-y-1">
                <p className="text-xs text-red-700 font-semibold">
                  /valuation/homeequity call failed (HTTP error or network error)
                </p>
                {heEpError && (
                  <p className="text-xs font-mono bg-red-50 border border-red-200 rounded px-2 py-1 text-red-800 break-all">
                    {heEpError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground/60 italic">
                  detailmortgageowner and attomavm/detail succeeded. This failure is
                  specific to /valuation/homeequity. Check the ATTOM_API_KEY permissions
                  and whether this property type is covered by the /valuation/homeequity endpoint.
                </p>
              </div>
            )}

            {/* ── Post-audit: endpoint fulfilled but property[0] was null ─── */}
            {!isPreAuditRun && heEpFulfilled && (
              <div className="space-y-1.5">
                <p className="text-xs text-orange-700 font-semibold">
                  /valuation/homeequity returned HTTP 200 but property[0] is null
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <span className="text-muted-foreground">property[] array present in response</span>
                  <span className={heEpHasPropertyArray ? "text-emerald-700 font-medium" : "text-orange-700 font-medium"}>
                    {heEpHasPropertyArray ? `yes (len=${heEpPropertyArrayLen ?? "?"})`  : "no — response has no property[] key"}
                  </span>
                  <span className="text-muted-foreground">top-level response keys</span>
                  <span className="text-slate-700 font-mono">
                    {heEpTopLevelKeys.length > 0 ? `[${heEpTopLevelKeys.join(", ")}]` : "(empty)"}
                  </span>
                  {heEpHasPropertyArray && heEpPropertyArrayLen === 0 && (
                    <>
                      <span className="text-muted-foreground col-span-2 italic pt-1">
                        property[] array exists but is empty — ATTOM did not match this address.
                        Verify address1/address2 params in server logs.
                      </span>
                    </>
                  )}
                  {!heEpHasPropertyArray && heEpTopLevelKeys.length > 0 && (
                    <>
                      <span className="text-muted-foreground col-span-2 italic pt-1">
                        Response has no property[] wrapper — may use a different top-level key.
                        Check keys above against ATTOM API docs for /valuation/homeequity.
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground/60 italic">
                  Re-run screening to capture the latest server logs which show the raw
                  response shape at extraction time.
                </p>
              </div>
            )}

            {/* ── No _endpoints and no heRec: generic fallback ─────────────── */}
            {isPreAuditRun && (
              <p className="text-xs text-muted-foreground/60 italic">
                Re-run ATTOM screening to populate per-endpoint diagnostic data and this section.
              </p>
            )}
          </div>
        ) : !heDataPresent ? (
          <div className="space-y-1">
            <p className="text-xs text-orange-700 font-medium">
              homeEquity block absent in /valuation/homeequity response
            </p>
            {heEpTopLevelKeys.length > 0 && (
              <p className="text-xs text-muted-foreground/60">
                Endpoint fulfilled. property[0] extracted
                {heEpExtractedRecord != null
                  ? `, top-level record keys: [${Object.keys(heEpExtractedRecord as object).join(", ")}]`
                  : " but record was null"
                }.
              </p>
            )}
            <p className="text-xs text-muted-foreground/60 italic">
              The endpoint returned a property record but the homeEquity sub-object was not
              present. This may indicate this property is not covered at the current tier,
              or the homeEquity key has a different name in the response.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <Field
                label="Total estimated loan balance"
                value={heTotalBalance != null ? fmtCurrency(heTotalBalance) : null}
                absent="not returned by ATTOM"
              />
              <Field
                label="ATTOM LTV"
                value={heLtv != null ? `${heLtv}%` : null}
                absent="not returned by ATTOM"
              />
              <Field
                label="Est. available equity"
                value={heEstAvailEquity != null ? fmtCurrency(heEstAvailEquity) : null}
                absent="not returned by ATTOM"
              />
              <Field
                label="Est. lendable equity"
                value={heEstLendableEquity != null ? fmtCurrency(heEstLendableEquity) : null}
                absent="not returned by ATTOM"
              />
              <Field
                label="1st lien amortized balance"
                value={heFirstLoan != null ? fmtCurrency(heFirstLoan) : null}
                absent="not returned by ATTOM"
              />
              <Field
                label="2nd lien amortized balance"
                value={heSecondLoan != null ? fmtCurrency(heSecondLoan) : null}
                absent="not returned by ATTOM"
              />
              <Field
                label="3rd lien amortized balance"
                value={heThirdLoan != null ? fmtCurrency(heThirdLoan) : null}
                absent="not returned by ATTOM"
              />
              <Field
                label="Record last updated"
                value={val(heRecordUpdated)}
                absent="not returned by ATTOM"
              />
            </div>
            <p className="text-xs text-muted-foreground/60 italic pt-0.5">
              totalEstimatedLoanBalance is ATTOM&apos;s amortized estimate of current outstanding
              liens (preferred over origination amount). estimatedLendableEquity is the
              FractPath-relevant deal cash support signal.
            </p>
          </>
        )}
      </SectionBox>

      {/* ── F. Mortgage record ───────────────────────────────────────────────── */}
      <SectionBox
        title="F — Mortgage record"
        subtitle="(detailmortgageowner — origination context, NOT current balance)"
      >
        {!pdPresent ? (
          <p className="text-xs text-muted-foreground/50 italic">endpoint returned no payload</p>
        ) : !mortgagePresent ? (
          <div className="space-y-1">
            <p className="text-xs text-orange-700 font-medium">
              Mortgage block absent — not returned by ATTOM
            </p>
            <p className="text-xs text-muted-foreground/60 italic">
              Property may have no recorded lien, or mortgage data requires a higher subscription tier.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <Field label="Orig. loan amount" value={mortgageAmount != null ? fmtCurrency(mortgageAmount) : null} absent="not returned by ATTOM" />
              <Field label="Loan date" value={val(mortgageDate)} absent="not returned by ATTOM" />
              <Field label="Interest rate" value={mortgageRate != null ? `${mortgageRate}%` : null} absent="not returned — subscription-gated" />
              <Field label="Loan type" value={val(mortgageLoanType)} absent="not returned — subscription-gated" />
              <Field label="Deed type" value={val(mortgageDeedType)} absent="not returned by ATTOM" />
              <Field label="Term (months)" value={mortgageTerm != null ? String(mortgageTerm) : null} absent="not returned — subscription-gated" />
              <Field label="Due date" value={val(mortgageDueDate)} absent="not returned by ATTOM" />
              <Field label="Lender" value={val(mortgageLender)} absent="not returned by ATTOM" />
              <Field label="Equity flag" value={val(mortgageEquityFlag)} absent="not returned — subscription-gated" />
              <Field label="Refi flag" value={val(mortgageRefiFlag)} absent="not returned — subscription-gated" />
            </div>
            <p className="text-xs text-muted-foreground/60 italic pt-0.5">
              Origination amount ≠ current outstanding balance.
              Rate, term, equity/refi flags are subscription-gated and may be absent even when the mortgage block is present.
            </p>
          </>
        )}
      </SectionBox>

      {/* ── G. Owner record ──────────────────────────────────────────────── */}
      <SectionBox
        title="G — Owner record"
        subtitle="(detailmortgageowner)"
      >
        {!pdPresent ? (
          <p className="text-xs text-muted-foreground/50 italic">endpoint returned no payload</p>
        ) : !ownerPresent ? (
          <p className="text-xs text-orange-700 font-medium">
            Owner block absent — not returned by ATTOM
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <Field label="Owner 1" value={val(owner1Name)} absent="not returned by ATTOM" />
            <Field label="Owner 2" value={val(owner2Name) || null} absent="not returned by ATTOM" />
            <Field
              label="Corporate indicator"
              value={corpIndicator != null ? String(corpIndicator) : null}
              absent="not returned by ATTOM"
            />
            <Field
              label="Absentee status"
              value={val(absenteeStatus)}
              absent="not returned by ATTOM"
            />
          </div>
        )}
        {ownerPresent && (
          <p className="text-xs text-muted-foreground/60 italic pt-0.5">
            ATTOM field names are lowercase (lastname, firstnameandmi, corporateindicator) — read defensively.
          </p>
        )}
      </SectionBox>

      {/* ── Diagnostic footer ─────────────────────────────────────────────── */}
      <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 px-3 py-2 space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Diagnostic — ATTOM endpoint coverage
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs">
          <DiagRow
            label="/property/detailmortgageowner"
            ok={pdPresent}
            okLabel="✓ payload received"
            failLabel="✗ no payload"
          />
          <DiagRow
            label="/attomavm/detail"
            ok={avmPresent}
            okLabel="✓ payload received"
            failLabel="✗ no payload"
          />
          <DiagRow
            label="/valuation/homeequity"
            ok={hePresent}
            okLabel={heDataPresent ? "✓ payload received — homeEquity block present" : "✓ endpoint returned payload — homeEquity block absent"}
            failLabel="✗ no payload — re-run screening to populate"
          />
          <DiagRow
            label="Mortgage block"
            ok={mortgagePresent}
            okLabel={
              Array.isArray(mortgageRaw)
                ? `✓ ${mortgageRaw.length} record(s) (array)`
                : "✓ present (object — ATTOM returned single record)"
            }
            failLabel="✗ absent — no lien on record or subscription-gated"
          />
          <DiagRow
            label="Owner 1 name"
            ok={owner1Name != null}
            okLabel={`✓ ${owner1Name ?? ""}`}
            failLabel="✗ absent in payload"
          />
          <DiagRow
            label="Owner 2 name"
            ok={owner2Name != null && owner2Name.trim() !== ""}
            okLabel={`✓ ${owner2Name ?? ""}`}
            failLabel="✗ absent (owner2 block empty)"
          />
          <DiagRow
            label="AVM scr confidence"
            ok={avmScr != null}
            okLabel={`✓ scr=${avmScr} (field: avm.amount.scr)`}
            failLabel="✗ not returned"
          />
          <DiagRow
            label="attomavm homeEquity signals"
            ok={homeEquityPresent}
            okLabel="✓ estEquity / estEstimatedValue present (attomavm)"
            failLabel="✗ not returned — subscription-gated in attomavm/detail"
          />
          <DiagRow
            label="homeEquity.totalEstimatedLoanBalance"
            ok={heTotalBalance != null}
            okLabel={`✓ $${heTotalBalance != null ? Math.round(heTotalBalance).toLocaleString() : ""} (from /valuation/homeequity)`}
            failLabel={hePresent ? "✗ homeEquity block absent in /valuation/homeequity response" : "✗ /valuation/homeequity returned no payload"}
          />
          <DiagRow
            label="homeEquity.estimatedLendableEquity"
            ok={heEstLendableEquity != null}
            okLabel={`✓ $${heEstLendableEquity != null ? Math.round(heEstLendableEquity).toLocaleString() : ""} (from /valuation/homeequity)`}
            failLabel={hePresent ? "✗ homeEquity block absent in /valuation/homeequity response" : "✗ /valuation/homeequity returned no payload"}
          />
          <DiagRow
            label="AVM event date"
            ok={avmEventDate != null}
            okLabel={`✓ ${avmEventDate ?? ""} (field: avm.eventDate)`}
            failLabel="✗ not returned"
          />
        </div>
        <p className="text-xs text-muted-foreground/50 italic">
          Fetched: {fmtDate(raw.fetchedAt)} · Raw payload stored verbatim in property_review_runs.raw_payload
        </p>
      </div>
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

      {/* Controlling / interpretation explanation */}
      {payload.reviewNotes && (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2.5 space-y-1">
          <div className="text-xs font-semibold text-violet-900">
            Why ATTOM {payload.becameControlling ? "became" : "did not become"} the controlling FMV
          </div>
          <p className="text-xs text-violet-800 leading-relaxed">
            {payload.reviewNotes}
          </p>
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
            Fetches live data from three ATTOM endpoints in parallel:
            /property/detailmortgageowner (owner + mortgage origination),
            /attomavm/detail (AVM + confidence), and
            /valuation/homeequity (current loan balance + lendable equity).
            On a clean outcome the controlling FMV, verification state, and eligible cash cap
            are updated immediately. Runs are logged to the screening run history.
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
