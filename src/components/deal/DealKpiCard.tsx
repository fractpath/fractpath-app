import type { KpiItem } from "@/lib/dealSummaryViewModel";

interface DealKpiCardProps {
  kpis: KpiItem[];
}

export function DealKpiCard({ kpis }: DealKpiCardProps) {
  if (kpis.length === 0) return null;

  const [headline, ...supporting] = kpis;

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-primary/5 p-4 text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {headline.label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{headline.value}</div>
      </div>

      {supporting.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {supporting.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-md border px-3 py-2 text-center"
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {kpi.label}
              </div>
              <div className="mt-0.5 text-sm font-semibold">{kpi.value}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
