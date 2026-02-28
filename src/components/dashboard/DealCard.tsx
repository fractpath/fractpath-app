import Link from "next/link";

export type DealCardProps = {
  href: string;
  title: string;
  secondaryId?: string | null;
  statusLabel: string;
  statusKey?: string | null;
  roleChipLabel?: string | null;
  fmvLabel?: string | null;
  upfrontMonthlyLabel?: string | null;
  vestedLabel?: string | null;
  exitYearLabel?: string | null;
  updatedLabel?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  NEEDS_REVIEW: "bg-yellow-100 text-yellow-800",
  UNDER_REVIEW: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  ARCHIVED: "bg-muted text-muted-foreground",
  CLOSED: "bg-slate-200 text-slate-800",
  IMPORTED: "bg-blue-100 text-blue-800",
};

function statusColorClass(rawStatus: string): string {
  return STATUS_COLORS[rawStatus.toUpperCase()] ?? "bg-gray-100 text-gray-700";
}

export function DealCard({
  href,
  title,
  secondaryId,
  statusLabel,
  statusKey,
  roleChipLabel,
  fmvLabel,
  upfrontMonthlyLabel,
  vestedLabel,
  exitYearLabel,
  updatedLabel,
}: DealCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-lg border p-4 transition-colors hover:bg-muted/50 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold truncate">{title}</span>
            {roleChipLabel ? (
              <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">
                {roleChipLabel}
              </span>
            ) : null}
          </div>
          <span
            className={`shrink-0 text-[10px] px-2 py-1 rounded-full font-medium ${statusColorClass(statusKey ?? statusLabel)}`}
          >
            {statusLabel}
          </span>
        </div>

        {secondaryId ? (
          <div className="text-xs text-muted-foreground truncate">
            {secondaryId}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              FMV
            </div>
            <div className="text-sm font-semibold">{fmvLabel ?? "\u2014"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Upfront + Mo
            </div>
            <div className="text-sm font-semibold">
              {upfrontMonthlyLabel ?? "\u2014"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Vested
            </div>
            <div className="text-sm font-semibold">
              {vestedLabel ?? "\u2014"}
            </div>
          </div>
        </div>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{exitYearLabel ?? ""}</span>
          <span>{updatedLabel ?? ""}</span>
        </div>
      </div>
    </Link>
  );
}
