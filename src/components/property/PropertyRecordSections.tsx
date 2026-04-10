import type { PropertyRecord } from "@/lib/property/propertyRecord";

type Audience = "owner" | "buyer" | "admin";

type Props = {
  record: PropertyRecord;
  audience: Audience;
};

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(val);
  }
}

function fmtCurrency(val: number | null | undefined): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function fmtNum(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString("en-US");
}

function fmtBool(val: boolean | null | undefined, yes = "Yes", no = "No"): string {
  if (val == null) return "—";
  return val ? yes : no;
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, " ");
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function DefinitionRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b last:border-0 text-sm">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="font-medium text-right break-words max-w-[60%]">{value || "—"}</dd>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

function PropertyDetailsSection({ record }: { record: PropertyRecord }) {
  const rows: { label: string; value: string | null }[] = [
    record.county ? { label: "County", value: record.county } : null,
    record.subdivision ? { label: "Subdivision", value: record.subdivision } : null,
    record.zoning ? { label: "Zoning", value: record.zoning } : null,
    record.apn ? { label: "Parcel number (APN)", value: record.apn } : null,
    record.assessorId ? { label: "Assessor ID", value: record.assessorId } : null,
    record.legalDescription
      ? { label: "Legal description", value: record.legalDescription }
      : null,
    record.ownerOccupied != null
      ? { label: "Owner-occupied", value: fmtBool(record.ownerOccupied) }
      : null,
    record.hoa?.fee != null
      ? {
          label: "HOA fee",
          value: `${fmtCurrency(record.hoa.fee)}${record.hoa.frequency ? ` / ${record.hoa.frequency.toLowerCase()}` : ""}`,
        }
      : null,
  ].filter(Boolean) as { label: string; value: string | null }[];

  if (rows.length === 0) return null;

  return (
    <SectionCard title="Property details">
      <dl>
        {rows.map(({ label, value }) => (
          <DefinitionRow key={label} label={label} value={value} />
        ))}
      </dl>
    </SectionCard>
  );
}

