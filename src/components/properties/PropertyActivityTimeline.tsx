// Server-side rendering is fine — this is a display-only component.

export type PropertyAuditEntry = {
  id: string;
  notes: string | null;
  actor_type: string | null;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
};

// ─── Human-readable labels for known note patterns ────────────────────────────

const NOTE_DISPLAY_MAP: Array<{ pattern: RegExp; label: string; icon: string }> = [
  { pattern: /ATTOM enhanced valuation requested by owner/i, label: "Enhanced valuation requested by owner", icon: "📋" },
  { pattern: /Manual appraisal challenge initiated/i, label: "Manual appraisal challenge initiated", icon: "🔍" },
  { pattern: /Manual appraisal payment pending/i, label: "Appraisal payment requested", icon: "💳" },
  { pattern: /Manual appraisal in progress/i, label: "Licensed appraisal in progress", icon: "🏠" },
  { pattern: /Manual appraisal.*completed.*FMV/i, label: "Manual appraisal completed — new FMV basis applied", icon: "✅" },
  { pattern: /Manual appraisal challenge reset/i, label: "Manual appraisal challenge reset", icon: "↩️" },
  { pattern: /Escalated AVM.*completed/i, label: "ATTOM enhanced valuation completed", icon: "✅" },
  { pattern: /Escalation deposit.*paid/i, label: "Enhanced valuation payment confirmed", icon: "💳" },
  { pattern: /Escalation deposit.*requested/i, label: "Enhanced valuation payment requested", icon: "📬" },
  { pattern: /property.*status.*changed/i, label: "Property status updated", icon: "📝" },
  { pattern: /closing.*review/i, label: "Closing review updated", icon: "📋" },
  { pattern: /escalation.*avm.*ordered/i, label: "ATTOM AVM ordered", icon: "🔄" },
];

function humanizeNote(notes: string | null): string {
  if (!notes) return "Status updated";
  for (const { pattern, label } of NOTE_DISPLAY_MAP) {
    if (pattern.test(notes)) return label;
  }
  // Truncate long raw notes
  return notes.length > 80 ? notes.slice(0, 77) + "…" : notes;
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function actorLabel(actorType: string | null): string {
  if (actorType === "owner") return "You";
  if (actorType === "admin") return "FractPath team";
  if (actorType === "system") return "System";
  return "Unknown";
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  entries: PropertyAuditEntry[];
};

export function PropertyActivityTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border p-5">
        <h2 className="text-sm font-semibold mb-2">Property activity</h2>
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-5 space-y-3">
      <h2 className="text-sm font-semibold">Property activity</h2>
      <ol className="space-y-3">
        {entries.map((entry, idx) => {
          const isFirst = idx === 0;
          const label = humanizeNote(entry.notes);
          const actor = actorLabel(entry.actor_type);
          const date = formatDate(entry.created_at);

          return (
            <li key={entry.id} className="flex gap-3 items-start">
              {/* Timeline dot */}
              <div className="flex flex-col items-center mt-0.5">
                <span className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${isFirst ? "bg-blue-500" : "bg-gray-300"}`} />
                {idx < entries.length - 1 && (
                  <div className="w-px flex-1 bg-gray-200 mt-1" style={{ minHeight: "16px" }} />
                )}
              </div>
              {/* Content */}
              <div className="pb-3 flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-snug">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {actor} · {date}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
