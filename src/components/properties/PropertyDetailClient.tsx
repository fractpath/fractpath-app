"use client";

import { useState } from "react";
import Link from "next/link";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { PropertyDocumentsPanel } from "@/components/properties/PropertyDocumentsPanel";
import type { HomeownerPropertyShape } from "@/lib/property/projections";

type LinkedDeal = {
  thread_id: string;
  thread_status: string;
  deal_id: string | null;
  deal_status: string | null;
  deal_title: string | null;
} | null;

type Props = {
  property: HomeownerPropertyShape;
  linkedDeal: LinkedDeal;
};

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string; hint: string }> = {
  unverified: {
    label: "Unverified",
    className: "bg-yellow-100 text-yellow-800",
    hint: "Not yet reviewed by FractPath",
  },
  under_review: {
    label: "Under review",
    className: "bg-blue-100 text-blue-800",
    hint: "Being reviewed by FractPath",
  },
  verified: {
    label: "Verified ✓",
    className: "bg-green-100 text-green-800",
    hint: "Approved for participation",
  },
  archived: {
    label: "Archived",
    className: "bg-gray-100 text-gray-600",
    hint: "No longer active",
  },
};

// ── Label maps ────────────────────────────────────────────────────────────────

const OWNERSHIP_TYPE_LABELS: Record<string, string> = {
  sole: "Sole ownership",
  joint_married: "Joint (married)",
  joint_unmarried: "Joint (unmarried)",
  trust_estate: "Trust or estate",
  other: "Other",
};

const OCCUPANCY_USE_LABELS: Record<string, string> = {
  primary: "Primary residence",
  secondary: "Secondary / vacation home",
  rental: "Rental property",
  vacant: "Vacant",
  other: "Other",
};

const DEBT_CONFIDENCE_LABELS: Record<string, string> = {
  exact: "Exact",
  estimated: "Estimated",
  unknown: "Unknown",
};

const DEBT_AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available",
  can_obtain: "Can obtain",
  unavailable: "Unavailable",
};

const FMV_CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const FMV_SOURCE_LABELS: Record<string, string> = {
  appraisal: "Professional appraisal",
  zillow: "Online estimate (Zillow / similar)",
  agent: "Real estate agent opinion",
  personal: "Personal assessment",
  other: "Other",
};

const PROCEED_LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  not_sure: "Not sure",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function label(map: Record<string, string>, val: string | null | undefined): string | null {
  if (!val) return null;
  return map[val] ?? val;
}

