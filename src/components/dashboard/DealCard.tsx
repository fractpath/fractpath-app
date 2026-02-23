import Link from "next/link";

export type DealCardProps = {
  href: string;
  label: string;
  secondary?: string;
  statusLabel: string;
  kpis: {
    propertyValue?: number | null;
    upfront?: number | null;
    monthly?: number | null;
  };
  unreadCount?: number | null;
};

function fmtCurrency(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

const STATUS_COLORS: Record<string, string> = {
  IMPORTED: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-600",
  DRAFT: "bg-yellow-100 text-yellow-800",
};

function statusColor(status: string): string {
  return STATUS_COLORS[status.toUpperCase()] ?? "bg-gray-100 text-gray-700";
}

export function DealCard({
  href,
  label,
  secondary,
  statusLabel,
  kpis,
  unreadCount,
}: DealCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{label}</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight ${statusColor(statusLabel)}`}
            >
              {statusLabel}
            </span>
            {unreadCount != null && unreadCount > 0 ? (
              <span className="inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {unreadCount}
              </span>
            ) : null}
          </div>
          {secondary ? (
            <div className="mt-0.5 text-xs text-muted-foreground truncate">
              {secondary}
            </div>
          ) : null}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">&rarr;</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Property Value
          </div>
          <div className="text-sm font-medium">
            {fmtCurrency(kpis.propertyValue)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Upfront
          </div>
          <div className="text-sm font-medium">
            {fmtCurrency(kpis.upfront)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Monthly
          </div>
          <div className="text-sm font-medium">
            {fmtCurrency(kpis.monthly)}
          </div>
        </div>
      </div>
    </Link>
  );
}
