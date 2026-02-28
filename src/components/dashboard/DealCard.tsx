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

const TONE_COLORS: Record<string, string> = {
  yellow: "bg-yellow-100 text-yellow-800",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-800",
  emerald: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  gray: "bg-gray-100 text-gray-700",
  blue: "bg-blue-100 text-blue-800",
};

function toneClass(statusTone: string | null | undefined): string {
  const tone = statusTone ?? "gray";
  return TONE_COLORS[tone] ?? TONE_COLORS.gray;
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
      className="block rounded-lg border p-4 transition-all hover:bg-muted/50 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-semibold truncate">{title}</span>
          <span
            className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${toneClass(statusTone)}`}
          >
            {statusLabel}
          </span>
          {roleChipLabel ? (
            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {roleChipLabel}
            </span>
          ) : null}
        </div>

        {secondaryFmvLabel ? (
          <div className="text-sm text-muted-foreground">
            {secondaryFmvLabel}
          </div>
        ) : null}

        {kpiLine ? (
          <div className="text-sm font-medium">{kpiLine}</div>
        ) : null}

        {metaLine ? (
          <div className="text-xs text-muted-foreground">{metaLine}</div>
        ) : null}
      </div>
    </Link>
  );
}
