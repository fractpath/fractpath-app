import type { StatusLane, LaneVariant } from "@/lib/property/statusLanes";

type Props = {
  participation: StatusLane;
  valuation: StatusLane;
  closingReadiness: StatusLane;
  /** Show closing readiness row. Default true. Pass false on public surface. */
  showClosingReadiness?: boolean;
};

// ─── Variant → Tailwind classes ───────────────────────────────────────────────

const BADGE_CLS: Record<LaneVariant, string> = {
  emerald: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  blue: "bg-blue-100 text-blue-800 border border-blue-200",
  amber: "bg-amber-100 text-amber-800 border border-amber-200",
  violet: "bg-violet-100 text-violet-800 border border-violet-200",
  gray: "bg-gray-100 text-gray-600 border border-gray-200",
  red: "bg-red-100 text-red-800 border border-red-200",
};

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className="inline w-3 h-3 ml-0.5 text-muted-foreground/60 flex-shrink-0"
      aria-hidden="true"
    >
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 3a.75.75 0 1 1 0 1.5A.75.75 0 0 1 8 4Zm-.25 2.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5Z" />
    </svg>
  );
}

function Lane({
  laneLabel,
  lane,
}: {
  laneLabel: string;
  lane: StatusLane;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground min-w-[120px]">
        {laneLabel}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_CLS[lane.variant]}`}
        title={lane.tooltip}
      >
        {lane.label}
        <InfoIcon />
      </span>
    </div>
  );
}

/**
 * Three-lane property status block.
 * Renders Participation, Valuation, and (optionally) Closing Readiness lanes
 * with consistent labels and tooltips across admin, owner, and public surfaces.
 */
export function PropertyStatusLanes({
  participation,
  valuation,
  closingReadiness,
  showClosingReadiness = true,
}: Props) {
  return (
    <div className="rounded-lg border bg-muted/10 px-4 divide-y divide-border/60">
      <Lane laneLabel="Participation" lane={participation} />
      <Lane laneLabel="Valuation" lane={valuation} />
      {showClosingReadiness && (
        <Lane laneLabel="Closing readiness" lane={closingReadiness} />
      )}
    </div>
  );
}
