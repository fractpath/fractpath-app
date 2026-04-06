"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MashvisorNormalizedSummary } from "@/lib/mashvisor/types";

type LastRun = {
  status: string;
  requested_at: string;
  normalized_payload: MashvisorNormalizedSummary | null;
};

type Props = {
  propertyId: string;
  hasAddress: boolean;
  lastRun: LastRun | null;
};

function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function AdminMashvisorPanel({ propertyId, hasAddress, lastRun }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<LastRun | null>(lastRun);

  const hasData = latestRun?.status === "completed" && latestRun.normalized_payload != null;
  const summary = hasData ? latestRun!.normalized_payload! : null;

  const buttonLabel = hasData ? "Refresh Enrichment Data" : "Fetch Enrichment Data";

  async function handleFetch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/review/fetch-mashvisor`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Fetch failed");
      } else {
        setLatestRun({
          status: "completed",
          requested_at: json.summary.fetched_at,
          normalized_payload: json.summary,
        });
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b flex items-center justify-between">
        <span>Property enrichment data</span>
        {latestRun?.requested_at && (
          <span className="text-xs text-muted-foreground font-normal">
            Last fetched: {fmtDate(latestRun.requested_at)}
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Retrieves third-party property data for review. This is a manual admin action and does
          not affect owner-facing surfaces or the verification workflow.
        </p>

        {!hasAddress && (
          <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            Property does not have a complete address (address line, city, and state required).
            Enrichment fetch is unavailable until address data is present.
          </div>
        )}

        {hasAddress && (
          <button
            type="button"
            onClick={handleFetch}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {loading && (
              <svg
                className="animate-spin h-3.5 w-3.5 text-muted-foreground"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
            )}
            {loading ? "Fetching…" : buttonLabel}
          </button>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        {latestRun?.status === "failed" && !error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            Last fetch failed. Try again or check address data.
          </div>
        )}

        {summary && (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Property data summary
            </div>
            <SummaryRow
              label="Property ID"
              value={summary.mashvisor_property_id ?? "—"}
            />
            <SummaryRow
              label="Address (provider)"
              value={summary.address ?? "—"}
            />
            <SummaryRow
              label="Property type"
              value={summary.property_type ?? "—"}
            />
            <SummaryRow
              label="Beds"
              value={summary.beds != null ? String(summary.beds) : "—"}
            />
            <SummaryRow
              label="Baths"
              value={summary.baths != null ? String(summary.baths) : "—"}
            />
            <SummaryRow
              label="Sq ft"
              value={summary.sqft != null ? summary.sqft.toLocaleString() : "—"}
            />
            <SummaryRow
              label="Value estimate"
              value={fmtCurrency(summary.value_estimate)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
