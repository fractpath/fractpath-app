"use client";

import { useState } from "react";
import type { AssumptionItem } from "@/lib/dealSummaryViewModel";

interface DealAssumptionsSummaryProps {
  assumptions: AssumptionItem[];
}

export function DealAssumptionsSummary({ assumptions }: DealAssumptionsSummaryProps) {
  const [open, setOpen] = useState(false);

  if (assumptions.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-sm font-semibold"
      >
        <span>Key assumptions</span>
        <span className="text-xs text-muted-foreground">
          {open ? "Hide" : "Show"} ({assumptions.length})
        </span>
      </button>

      {open ? (
        <div className="mt-2 grid gap-1 rounded-md bg-muted p-3 text-xs">
          {assumptions.map((a) => (
            <div key={a.label} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{a.label}</span>
              <span className="font-medium">{a.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
