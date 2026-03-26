"use client";

import { useState } from "react";

type VendorSummary = {
  profile_provider: string | null;
  profile_fetched_at: string | null;
  profile_expires_at: string | null;
  fmv_provider: string | null;
  fmv_amount: number | null;
  fmv_low: number | null;
  fmv_high: number | null;
  fmv_confidence: string | null;
  fmv_fetched_at: string | null;
  fmv_expires_at: string | null;
};

type FailedRun = {
  error_message: string | null;
};

type Props = {
  propertyId: string;
  initialSummary: VendorSummary | null;
  lastProfileError: FailedRun | null;
  lastAvmError: FailedRun | null;
};

function fmt(val: string | null | undefined): string {
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

export function AdminVendorReviewPanel({
  propertyId,
  initialSummary,
  lastProfileError,
  lastAvmError,
}: Props) {
  const [profilePending, setProfilePending] = useState(false);
  const [avmPending, setAvmPending] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [avmErr, setAvmErr] = useState<string | null>(null);

  async function handleFetchProfile() {
    setProfileErr(null);
    setProfilePending(true);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/review/fetch-profile`,
        { method: "POST", credentials: "include" },
      );
      const body = await res.json();
      if (!body.ok) {
        setProfileErr(body.error ?? "Failed to fetch property data");
      } else {
        window.location.reload();
      }
    } catch {
      setProfileErr("Network error");
    } finally {
      setProfilePending(false);
    }
  }

  async function handleFetchAvm() {
    setAvmErr(null);
    setAvmPending(true);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/review/fetch-avm`,
        { method: "POST", credentials: "include" },
      );
      const body = await res.json();
      if (!body.ok) {
        setAvmErr(body.error ?? "Failed to fetch AVM");
      } else {
        window.location.reload();
      }
    } catch {
      setAvmErr("Network error");
    } finally {
      setAvmPending(false);
    }
  }

  const s = initialSummary;
  const anyPending = profilePending || avmPending;
  const shownProfileErr = profileErr ?? lastProfileError?.error_message ?? null;
  const shownAvmErr = avmErr ?? lastAvmError?.error_message ?? null;

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
        Vendor review data
      </div>
      <div className="p-4 space-y-5 text-sm">

        {/* Property profile */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Property profile
          </div>
          {s?.profile_provider ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <div className="text-xs text-muted-foreground">Provider</div>
                <div className="font-medium capitalize">{s.profile_provider}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Fetched</div>
                <div className="font-medium">{fmt(s.profile_fetched_at)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Expires</div>
                <div className="font-medium">{fmt(s.profile_expires_at)}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No property profile fetched yet.
            </div>
          )}
          {shownProfileErr && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {shownProfileErr}
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={handleFetchProfile}
              disabled={anyPending}
              className="text-xs px-3 py-1.5 rounded border hover:bg-muted disabled:opacity-50"
            >
              {profilePending ? "Fetching…" : "Fetch property data"}
            </button>
          </div>
        </div>

        {/* AVM */}
        <div className="border-t pt-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            AVM (automated valuation)
          </div>
          {s?.fmv_provider ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <div className="text-xs text-muted-foreground">Provider</div>
                <div className="font-medium capitalize">{s.fmv_provider}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">FMV estimate</div>
                <div className="font-medium">{fmtCurrency(s.fmv_amount)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Low / High</div>
                <div className="font-medium">
                  {fmtCurrency(s.fmv_low)} / {fmtCurrency(s.fmv_high)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Confidence</div>
                <div className="font-medium capitalize">
                  {s.fmv_confidence ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Fetched</div>
                <div className="font-medium">{fmt(s.fmv_fetched_at)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Expires</div>
                <div className="font-medium">{fmt(s.fmv_expires_at)}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No AVM data fetched yet.
            </div>
          )}
          {shownAvmErr && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {shownAvmErr}
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={handleFetchAvm}
              disabled={anyPending}
              className="text-xs px-3 py-1.5 rounded border hover:bg-muted disabled:opacity-50"
            >
              {avmPending ? "Fetching…" : "Fetch AVM"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
