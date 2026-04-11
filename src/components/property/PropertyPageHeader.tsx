import type { ReactNode } from "react";

// ── Inline badge helper with accessible tooltip ────────────────────────────────

function Badge({
  cls,
  tooltip,
  children,
}: {
  cls: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <span className="relative group inline-flex">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border cursor-default select-none ${cls}`}
        tabIndex={tooltip ? 0 : undefined}
        title={tooltip}
      >
        {children}
      </span>

      {tooltip && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 whitespace-normal leading-snug"
        >
          {tooltip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}

// ── Check SVG ─────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3 h-3 shrink-0"
    >
      <path
        fillRule="evenodd"
        d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.844 4.574a.75.75 0 0 1 .082 1.058l-3.5 4a.75.75 0 0 1-1.09.058L5.086 8.44a.75.75 0 0 1 1.08-1.043l1.696 1.753 2.96-3.385a.75.75 0 0 1 1.022-.19Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── Appraisal SVG ─────────────────────────────────────────────────────────────

function AppraisalIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3 h-3 shrink-0"
    >
      <path d="M6.5 9a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0Z" />
      <path
        fillRule="evenodd"
        d="M1.5 1A1.5 1.5 0 0 0 0 2.5v11A1.5 1.5 0 0 0 1.5 15h13a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 14.5 1h-13Zm1 3a.5.5 0 0 1 .5-.5H5a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5Zm.5 2.5a.5.5 0 0 0 0 1h1a.5.5 0 0 0 0-1H3Zm5.5 4.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── Status badge map ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  string,
  { label: string; hint: string; className: string }
> = {
  verified: {
    label: "Verified",
    hint: "Property ownership and core records have been verified.",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  unverified: {
    label: "Unverified",
    hint: "Property has not yet been verified.",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  under_review: {
    label: "Under review",
    hint: "Property is currently being reviewed by our team.",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  pending_verification: {
    label: "Pending verification",
    hint: "Verification is in progress.",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  ineligible: {
    label: "Ineligible",
    hint: "Property does not currently meet participation requirements.",
    className: "bg-red-100 text-red-800 border-red-200",
  },
};

// ── Helper for appraisal badge date formatting ────────────────────────────────

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

// ── Props ─────────────────────────────────────────────────────────────────────

export type PropertyPageHeaderProps = {
  address: string;
  propertyStatus: string | null;
  showOwnerVerified?: boolean;
  showAppraisalBadge?: boolean;
  appraisalUnderReview?: boolean;
  appraisalExpired?: boolean;
  appraisalBadgeLabel?: string;
  expiresAt?: string | null;
  ownershipStatus?: string | null;
  isParticipationApproved?: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PropertyPageHeader({
  address,
  propertyStatus,
  showOwnerVerified = false,
  showAppraisalBadge = false,
  appraisalUnderReview = false,
  appraisalExpired = false,
  appraisalBadgeLabel,
  expiresAt,
  ownershipStatus,
  isParticipationApproved = false,
}: PropertyPageHeaderProps) {
  const badge =
    STATUS_BADGE[propertyStatus ?? "unverified"] ?? STATUS_BADGE.unverified;

  const expiresLabel = expiresAt ? fmtDateShort(expiresAt) : null;

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold leading-snug tracking-tight">
        {address}
      </h1>

      <div className="flex flex-wrap items-center gap-2">
        {/* Status badge */}
        <Badge cls={badge.className} tooltip={badge.hint}>
          {badge.label}
        </Badge>

        {/* Approved for participation */}
        {isParticipationApproved && (
          <Badge
            cls="bg-emerald-100 text-emerald-800 border-emerald-200"
            tooltip="This property currently meets participation requirements."
          >
            <CheckIcon />
            Approved for participation
          </Badge>
        )}

        {/* Owner Verified */}
        {showOwnerVerified && (
          <Badge
            cls="bg-emerald-100 text-emerald-800 border-emerald-200"
            tooltip="Homeowner identity has been confirmed."
          >
            <CheckIcon />
            Owner Verified
          </Badge>
        )}

        {/* Reviewed valuation basis / appraisal */}
        {showAppraisalBadge && !appraisalExpired && (
          <Badge
            cls={
              appraisalUnderReview
                ? "bg-blue-50 text-blue-800 border-blue-200"
                : "bg-violet-100 text-violet-800 border-violet-200"
            }
            tooltip="A reviewed value is currently active for this property."
          >
            <AppraisalIcon />
            {appraisalBadgeLabel ?? "Reviewed valuation basis"}
          </Badge>
        )}

        {appraisalExpired && (
          <Badge
            cls="bg-orange-100 text-orange-800 border-orange-200"
            tooltip="The reviewed valuation basis has expired and requires renewal."
          >
            Appraisal expired
          </Badge>
        )}

        {/* Valid-until hint */}
        {showAppraisalBadge && !appraisalUnderReview && !appraisalExpired && expiresLabel && (
          <span className="text-xs text-muted-foreground">
            Valid until {expiresLabel}
          </span>
        )}

        {ownershipStatus && (
          <span className="text-xs text-muted-foreground">
            Ownership status: {ownershipStatus}
          </span>
        )}
      </div>
    </div>
  );
}
