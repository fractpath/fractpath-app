import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";

type SigFilter =
  | "all"
  | "ready"
  | "prepared"
  | "sent"
  | "partially_signed"
  | "completed"
  | "needs_attention";

const FILTER_ORDER: SigFilter[] = [
  "all",
  "ready",
  "prepared",
  "sent",
  "partially_signed",
  "completed",
  "needs_attention",
];

const FILTER_LABELS: Record<SigFilter, string> = {
  all: "All",
  ready: "Ready to prepare",
  prepared: "Prepared",
  sent: "Sent",
  partially_signed: "Partially signed",
  completed: "Completed",
  needs_attention: "Needs attention",
};

function isFilter(v: unknown): v is SigFilter {
  return (
    v === "all" ||
    v === "ready" ||
    v === "prepared" ||
    v === "sent" ||
    v === "partially_signed" ||
    v === "completed" ||
    v === "needs_attention"
  );
}

type RowState =
  | "ready"
  | "prepared"
  | "sent"
  | "partially_signed"
  | "completed"
  | "needs_attention";

function packetStatusToRowState(status: string | null): RowState {
  if (!status) return "ready";
  if (status === "prepared") return "prepared";
  if (status === "sent" || status === "delivered") return "sent";
  if (status === "partially_signed") return "partially_signed";
  if (status === "completed") return "completed";
  return "needs_attention";
}

const ROW_STATE_BADGES: Record<
  RowState,
  { label: string; bg: string; text: string; border: string }
> = {
  ready: {
    label: "Ready to prepare",
    bg: "bg-amber-100",
    text: "text-amber-800",
    border: "border-amber-200",
  },
  prepared: {
    label: "Prepared",
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-200",
  },
  sent: {
    label: "Sent",
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-200",
  },
  partially_signed: {
    label: "Partially signed",
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-200",
  },
  completed: {
    label: "Completed",
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-200",
  },
  needs_attention: {
    label: "Needs attention",
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-200",
  },
};

const ROW_STATE_SORT_ORDER: Record<RowState, number> = {
  needs_attention: 0,
  ready: 1,
  prepared: 2,
  sent: 3,
  partially_signed: 4,
  completed: 5,
};

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams?: Promise<SearchParams> };

function fmtTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function stateBadge(state: RowState) {
  const b = ROW_STATE_BADGES[state];
  return (
    <span
      className={`inline-flex items-center rounded-full border ${b.bg} ${b.text} ${b.border} px-2 py-0.5 text-xs font-medium`}
    >
      {b.label}
    </span>
  );
}

