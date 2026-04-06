import { createServiceClient } from "@/lib/supabase/service";
import { AppHeader } from "@/components/layout/AppHeader";
import Image from "next/image";
import Link from "next/link";

export const runtime = "nodejs";

type PropertyRow = {
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  verified_at: string | null;
  ownership_type: string | null;
  occupancy_use: string | null;
  // Enrichment (merged in)
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

function formatAddress(row: PropertyRow): string {
  const parts: string[] = [];
  if (row.address_line1) parts.push(row.address_line1);
  if (row.address_line2) parts.push(row.address_line2);
  const cityStateZip: string[] = [];
  if (row.city) cityStateZip.push(row.city);
  if (row.state) cityStateZip.push(row.state);
  if (row.postal_code) cityStateZip.push(row.postal_code);
  if (cityStateZip.length > 0) parts.push(cityStateZip.join(", "));
  return parts.join("\n");
}

function fmtNum(val: number | null | undefined): string {
  if (val == null) return "";
  return new Intl.NumberFormat("en-US").format(val);
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

function humanizeOccupancy(val: string | null | undefined): string | null {
  if (!val) return null;
  if (val === "primary_residence") return "Primary residence";
  if (val === "secondary_residence") return "Secondary residence";
  if (val === "rental_property") return "Rental property";
  return val.replace(/_/g, " ");
}

export default async function VerifiedPropertiesPage() {
  const supabase = createServiceClient();

  // Eligibility: canonical verified state + publicly enabled.
  // verified_at is used for display only — its absence does NOT disqualify a verified property.
  // Nulls are sorted last so properties with a stamped date appear first.
  const { data, error } = await (supabase.from("properties") as any)
    .select(
      "id, address_line1, address_line2, city, state, postal_code, verified_at, ownership_type, occupancy_use",
    )
    .eq("status", "verified")
    .eq("visibility_preference", "public")
    .order("verified_at", { ascending: false, nullsFirst: false });

  let rows: PropertyRow[] = error ? [] : ((data ?? []) as PropertyRow[]);

  // Batch-fetch enrichment for all eligible properties (no API calls — persisted data only)
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data: enrichmentRows } = await (supabase
      .from("property_enrichments") as any)
      .select("property_id, images_payload, summary_payload")
      .in("property_id", ids)
      .eq("is_current", true)
      .eq("provider", "mashvisor")
      .not("summary_payload", "is", null);

    const enrichMap = new Map<string, EnrichmentRow>();
    for (const e of (enrichmentRows ?? []) as EnrichmentRow[]) {
      enrichMap.set(e.property_id, e);
    }

    rows = rows.map((row) => {
      const e = enrichMap.get(row.id);
      if (!e) return row;
      return {
        ...row,
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
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold">Verified Properties</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Verified properties open to home equity agreement proposals. Each
            property shown here has completed the verification process.
          </p>
        </div>

        {/* Grid */}
        {rows.length === 0 ? (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            No verified properties are currently available. Check back later.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => {
              const address = formatAddress(row);
              const hasStats = row.beds || row.baths || row.sqft || row.value_estimate;
              const occupancyLabel = humanizeOccupancy(row.occupancy_use);
              const typeLabel = row.property_type
                ? row.property_type
                : occupancyLabel;

              return (
                <div
                  key={row.id}
                  className="rounded-xl border bg-card overflow-hidden shadow-sm flex flex-col"
                >
                  {/* Thumbnail or placeholder */}
                  <div className="relative h-44 bg-muted/40 flex-shrink-0">
                    {row.cover_image_url ? (
                      <Image
                        src={row.cover_image_url}
                        alt={`Property at ${row.address_line1 ?? "verified property"}`}
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
                          aria-hidden="true"
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
                    {/* Verified badge */}
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Verified
                      </span>
                    </div>

                    {/* Address */}
                    <div>
                      <div className="text-sm font-semibold leading-snug whitespace-pre-line">
                        {address}
                      </div>
                      {typeLabel && (
                        <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {typeLabel}
                        </div>
                      )}
                    </div>

                    {/* Enrichment stats — only when available */}
                    {hasStats && (
                      <div className="flex flex-wrap gap-3 text-sm">
                        {row.beds != null && (
                          <div className="text-center">
                            <div className="font-semibold">{row.beds}</div>
                            <div className="text-[11px] text-muted-foreground">Beds</div>
                          </div>
                        )}
                        {row.baths != null && (
                          <div className="text-center">
                            <div className="font-semibold">{row.baths}</div>
                            <div className="text-[11px] text-muted-foreground">Baths</div>
                          </div>
                        )}
                        {row.sqft != null && (
                          <div className="text-center">
                            <div className="font-semibold">{fmtNum(row.sqft)}</div>
                            <div className="text-[11px] text-muted-foreground">Sq ft</div>
                          </div>
                        )}
                        {row.value_estimate != null && (
                          <div className="text-center">
                            <div className="font-semibold">
                              {fmtCurrency(row.value_estimate)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Est. value
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CTA */}
                    <div className="mt-auto pt-2">
                      <Link
                        href={`/verified-properties/${row.id}`}
                        className="block w-full rounded-md bg-foreground px-3 py-2 text-center text-sm font-medium text-background hover:opacity-90 transition-opacity"
                      >
                        View Property
                      </Link>
                    </div>
                  </div>

                  {/* Compliance footer */}
                  <div className="px-4 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground">
                    Not a public listing or offer of sale. Subject to review.
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
