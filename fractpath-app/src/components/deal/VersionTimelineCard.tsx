import Link from "next/link";
import type { TimelineEntry } from "@/lib/dealTimeline";
import { getVersionBadgeStyle } from "@/lib/versionCardHelpers";

interface VersionTimelineCardProps {
  entry: TimelineEntry;
}

export function VersionTimelineCard({ entry }: VersionTimelineCardProps) {
  const badge = getVersionBadgeStyle(entry.version_type);

  return (
    <div className="flex items-start gap-3 rounded-md border px-3 py-3 text-xs">
      <span
        className={`mt-0.5 inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
      >
        {badge.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{entry.title ?? "Version"}</span>
          <span className="shrink-0 text-muted-foreground">
            {entry.created_at
              ? new Date(entry.created_at).toLocaleString()
              : "\u2014"}
          </span>
        </div>
        {entry.subtitle ? (
          <div className="mt-0.5 text-muted-foreground">{entry.subtitle}</div>
        ) : null}
        {entry.href ? (
          <div className="mt-1.5">
            <Link
              href={entry.href}
              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[11px] font-medium hover:bg-muted/80"
            >
              Compare snapshots
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
