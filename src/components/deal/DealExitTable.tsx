import type { ExitRow } from "@/lib/dealSummaryViewModel";

interface DealExitTableProps {
  exits: ExitRow[];
}

export function DealExitTable({ exits }: DealExitTableProps) {
  if (exits.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold">Exit outcomes</h3>
      <div className="mt-2 overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Scenario</th>
              <th className="px-3 py-2 text-right font-medium">Net payout</th>
              <th className="px-3 py-2 text-right font-medium">Timing</th>
            </tr>
          </thead>
          <tbody>
            {exits.map((row) => (
              <tr key={row.label} className="border-b last:border-b-0">
                <td className="px-3 py-2 font-medium">{row.label}</td>
                <td className="px-3 py-2 text-right">{row.netPayout}</td>
                <td className="px-3 py-2 text-right">{row.timing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
