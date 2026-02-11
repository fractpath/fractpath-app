import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimelineEntry {
  id: string;
  type: "SNAPSHOT" | "VERSION" | "EVENT";
  created_at: string;
  title: string;
  subtitle: string | null;
  href: string | null;
}

export interface DealEventRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

export interface GetDealEventsResult {
  ok: true;
  events: DealEventRow[];
}

export interface GetDealEventsError {
  ok: false;
  error: string;
}

export async function getDealEvents(
  supabase: SupabaseClient,
  dealId: string,
  limit = 50,
): Promise<GetDealEventsResult | GetDealEventsError> {
  const { data, error } = await (supabase.from("deal_events") as any)
    .select("id, event_type, payload, created_by, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, events: (data ?? []) as DealEventRow[] };
}

function versionTypeLabel(vt: string): string {
  switch (vt) {
    case "OFFER": return "Offer submitted";
    case "COUNTER": return "Counter-offer submitted";
    case "ACCEPT": return "Version accepted";
    case "REJECT": return "Version rejected";
    default: return `Version: ${vt}`;
  }
}

function eventTypeLabel(et: string): string {
  switch (et) {
    case "DEAL_CREATED": return "Deal created";
    case "DEAL_SNAPSHOT_CREATED": return "Snapshot added";
    case "DEAL_OFFER_CREATED": return "Offer created";
    case "DEAL_COUNTER_CREATED": return "Counter-offer created";
    case "DEAL_VERSION_DECIDED": return "Decision recorded";
    case "DEAL_SHARED": return "Deal shared";
    default: return et.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export interface BuildTimelineInput {
  dealId: string;
  snapshots: Array<{
    id: string;
    created_at: string;
    contract_version: string;
    schema_version: string;
  }>;
  versions: Array<{
    id: string;
    created_at: string;
    version_number: number;
    version_type: string;
    proposed_snapshot_id: string | null;
    base_snapshot_id: string | null;
    note: string | null;
    meta: Record<string, unknown>;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    created_at: string;
    payload: Record<string, unknown> | null;
  }>;
}

export function buildDealTimeline(input: BuildTimelineInput): TimelineEntry[] {
  const { dealId, snapshots, versions, events } = input;
  const entries: TimelineEntry[] = [];

  for (const s of snapshots) {
    entries.push({
      id: s.id,
      type: "SNAPSHOT",
      created_at: s.created_at ?? "",
      title: "Snapshot saved",
      subtitle: `v${s.contract_version ?? "?"} / s${s.schema_version ?? "?"}`,
      href: `/deal/${dealId}?snapshot=${s.id}`,
    });
  }

  for (const v of versions) {
    let href: string | null = null;

    if (
      v.version_type === "OFFER" || v.version_type === "COUNTER"
    ) {
      if (v.proposed_snapshot_id && v.base_snapshot_id) {
        href = `/deal/${dealId}/compare?a=${v.base_snapshot_id}&b=${v.proposed_snapshot_id}`;
      } else if (v.proposed_snapshot_id) {
        href = `/deal/${dealId}?snapshot=${v.proposed_snapshot_id}`;
      }
    }

    if (
      (v.version_type === "ACCEPT" || v.version_type === "REJECT") &&
      v.meta?.target_version_id
    ) {
      // No deep link for decisions beyond the deal page itself
    }

    const subtitle = v.note
      ? `#${v.version_number ?? "?"} — ${v.note}`
      : `#${v.version_number ?? "?"}`;

    entries.push({
      id: v.id,
      type: "VERSION",
      created_at: v.created_at ?? "",
      title: versionTypeLabel(v.version_type ?? "UNKNOWN"),
      subtitle,
      href,
    });
  }

  for (const e of events) {
    entries.push({
      id: e.id,
      type: "EVENT",
      created_at: e.created_at ?? "",
      title: eventTypeLabel(e.event_type ?? "UNKNOWN"),
      subtitle: null,
      href: null,
    });
  }

  entries.sort((a, b) => {
    if (!a.created_at && !b.created_at) return 0;
    if (!a.created_at) return 1;
    if (!b.created_at) return -1;
    return b.created_at.localeCompare(a.created_at);
  });

  return entries;
}
