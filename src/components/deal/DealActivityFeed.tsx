type ActivityItem = {
  id: string;
  event_type: string;
  payload: Record<string, any> | null;
  created_at: string;
  created_by_user_id: string | null;
};

type Props = {
  items: ActivityItem[];
};

const LABELS: Record<string, string> = {
  offer_submitted: "Offer submitted",
  offer_withdrawn: "Offer withdrawn",
  offer_accepted: "Offer accepted",
  offer_declined: "Offer declined",
  snapshot_saved: "Snapshot saved",
  SNAPSHOT_CREATED: "Snapshot created",
  DEAL_CREATED: "Deal created",
  DEAL_HEADER_UPDATED: "Deal header updated",
  ACCESS_GRANTED: "Access granted",
  ACCESS_REVOKED: "Access revoked",
  SHARE_TOKEN_MINTED: "Share link created",
  SHARE_TOKEN_REDEEMED: "Share link redeemed",
  OWNER_NOT_CONFIRMED: "Owner not confirmed",
  // Signature lifecycle events
  signature_agreement_prepared: "Agreement prepared",
  signature_request_sent: "Signature request sent",
  signature_buyer_signed: "Buyer signed",
  signature_owner_signed: "Owner signed",
  signature_fully_executed: "Agreement fully executed",
  signature_documents_stored: "Executed documents stored",
  signature_declined: "Signature declined",
  signature_voided: "Signature voided",
};

const TONES: Record<string, string> = {
  offer_submitted: "bg-blue-100 text-blue-800",
  offer_withdrawn: "bg-amber-100 text-amber-800",
  offer_accepted: "bg-green-100 text-green-800",
  offer_declined: "bg-red-100 text-red-800",
  OWNER_NOT_CONFIRMED: "bg-amber-100 text-amber-800",
  // Signature lifecycle tones
  signature_agreement_prepared: "bg-amber-100 text-amber-800",
  signature_request_sent: "bg-blue-100 text-blue-800",
  signature_buyer_signed: "bg-blue-100 text-blue-800",
  signature_owner_signed: "bg-blue-100 text-blue-800",
  signature_fully_executed: "bg-green-100 text-green-800",
  signature_documents_stored: "bg-green-100 text-green-800",
  signature_declined: "bg-red-100 text-red-800",
  signature_voided: "bg-gray-100 text-gray-600",
};

function detailLine(payload: Record<string, any> | null, eventType: string): string | null {
  if (!payload) return null;
  if (eventType === "offer_submitted" && payload.mode) {
    const modeLabels: Record<string, string> = {
      verified_owner: "Direct to verified owner",
      known_email: "Via owner email invite",
      outreach: "FractPath outreach requested",
    };
    return modeLabels[payload.mode] ?? payload.mode;
  }
  if (eventType === "DEAL_HEADER_UPDATED") {
    const parts: string[] = [];
    if (payload.title) parts.push(`Title: ${payload.title}`);
    if (payload.display_address) parts.push(payload.display_address);
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  return null;
}

export function DealActivityFeed({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity recorded for this deal.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const label = LABELS[item.event_type] ?? item.event_type;
        const tone = TONES[item.event_type] ?? "bg-gray-100 text-gray-600";
        const detail = detailLine(item.payload, item.event_type);

        return (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-md px-3 py-2 text-xs hover:bg-muted/50"
          >
            <span
              className={`mt-0.5 shrink-0 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${tone}`}
            >
              {label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
              {detail ? (
                <div className="mt-0.5 text-muted-foreground">{detail}</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
