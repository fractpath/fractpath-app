import Link from "next/link";

export type DealCardProps = {
  href: string;
  title: string;
  secondaryFmvLabel?: string | null;
  kpiLine?: string | null;
  metaLine?: string | null;
  statusLabel: string;
  statusTone?: string | null;
  roleChipLabel?: string | null;
};

const STATUS_TONE_CLASSES: Record<string, string> = {
  yellow: "bg-yellow-100 text-yellow-800",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-800",
  emerald: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-100 text-blue-800",
};

const STATUS_DEFAULT_TONES: Record<string, string> = {
  DRAFT: "yellow",
  NEEDS_REVIEW: "amber",
  UNDER_REVIEW: "amber",
  ACTIVE: "green",
  ACCEPTED: "emerald",
  REJECTED: "red",
  ARCHIVED: "gray",
  CLOSED: "gray",
  IMPORTED: "blue",
};

function resolveToneClass(statusLabel: string, statusTone?: string | null): string {
  const tone = statusTone ?? STATUS_DEFAULT_TONES[statusLabel.toUpperCase()] ?? "gray";
  return STATUS_TONE_CLASSES[tone] ?? STATUS_TONE_CLASSES["gray"];
}

export function DealCard({
  href,
  title,
  secondaryFmvLabel,
  kpiLine,
  metaLine,
  statusLabel,
  statusTone,
  roleChipLabel,
}: DealCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-lg border p-4 transition-all hover:bg-muted/50 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base font-semibold truncate">{title}</span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight ${resolveToneClass(statusLabel, statusTone)}`}
        >
          {statusLabel}
        </span>
        {roleChipLabel ? (
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight text-muted-foreground">
            {roleChipLabel}
          </span>
        ) : null}
      </div>

      {secondaryFmvLabel ? (
        <div className="mt-1 text-sm text-muted-foreground">{secondaryFmvLabel}</div>
      ) : null}

      {kpiLine ? (
        <div className="mt-2 text-sm font-medium">{kpiLine}</div>
      ) : null}

      {metaLine ? (
        <div className="mt-1 text-xs text-muted-foreground">{metaLine}</div>
      ) : null}
    </Link>
  );
}