export default async function AdminSignaturesPage({ searchParams }: PageProps) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    if (admin.status === 401) {
      redirect(`/login?returnTo=${encodeURIComponent("/admin/signatures")}`);
    }
    return (
      <div>
        <AppHeader />
        <main className="mx-auto max-w-5xl p-6 space-y-6">
          <h1 className="text-2xl font-semibold">Admin — Signatures</h1>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium">Access denied</div>
            <div className="mt-2 text-sm text-muted-foreground">
              You are signed in as{" "}
              <span className="font-mono">{admin.email ?? "unknown"}</span> but
              do not have admin access.
            </div>
            <div className="mt-4">
              <a className="text-sm underline" href="/dashboard">
                Back to Dashboard
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const resolved = (await Promise.resolve(searchParams)) as
    | SearchParams
    | undefined;
  const raw = resolved?.status;
  const filterRaw = Array.isArray(raw) ? raw[0] : raw;
  const filter: SigFilter = isFilter(filterRaw) ? filterRaw : "all";

  const svc = createServiceClient();

  const { data: acceptedThreads, error: threadsError } = await (
    svc.from("deal_threads") as any
  )
    .select(
      "id, deal_id, status, buyer_user_id, owner_user_id, property_id, created_at",
    )
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(200);

  if (threadsError) {
    return (
      <main className="mx-auto max-w-5xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Admin — Signatures</h1>
        <div className="rounded-lg border p-4">
          <div className="text-sm font-medium">Failed to load threads</div>
          <div className="mt-2 text-sm text-muted-foreground break-words">
            {threadsError.message}
          </div>
        </div>
      </main>
    );
  }

  const allThreads = (acceptedThreads ?? []) as any[];
  const dealIds = Array.from(
    new Set(allThreads.map((t: any) => t.deal_id).filter(Boolean) as string[]),
  );

  const [headerEventsRes, packetsRes] = await Promise.all([
    dealIds.length > 0
      ? (svc.from("deal_events") as any)
          .select("deal_id, payload")
          .in("deal_id", dealIds)
          .eq("event_type", "DEAL_HEADER_UPDATED")
          .order("created_at", { ascending: false })
      : { data: [] },
    dealIds.length > 0
      ? (svc.from("deal_signature_packets") as any)
          .select(
            "id, deal_id, status, packet_version, sent_at, completed_at, declined_at, voided_at, last_error, updated_at, created_at",
          )
          .in("deal_id", dealIds)
          .order("created_at", { ascending: false })
      : { data: [] },
  ]);

  const headerByDeal = new Map<string, any>();
  for (const ev of headerEventsRes.data ?? []) {
    if (ev?.deal_id && ev?.payload && !headerByDeal.has(ev.deal_id)) {
      headerByDeal.set(ev.deal_id, ev.payload);
    }
  }

  const latestPacketByDeal = new Map<string, any>();
  for (const pkt of packetsRes.data ?? []) {
    if (pkt?.deal_id && !latestPacketByDeal.has(pkt.deal_id)) {
      latestPacketByDeal.set(pkt.deal_id, pkt);
    }
  }

  const packetIds = Array.from(latestPacketByDeal.values())
    .map((p: any) => p.id)
    .filter(Boolean) as string[];

  const recipientsRes =
    packetIds.length > 0
      ? await (svc.from("deal_signature_recipients") as any)
          .select("packet_id, role, display_name, email, provider_status, signed_at")
          .in("packet_id", packetIds)
      : { data: [] };

  const recipientsByPacket = new Map<
    string,
    { buyer: any | null; owner: any | null }
  >();
  for (const r of recipientsRes.data ?? []) {
    if (!r?.packet_id) continue;
    if (!recipientsByPacket.has(r.packet_id)) {
      recipientsByPacket.set(r.packet_id, { buyer: null, owner: null });
    }
    const entry = recipientsByPacket.get(r.packet_id)!;
    if (r.role === "Buyer") entry.buyer = r;
    if (r.role === "Owner") entry.owner = r;
  }

  const latestThreadByDeal = new Map<string, any>();
  for (const t of allThreads) {
    if (t?.deal_id && !latestThreadByDeal.has(t.deal_id)) {
      latestThreadByDeal.set(t.deal_id, t);
    }
  }

  type RowVm = {
    dealId: string;
    dealTitle: string;
    dealAddress: string | null;
    buyerLabel: string;
    ownerLabel: string;
    state: RowState;
    packetStatus: string | null;
    packetVersion: number | null;
    lastTimestamp: string | null;
    isAttention: boolean;
    lastError: string | null;
    buyerSignedAt: string | null;
    ownerSignedAt: string | null;
  };

  const allRows: RowVm[] = dealIds.map((dealId) => {
    const header = headerByDeal.get(dealId);
    const pkt = latestPacketByDeal.get(dealId) ?? null;
    const thread = latestThreadByDeal.get(dealId);

    const title =
      typeof header?.title === "string" && header.title.trim()
        ? header.title.trim()
        : dealId.slice(0, 8) + "…";
    const address =
      typeof header?.display_address === "string" && header.display_address.trim()
        ? header.display_address.trim()
        : null;

    const state = packetStatusToRowState(pkt?.status ?? null);

    const recipients = pkt ? (recipientsByPacket.get(pkt.id) ?? null) : null;
    const buyerLabel =
      recipients?.buyer?.display_name ??
      recipients?.buyer?.email ??
      (thread?.buyer_user_id ? thread.buyer_user_id.slice(0, 8) + "…" : "—");
    const ownerLabel =
      recipients?.owner?.display_name ??
      recipients?.owner?.email ??
      (thread?.owner_user_id ? thread.owner_user_id.slice(0, 8) + "…" : "—");

    const lastTimestamp: string | null =
      pkt?.completed_at ??
      pkt?.declined_at ??
      pkt?.voided_at ??
      pkt?.sent_at ??
      pkt?.updated_at ??
      pkt?.created_at ??
      thread?.created_at ??
      null;

    return {
      dealId,
      dealTitle: title,
      dealAddress: address,
      buyerLabel,
      ownerLabel,
      state,
      packetStatus: pkt?.status ?? null,
      packetVersion: pkt?.packet_version ?? null,
      lastTimestamp,
      isAttention: state === "needs_attention",
      lastError: pkt?.last_error ?? null,
      buyerSignedAt: recipients?.buyer?.signed_at ?? null,
      ownerSignedAt: recipients?.owner?.signed_at ?? null,
    };
  });

  const filteredRows = allRows.filter((row) => {
    if (filter === "all") return true;
    return row.state === filter;
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    const ao = ROW_STATE_SORT_ORDER[a.state];
    const bo = ROW_STATE_SORT_ORDER[b.state];
    if (ao !== bo) return ao - bo;
    const ta = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
    const tb = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
    return tb - ta;
  });

  const countByState = {
    all: allRows.length,
    ready: allRows.filter((r) => r.state === "ready").length,
    prepared: allRows.filter((r) => r.state === "prepared").length,
    sent: allRows.filter((r) => r.state === "sent").length,
    partially_signed: allRows.filter((r) => r.state === "partially_signed").length,
    completed: allRows.filter((r) => r.state === "completed").length,
    needs_attention: allRows.filter((r) => r.state === "needs_attention").length,
  };

  return (
    <div>
      <AppHeader />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Admin — Signatures</h1>
            <p className="text-sm text-muted-foreground">
              Signature execution ops queue for accepted deals
            </p>
          </div>
          <a className="text-sm underline" href="/admin/properties">
            Properties queue
          </a>
        </div>

        <div className="flex gap-2 flex-wrap">
          {FILTER_ORDER.map((s) => {
            const active = s === filter;
            const href = `/admin/signatures?status=${encodeURIComponent(s)}`;
            const count = countByState[s];
            return (
              <a
                key={s}
                href={href}
                className={[
                  "inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full border",
                  active ? "bg-foreground text-background" : "hover:bg-muted",
                ].join(" ")}
              >
                {FILTER_LABELS[s]}
                {count > 0 && (
                  <span
                    className={`text-[10px] font-semibold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center ${active ? "bg-background text-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {count}
                  </span>
                )}
              </a>
            );
          })}
        </div>

        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Deal</th>
                <th className="p-3">Buyer</th>
                <th className="p-3">Owner</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last update</th>
                <th className="p-3 w-[100px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td
                    className="p-3 text-muted-foreground"
                    colSpan={6}
                  >
                    No deals found for: {FILTER_LABELS[filter]}
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const dimmed = row.state === "completed";
                  return (
                    <tr
                      key={row.dealId}
                      className={`border-t ${dimmed ? "opacity-60" : ""} ${row.isAttention ? "bg-red-50/30" : ""}`}
                    >
                      <td className="p-3">
                        <a
                          className="font-medium underline"
                          href={`/deal/${row.dealId}`}
                        >
                          {row.dealTitle}
                        </a>
                        {row.dealAddress && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {row.dealAddress}
                          </div>
                        )}
                        {row.packetVersion != null && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                            v{row.packetVersion}
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="text-sm">{row.buyerLabel}</div>
                        {row.buyerSignedAt && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Signed {fmtTimestamp(row.buyerSignedAt)}
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="text-sm">{row.ownerLabel}</div>
                        {row.ownerSignedAt && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Signed {fmtTimestamp(row.ownerSignedAt)}
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        {stateBadge(row.state)}
                        {row.lastError && (
                          <div className="text-[10px] text-red-600 mt-1 break-words max-w-[200px]">
                            {row.lastError}
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtTimestamp(row.lastTimestamp)}
                      </td>

                      <td className="p-3">
                        <a
                          className="text-xs px-2 py-1 rounded border hover:bg-muted inline-block whitespace-nowrap"
                          href={`/deal/${row.dealId}`}
                        >
                          Open deal
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
