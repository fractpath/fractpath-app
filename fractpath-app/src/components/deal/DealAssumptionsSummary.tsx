'use client';

import React from "react";

export function DealAssumptionsSummary(props: any) {
  const items =
    props?.items ??
    props?.assumptions ??
    props?.vm?.assumptions ??
    props?.vm?.assumptionItems ??
    [];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600 }}>Assumptions</h3>

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
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {it?.label ?? it?.name ?? it?.key ?? ("Assumption " + String(idx + 1))}
              </div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                {it?.value ?? it?.display ?? it?.description ?? "-"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.7 }}>No assumptions available.</div>
      )}
    </section>
  );
}

export default DealAssumptionsSummary;