function fmtMoney(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function canEdit(status: string): boolean {
  return status === "unverified";
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({ fieldLabel, value }: { fieldLabel: string; value: string | null | undefined }) {
  if (!value && value !== "0") return null;
  return (
    <div className="flex gap-3 py-2 border-b last:border-0">
      <span className="w-48 shrink-0 text-xs text-muted-foreground leading-5">{fieldLabel}</span>
      <span className="text-sm text-foreground leading-5">{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PropertyDetailClient({ property, linkedDeal }: Props) {
  const [editOpen, setEditOpen] = useState(false);

  const badge = STATUS_BADGE[property.status] ?? STATUS_BADGE.unverified;

  const isActiveReview =
    linkedDeal?.thread_status === "accepted" ||
    linkedDeal?.deal_status === "ACCEPTED";

  const hasAnyIntake =
    property.ownership_type ||
    property.occupancy_use ||
    property.major_condition_issue ||
    (property.known_liens_and_claims && property.known_liens_and_claims.length > 0) ||
    property.total_known_debt_amount != null ||
    property.debt_statement_availability ||
    property.title_claims_known ||
    property.owner_stated_fmv != null ||
    property.willing_to_proceed_formal_review;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          ← Back to dashboard
        </Link>
      </div>

      {/* Active review banner */}
      {isActiveReview && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200">
          This property is currently part of an active review workflow. We may
          contact you if more information is needed.
        </div>
      )}

      {/* Property summary */}
      <div className="rounded-lg border p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold leading-tight">
            {property.address_display || property.address_line1}
          </h1>
          {canEdit(property.status) && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="shrink-0 text-sm underline text-muted-foreground hover:text-foreground"
            >
              Edit
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <span className="text-xs text-muted-foreground">{badge.hint}</span>
        </div>

        {property.ownership_status && (
          <div className="text-xs text-muted-foreground">
            Ownership status: {property.ownership_status}
          </div>
        )}
      </div>

      {/* Submitted property details */}
      {hasAnyIntake ? (
        <div className="rounded-lg border p-5 space-y-1">
          <h2 className="text-sm font-semibold mb-3">Submitted property details</h2>

          <Row
            fieldLabel="Ownership type"
            value={label(OWNERSHIP_TYPE_LABELS, property.ownership_type)}
          />
          <Row
            fieldLabel="How you use this property"
            value={
              property.occupancy_use === "other" && property.occupancy_use_other
                ? `Other — ${property.occupancy_use_other}`
                : label(OCCUPANCY_USE_LABELS, property.occupancy_use)
            }
          />
          <Row
            fieldLabel="Known major condition issues"
            value={
              property.major_condition_issue === "yes"
                ? `Yes${property.major_condition_issue_details ? ` — ${property.major_condition_issue_details}` : ""}`
                : property.major_condition_issue === "no"
                  ? "No"
                  : null
            }
          />
          <Row
            fieldLabel="Known liens and claims"
            value={
              property.known_liens_and_claims &&
              property.known_liens_and_claims.length > 0
                ? property.known_liens_and_claims.join(", ")
                : null
            }
          />
          <Row
            fieldLabel="Total known debt"
            value={fmtMoney(property.total_known_debt_amount)}
          />
          {property.total_known_debt_confidence && (
            <Row
              fieldLabel="Debt estimate confidence"
              value={label(DEBT_CONFIDENCE_LABELS, property.total_known_debt_confidence)}
            />
          )}
          <Row
            fieldLabel="Debt statement availability"
            value={label(DEBT_AVAILABILITY_LABELS, property.debt_statement_availability)}
          />
          <Row
            fieldLabel="Title claims"
            value={
              property.title_claims_known === "yes"
                ? `Yes${property.title_claims_details ? ` — ${property.title_claims_details}` : ""}`
                : property.title_claims_known === "no"
                  ? "No"
                  : null
            }
          />
          <Row
            fieldLabel="Estimated market value"
            value={fmtMoney(property.owner_stated_fmv)}
          />
          {property.owner_stated_fmv != null && (
            <>
              <Row
                fieldLabel="Estimate confidence"
                value={label(FMV_CONFIDENCE_LABELS, property.owner_stated_fmv_confidence)}
              />
              <Row
                fieldLabel="How you estimated value"
                value={
                  property.owner_stated_fmv_source === "other" &&
                  property.owner_stated_fmv_source_other
                    ? `Other — ${property.owner_stated_fmv_source_other}`
                    : label(FMV_SOURCE_LABELS, property.owner_stated_fmv_source)
                }
              />
            </>
          )}
          <Row
            fieldLabel="Willing to proceed with formal review"
            value={label(PROCEED_LABELS, property.willing_to_proceed_formal_review)}
          />
        </div>
      ) : (
        <div className="rounded-lg border p-5">
          <h2 className="text-sm font-semibold mb-2">Submitted property details</h2>
          <p className="text-sm text-muted-foreground">
            No intake details have been submitted yet.{" "}
            {canEdit(property.status) && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="underline hover:text-foreground"
              >
                Edit property
              </button>
            )}
          </p>
        </div>
      )}

      {/* Documents */}
      <PropertyDocumentsPanel
        propertyId={property.id}
        onOpenEdit={() => setEditOpen(true)}
        editAllowed={canEdit(property.status)}
      />

      {/* Linked deal */}
      {linkedDeal?.deal_id && (
        <div className="rounded-lg border p-5 space-y-2">
          <h2 className="text-sm font-semibold">Linked deal</h2>
          {linkedDeal.deal_title && (
            <p className="text-sm text-foreground">{linkedDeal.deal_title}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Thread status:{" "}
            <span className="font-medium capitalize">
              {linkedDeal.thread_status.replace(/_/g, " ")}
            </span>
          </p>
          <Link
            href={`/deal/${linkedDeal.deal_id}`}
            className="inline-block text-sm underline hover:text-foreground"
          >
            View deal →
          </Link>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        {canEdit(property.status) && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Edit property details
          </button>
        )}
        <Link
          href="/dashboard"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/40"
        >
          Back to dashboard
        </Link>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <PropertyForm
          open={true}
          onClose={() => setEditOpen(false)}
          onSuccess={() => {
            setEditOpen(false);
            window.location.reload();
          }}
          context="profile"
          editPrefill={{
            propertyId: property.id,
            address_line1: property.address_line1,
            address_line2: property.address_line2 ?? "",
            city: property.city ?? "",
            state: property.state,
            postal_code: property.postal_code,
            ownership_type: property.ownership_type,
            occupancy_use: property.occupancy_use,
            occupancy_use_other: property.occupancy_use_other,
            major_condition_issue: property.major_condition_issue,
            major_condition_issue_details: property.major_condition_issue_details,
            known_liens_and_claims: property.known_liens_and_claims,
            total_known_debt_amount: property.total_known_debt_amount,
            total_known_debt_confidence: property.total_known_debt_confidence,
            debt_statement_availability: property.debt_statement_availability,
            title_claims_known: property.title_claims_known,
            title_claims_details: property.title_claims_details,
            owner_stated_fmv: property.owner_stated_fmv,
            owner_stated_fmv_confidence: property.owner_stated_fmv_confidence,
            owner_stated_fmv_source: property.owner_stated_fmv_source,
            owner_stated_fmv_source_other: property.owner_stated_fmv_source_other,
            willing_to_proceed_formal_review: property.willing_to_proceed_formal_review,
          }}
        />
      )}
    </div>
  );
}
