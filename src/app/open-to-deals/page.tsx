import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import Image from "next/image";
import Link from "next/link";

export const runtime = "nodejs";

type OpportunityCard = {
  id: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  ownership_type: string | null;
  occupancy_use: string | null;
  verified_at: string | null;
  // Enrichment fields (merged in after separate query)
  cover_image_url?: string | null;
  property_type?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  value_estimate?: number | null;
};

type EnrichmentRow = {
  property_id: string;
  images_payload: { cover_image_url: string | null; image_urls: string[] } | null;
  summary_payload: {
    property_type: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    value_estimate: number | null;
  } | null;
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

function fmtCurrency(val: number | null | undefined): string {
  if (val == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function fmtNum(val: number | null | undefined): string {
  if (val == null) return "";
  return new Intl.NumberFormat("en-US").format(val);
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

  let opportunities: OpportunityCard[] = error ? [] : ((data ?? []) as OpportunityCard[]);

  // Fetch enrichment for all matching properties in one query
  if (opportunities.length > 0) {
    const ids = opportunities.map((o) => o.id);
    const { data: enrichmentRows } = await (supabase.from("property_enrichments") as any)
      .select("property_id, images_payload, summary_payload")
      .in("property_id", ids)
      .eq("is_current", true)
      .eq("provider", "mashvisor")
      .not("summary_payload", "is", null);

    const enrichmentMap = new Map<string, EnrichmentRow>();
    for (const row of (enrichmentRows ?? []) as EnrichmentRow[]) {
      enrichmentMap.set(row.property_id, row);
    }

    opportunities = opportunities.map((card) => {
      const e = enrichmentMap.get(card.id);
      if (!e) return card;
      return {
        ...card,
        cover_image_url: e.images_payload?.cover_image_url ?? null,
        property_type: e.summary_payload?.property_type ?? null,
        beds: e.summary_payload?.beds ?? null,
        baths: e.summary_payload?.baths ?? null,
        sqft: e.summary_payload?.sqft ?? null,
        value_estimate: e.summary_payload?.value_estimate ?? null,
      };
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-4 py-10 space-y-8">
        {/* Page header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Open to Deals</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Verified homeowner opportunities open to structured home equity agreement
            proposals. All opportunities shown here have completed identity and property
            verification.
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {opportunities.map((card) => (
              <div
                key={card.id}
                className="rounded-xl border bg-card overflow-hidden shadow-sm flex flex-col"
              >
                {/* Thumbnail */}
                <div className="relative h-44 bg-muted/40 flex-shrink-0">
                  {card.cover_image_url ? (
                    <Image
                      src={card.cover_image_url}
                      alt={`Property in ${generalizedLocation(card)}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <svg
                        className="w-10 h-10 text-muted-foreground/30"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div className="p-4 flex flex-col gap-3 flex-1">
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Verified
                    </span>
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                      Open to Deals
                    </span>
                  </div>

                  {/* Location */}
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                      Location
                    </div>
                    <div className="text-sm font-semibold mt-0.5">
                      {generalizedLocation(card)}
                    </div>
                    {card.property_type && (
                      <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {card.property_type}
                      </div>
                    )}
                  </div>

                  {/* Stats row */}
                  {(card.beds || card.baths || card.sqft || card.value_estimate) && (
                    <div className="flex flex-wrap gap-3 text-sm">
                      {card.beds && (
                        <div className="text-center">
                          <div className="font-semibold">{card.beds}</div>
                          <div className="text-[11px] text-muted-foreground">Beds</div>
                        </div>
                      )}
                      {card.baths && (
                        <div className="text-center">
                          <div className="font-semibold">{card.baths}</div>
                          <div className="text-[11px] text-muted-foreground">Baths</div>
                        </div>
                      )}
                      {card.sqft && (
                        <div className="text-center">
                          <div className="font-semibold">{fmtNum(card.sqft)}</div>
                          <div className="text-[11px] text-muted-foreground">Sq ft</div>
                        </div>
                      )}
                      {card.value_estimate && (
                        <div className="text-center">
                          <div className="font-semibold">{fmtCurrency(card.value_estimate)}</div>
                          <div className="text-[11px] text-muted-foreground">Est. value</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verified since */}
                  {card.verified_at && (
                    <div className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                      Verified opportunity · {fmtVerifiedDate(card.verified_at)}
                    </div>
                  )}

                  {/* CTA */}
                  <div className="mt-auto pt-2">
                    <Link
                      href="/deal/new"
                      className="block w-full rounded-md bg-foreground px-3 py-2 text-center text-sm font-medium text-background hover:opacity-90 transition-opacity"
                    >
                      View Opportunity
                    </Link>
                  </div>
                </div>

                {/* Compliance footer */}
                <div className="px-4 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground">
                  Not a public listing or offer of sale. Subject to verification and review.
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
