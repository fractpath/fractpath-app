'use client';

import React from "react";

/**
 * Canonical-only v10 reset:
 * - Avoid importing legacy types from dealSummaryViewModel (they were removed/renamed).
 * - Keep component permissive while UI alignment work is in progress.
 */
export function DealKpiCard(props: any) {
  const items = props?.items ?? props?.kpis ?? props?.vm?.kpis ?? [];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600 }}>Key metrics</h3>
      {Array.isArray(items) && items.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((it: any, idx: number) => (
            <div
              key={idx}
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 12,
                padding: 12,
              }}
            >
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {it?.label ?? it?.title ?? `Metric ${idx + 1}` }
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {it?.value ?? it?.display ?? it?.amount ?? "-" }
            </div>
            {it?.hint ? <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>{it.hint}</div> : null}
          </div>
        ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.7 }}>No metrics available.</div>
      )}
    </section>
  );
}

export default DealKpiCard;