function HomeFeaturesSection({ features }: { features: NonNullable<PropertyRecord["features"]> }) {
  const rows: { label: string; value: string }[] = [
    features.architectureType
      ? { label: "Architecture", value: capitalize(features.architectureType) }
      : null,
    features.exteriorType
      ? { label: "Exterior", value: capitalize(features.exteriorType) }
      : null,
    features.roofType ? { label: "Roof type", value: capitalize(features.roofType) } : null,
    features.heatingType || features.hasHeating != null
      ? {
          label: "Heating",
          value: features.heatingType
            ? capitalize(features.heatingType)
            : fmtBool(features.hasHeating),
        }
      : null,
    features.coolingType || features.hasCooling != null
      ? {
          label: "Cooling",
          value: features.coolingType
            ? capitalize(features.coolingType)
            : fmtBool(features.hasCooling),
        }
      : null,
    features.garageType || features.hasGarage != null
      ? {
          label: "Garage",
          value: features.garageType
            ? capitalize(features.garageType)
            : fmtBool(features.hasGarage),
        }
      : null,
    features.hasPool != null
      ? { label: "Pool", value: fmtBool(features.hasPool) }
      : null,
    features.unitCount != null
      ? { label: "Units", value: String(features.unitCount) }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  if (rows.length === 0) return null;

  return (
    <SectionCard title="Home features">
      <dl>
        {rows.map(({ label, value }) => (
          <DefinitionRow key={label} label={label} value={value} />
        ))}
      </dl>
    </SectionCard>
  );
}

function SaleHistorySection({
  lastSaleDate,
  lastSalePrice,
  saleHistory,
}: {
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  saleHistory: PropertyRecord["saleHistory"];
}) {
  // Use the full history array if available; fall back to last-sale fields
  const entries =
    saleHistory.length > 0
      ? saleHistory
      : lastSaleDate
      ? [
          {
            date: lastSaleDate,
            event: "Sale",
            price: lastSalePrice,
            listingType: null,
            daysOnMarket: null,
          },
        ]
      : [];

  if (entries.length === 0) return null;

  return (
    <SectionCard title="Sale history">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Event</th>
              <th className="pb-2 pr-4 font-medium text-right">Price</th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 font-medium text-right">Days on market</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr
                key={i}
                className="border-b last:border-0 text-sm"
              >
                <td className="py-2 pr-4 text-muted-foreground tabular-nums">
                  {fmtDate(e.date)}
                </td>
                <td className="py-2 pr-4">{e.event ?? "—"}</td>
                <td className="py-2 pr-4 text-right tabular-nums font-medium">
                  {fmtCurrency(e.price)}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {e.listingType ? capitalize(e.listingType) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {e.daysOnMarket != null ? String(e.daysOnMarket) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function TaxHistorySection({
  taxAssessments,
  propertyTaxes,
}: {
  taxAssessments: PropertyRecord["taxAssessments"];
  propertyTaxes: PropertyRecord["propertyTaxes"];
}) {
  if (taxAssessments.length === 0 && propertyTaxes.length === 0) return null;

  // Merge by year into a unified map
  const yearMap = new Map<
    number,
    {
      year: number;
      assessedValue: number | null;
      land: number | null;
      improvements: number | null;
      taxTotal: number | null;
    }
  >();

  for (const a of taxAssessments) {
    yearMap.set(a.year, {
      year: a.year,
      assessedValue: a.value,
      land: a.land,
      improvements: a.improvements,
      taxTotal: null,
    });
  }

  for (const t of propertyTaxes) {
    const existing = yearMap.get(t.year);
    if (existing) {
      existing.taxTotal = t.total;
    } else {
      yearMap.set(t.year, {
        year: t.year,
        assessedValue: null,
        land: null,
        improvements: null,
        taxTotal: t.total,
      });
    }
  }

  const rows = Array.from(yearMap.values()).sort((a, b) => b.year - a.year);

  const showLandImprovements = rows.some(
    (r) => r.land != null || r.improvements != null,
  );

  return (
    <SectionCard title="Tax and assessment history">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
              <th className="pb-2 pr-4 font-medium">Year</th>
              <th className="pb-2 pr-4 font-medium text-right">Assessed value</th>
              {showLandImprovements && (
                <>
                  <th className="pb-2 pr-4 font-medium text-right">Land</th>
                  <th className="pb-2 pr-4 font-medium text-right">Improvements</th>
                </>
              )}
              <th className="pb-2 font-medium text-right">Taxes paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-b last:border-0">
                <td className="py-2 pr-4 tabular-nums text-muted-foreground">{r.year}</td>
                <td className="py-2 pr-4 text-right tabular-nums font-medium">
                  {fmtCurrency(r.assessedValue)}
                </td>
                {showLandImprovements && (
                  <>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {fmtCurrency(r.land)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {fmtCurrency(r.improvements)}
                    </td>
                  </>
                )}
                <td className="py-2 text-right tabular-nums font-medium">
                  {fmtCurrency(r.taxTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

/**
 * Multi-section property record display.
 * Server-renderable — no client hooks.
 *
 * Sections rendered when data is present:
 *   - Property details (county, zoning, APN, HOA, owner-occupied, etc.)
 *   - Home features (architecture, exterior, roof, heating/cooling, garage, pool)
 *   - Sale history
 *   - Tax and assessment history
 *
 * Audience rules:
 *   - All audiences see all RentCast property record fields (public record data).
 *   - owner: shows challenge link at the bottom.
 *   - admin: shows source + fetched-at note.
 *   - buyer: no provider metadata shown.
 */
export function PropertyRecordSections({ record, audience }: Props) {
  const hasSaleHistory =
    record.saleHistory.length > 0 ||
    record.lastSaleDate != null ||
    record.lastSalePrice != null;

  const hasTaxHistory =
    record.taxAssessments.length > 0 || record.propertyTaxes.length > 0;

  const hasFeatures =
    record.features != null &&
    Object.values(record.features).some((v) => v != null);

  const hasPropertyDetails =
    record.county != null ||
    record.subdivision != null ||
    record.zoning != null ||
    record.apn != null ||
    record.assessorId != null ||
    record.legalDescription != null ||
    record.ownerOccupied != null ||
    record.hoa?.fee != null;

  const hasAnything =
    hasPropertyDetails || hasFeatures || hasSaleHistory || hasTaxHistory;

  if (!hasAnything) return null;

  return (
    <div className="space-y-4">
      {/* Property details */}
      {hasPropertyDetails && <PropertyDetailsSection record={record} />}

      {/* Home features */}
      {hasFeatures && record.features && (
        <HomeFeaturesSection features={record.features} />
      )}

      {/* Sale history */}
      {hasSaleHistory && (
        <SaleHistorySection
          lastSaleDate={record.lastSaleDate}
          lastSalePrice={record.lastSalePrice}
          saleHistory={record.saleHistory}
        />
      )}

      {/* Tax and assessment history */}
      {hasTaxHistory && (
        <TaxHistorySection
          taxAssessments={record.taxAssessments}
          propertyTaxes={record.propertyTaxes}
        />
      )}

      {/* Challenge link — owner only */}
      {audience === "owner" && (
        <p className="text-[11px] text-muted-foreground">
          See something incorrect?{" "}
          <a
            href="mailto:review@fractpath.com?subject=Property+facts+challenge"
            className="underline hover:text-foreground transition-colors"
          >
            Let us know
          </a>
          .
        </p>
      )}

      {/* Source note — admin only */}
      {audience === "admin" && record.fetchedAt && (
        <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
          Property record sourced from RentCast ·{" "}
          {new Date(record.fetchedAt).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
    </div>
  );
}
