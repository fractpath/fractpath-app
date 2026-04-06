import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";

export const runtime = "nodejs";

type OpportunityCard = {
  id: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  ownership_type: string | null;
  occupancy_use: string | null;
  verified_at: string | null;
};

const OWNERSHIP_TYPE_LABELS: Record<string, string> = {
  sole: "Single-owner",
  joint: "Joint ownership",
  trust: "Trust held",
  llc: "LLC held",
  other: "Other ownership",
};

const OCCUPANCY_USE_LABELS: Record<string, string> = {
  primary_residence: "Primary residence",
  secondary_residence: "Secondary / vacation home",
  investment: "Investment property",
  other: "Other",
};

function fmtVerifiedDate(val: string | null | undefined): string {
  if (!val) return "";
  try {
    return new Date(val).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function generalizedLocation(card: OpportunityCard): string {
  const parts: string[] = [];
  if (card.city) parts.push(card.city);
  if (card.state) parts.push(card.state);
  return parts.join(", ") || (card.postal_code ? `ZIP ${card.postal_code}` : "Location withheld");
}

export default async function OpenToDealsPage() {
  const supabase = createServiceClient();

  const { data, error } = await (supabase.from("properties") as any)
    .select(
      "id, city, state, postal_code, ownership_type, occupancy_use, verified_at",
    )
    .eq("status", "verified")
    .eq("proposal_interest_status", "interested_after_verification")
    .eq("visibility_preference", "public")
    .not("verified_at", "is", null)
    .order("verified_at", { ascending: false });

  const opportunities: OpportunityCard[] = error ? [] : ((data ?? []) as OpportunityCard[]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
        {/* Page header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Open to Deals</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Verified homeowner opportunities open to structured home equity agreement proposals.
            All opportunities shown here have completed identity and property verification.
          </p>
          <p className="text-xs text-muted-foreground">
            Property details are subject to verification and review. Exact addresses are not
            disclosed at this stage.
          </p>
        </div>

        {/* Opportunity grid */}
        {opportunities.length === 0 ? (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            No verified opportunities are currently open to proposals. Check back later.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {opportunities.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border bg-card p-5 space-y-3"
              >
                {/* Status chips */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800">
                    Verified
                  </span>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                    Accepting structured proposals
                  </span>
                </div>

                {/* Location — city/state only, no street address */}
                <div>
                  <div className="text-xs text-muted-foreground">Location</div>
                  <div className="text-sm font-medium mt-0.5">
                    {generalizedLocation(card)}
                  </div>
                </div>

                {/* Property attributes */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {card.ownership_type && OWNERSHIP_TYPE_LABELS[card.ownership_type] && (
                    <div>
                      <div className="text-xs text-muted-foreground">Ownership</div>
                      <div className="font-medium">
                        {OWNERSHIP_TYPE_LABELS[card.ownership_type]}
                      </div>
                    </div>
                  )}
                  {card.occupancy_use && OCCUPANCY_USE_LABELS[card.occupancy_use] && (
                    <div>
                      <div className="text-xs text-muted-foreground">Use</div>
                      <div className="font-medium">
                        {OCCUPANCY_USE_LABELS[card.occupancy_use]}
                      </div>
                    </div>
                  )}
                </div>

                {/* Verified since */}
                {card.verified_at && (
                  <div className="text-xs text-muted-foreground">
                    Verified opportunity · {fmtVerifiedDate(card.verified_at)}
                  </div>
                )}

                {/* Compliance footer */}
                <div className="pt-1 border-t text-xs text-muted-foreground">
                  Property details subject to verification and review. This is not a public
                  listing or offer of sale.
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
