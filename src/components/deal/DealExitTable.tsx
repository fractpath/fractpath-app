'use client';

import React from "react";

export function DealExitTable(props: any) {
  const rows = props?.rows ?? props?.exitRows ?? props?.vm?.exitRows ?? [];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600 }}>Exit scenarios</h3>

      {Array.isArray(rows) && rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>Scenario</th>
                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>Home value</th>
                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>Owner proceeds</th>
                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>Buyer proceeds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, idx: number) => (
                <tr key={idx}>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {r?.label ?? r?.scenario ?? r?.name ?? ("Scenario " + String(idx + 1))}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {r?.homeValue ?? r?.home_value ?? r?.value ?? "-"}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {r?.ownerProceeds ?? r?.owner_proceeds ?? r?.owner ?? "-"}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {r?.buyerProceeds ?? r?.buyer_proceeds ?? r?.buyer ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.7 }}>No exit scenarios available.</div>
      )}
    </section>
  );
}

export default DealExitTable;
