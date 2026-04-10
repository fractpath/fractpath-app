"use client";

import { useState } from "react";
import {
  PropertyValuationSections,
  type ValuationSectionsProps,
} from "@/components/properties/PropertyValuationSections";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PropertyAvm = {
  estimate: number | null;
  low: number | null;
  high: number | null;
  confidence: string | null;
  fetchedAt?: string | null;
};

export type ValuationCashSectionProps = ValuationSectionsProps & {
  audience: "owner" | "buyer" | "admin";
  avm: PropertyAvm | null;
  securedDebt?: number | null;
  propertyReviewExpiresAt?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDateShort(val: string | null | undefined): string | null {
  if (!val) return null;
  try {
    return new Date(val).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

type TabKey = "rentcast" | "attom" | "manual";

// ── Summary row ───────────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground leading-snug truncate">
        {value}
      </span>
      {sub && (
        <span className="text-[11px] text-muted-foreground truncate">{sub}</span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ValuationCashSection({
  audience,
  avm,
  securedDebt,
  propertyReviewExpiresAt,
  ...valuationProps
}: ValuationCashSectionProps) {
  const {
    rentcastFmv,
    escalationDepositStatus,
    escalationAvmStatus,
    ownerAttemptedAttom,
    manualAppraisalStatus,
    latestVerifiedFmv,
    fmvVerificationSource,
    liveIneligiblePhase,
  } = valuationProps;

  // Determine which tabs are relevant
  const attomStarted = !!(
    escalationDepositStatus ||
    escalationAvmStatus ||
    ownerAttemptedAttom
  );
  const attomIsControlling =
    fmvVerificationSource === "escalation_avm_sim" ||
    fmvVerificationSource === "attom_sim" ||
    fmvVerificationSource === "attom";
  const isRealAttomComplete = fmvVerificationSource === "attom";
  const attomComplete = escalationAvmStatus === "completed";
  const manualStarted = !!manualAppraisalStatus;

  const showRentcast = rentcastFmv != null;
  const showAttom =
    attomStarted ||
    attomIsControlling ||
    isRealAttomComplete ||
    rentcastFmv != null ||
    liveIneligiblePhase !== null;
  const showManual =
    liveIneligiblePhase !== null ||
    attomComplete ||
    isRealAttomComplete ||
    manualStarted;

  const availableTabs: TabKey[] = [];
  if (showRentcast) availableTabs.push("rentcast");
  if (showAttom) availableTabs.push("attom");
  if (showManual) availableTabs.push("manual");

  const TAB_LABELS: Record<TabKey, string> = {
    rentcast: "RentCast",
    attom: "ATTOM review",
    manual: "Manual appraisal",
  };

  const [activeTab, setActiveTab] = useState<TabKey | null>(
    availableTabs.length > 0 ? availableTabs[0] : null,
  );

  const isOwnerOrAdmin = audience === "owner" || audience === "admin";

  // Controlling FMV for summary
  const controllingFmv =
    latestVerifiedFmv != null ? latestVerifiedFmv : avm?.estimate ?? null;

  // Eligible cash — controlling value minus declared secured debt
  const eligibleCash =
    controllingFmv != null && securedDebt != null
      ? Math.max(0, controllingFmv - securedDebt)
      : controllingFmv != null && securedDebt == null
        ? null
        : null;

  // Range string
  const rangeStr =
    avm?.low != null && avm.high != null
      ? `${fmtUsd(avm.low)} – ${fmtUsd(avm.high)}`
      : null;

  // Reviewed basis label
  const reviewedLabel =
    latestVerifiedFmv != null
      ? audience === "buyer"
        ? "Reviewed estimate"
        : fmvVerificationSource === "manual_appraisal_sim" ||
            fmvVerificationSource === "escalated_sim"
          ? "Appraised"
          : "Reviewed basis"
      : null;

  const expiresLabel = propertyReviewExpiresAt
    ? fmtDateShort(propertyReviewExpiresAt)
    : null;

  const hasAnyValuation =
    avm?.estimate != null || latestVerifiedFmv != null;

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Section header */}
      <div className="bg-muted/40 border-b px-5 py-3">
        <p className="text-sm font-semibold text-foreground">
          Valuation &amp; cash position
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Latest estimate, reviewed basis, and debt support for this property.
        </p>
      </div>

      {/* Summary row */}
      {hasAnyValuation ? (
        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 border-b">
          {avm?.estimate != null && (
            <SummaryTile
              label="Estimated value"
              value={fmtUsd(avm.estimate)}
              sub={
                avm.confidence
                  ? `${avm.confidence.charAt(0).toUpperCase()}${avm.confidence.slice(1)} confidence`
                  : null
              }
            />
          )}

          {rangeStr && (
            <SummaryTile label="Estimated range" value={rangeStr} />
          )}

          {latestVerifiedFmv != null && reviewedLabel && (
            <SummaryTile
              label={reviewedLabel}
              value={fmtUsd(latestVerifiedFmv)}
              sub={expiresLabel ? `Active through ${expiresLabel}` : null}
            />
          )}

          {isOwnerOrAdmin && securedDebt != null && (
            <SummaryTile
              label="Secured debt"
              value={fmtUsd(securedDebt)}
              sub="Owner declared"
            />
          )}

          {isOwnerOrAdmin && eligibleCash != null && securedDebt != null && (
            <SummaryTile
              label="Eligible cash"
              value={fmtUsd(eligibleCash)}
              sub={`${fmtUsd(controllingFmv)} − ${fmtUsd(securedDebt)}`}
            />
          )}
        </div>
      ) : (
        <div className="px-5 py-4 border-b">
          <p className="text-sm text-muted-foreground italic">
            No valuation data available yet.
          </p>
        </div>
      )}

      {/* Tab bar + detail panels */}
      {availableTabs.length > 0 && (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-0 border-b overflow-x-auto">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-xs font-medium shrink-0 border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Detail panel */}
          {activeTab && (
            <div className="px-4 py-4">
              <PropertyValuationSections
                {...valuationProps}
                visibleSection={activeTab}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
