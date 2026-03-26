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

// Mirror of NormalizedPropertyProfile from providers/rentcast/types.ts.
type PersistedProfileDetails = {
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    formatted: string | null;
  } | null;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  lotSize: number | null;
  yearBuilt: number | null;
  ownerOccupied: boolean | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  apn: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
};

// Mirror of ProfileCandidate from the service — all fields needed for display
// and for sending to the confirm endpoint.
type ProfileCandidate = {
  id?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  formattedAddress?: string | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFootage?: number | null;
  lotSize?: number | null;
  yearBuilt?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  ownerOccupied?: boolean | null;
  lastSaleDate?: string | null;
  lastSalePrice?: number | null;
  county?: string | null;
  apn?: string | null;
};

type FailedRun = {
  error_message: string | null;
};

type Props = {
  propertyId: string;
  initialSummary: VendorSummary | null;
  lastProfileError: FailedRun | null;
  lastAvmError: FailedRun | null;
  initialProfileDetails: PersistedProfileDetails | null;
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
  initialProfileDetails,
}: Props) {
  const [profilePending, setProfilePending] = useState(false);
  const [avmPending, setAvmPending] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [avmErr, setAvmErr] = useState<string | null>(null);

  // Candidate state — populated when fetch-profile finds no exact canonical match.
  const [candidates, setCandidates] = useState<ProfileCandidate[] | null>(null);
  const [confirmingIdx, setConfirmingIdx] = useState<number | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  async function handleFetchProfile() {
    setProfileErr(null);
    setCandidates(null);
    setConfirmErr(null);
    setProfilePending(true);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/review/fetch-profile`,
        { method: "POST", credentials: "include" },
      );
      const body = await res.json();
      if (!body.ok) {
        setProfileErr(body.error ?? "Failed to fetch property data");
      } else if (body.matched === false) {
        // No exact canonical match — surface candidates for admin selection.
        setCandidates(body.candidates ?? []);
      } else {
        window.location.reload();
      }
    } catch {
      setProfileErr("Network error");
    } finally {
      setProfilePending(false);
    }
  }

  async function handleConfirmCandidate(candidate: ProfileCandidate, idx: number) {
    setConfirmErr(null);
    setConfirmingIdx(idx);
    try {
      const res = await fetch(
        `/api/admin/properties/${propertyId}/review/confirm-profile-candidate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidate }),
        },
      );
      const body = await res.json();
      if (!body.ok) {
        setConfirmErr(body.error ?? "Failed to confirm candidate");
      } else {
        window.location.reload();
      }
    } catch {
      setConfirmErr("Network error");
    } finally {
      setConfirmingIdx(null);
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
  const anyPending = profilePending || avmPending || confirmingIdx !== null;
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
            <div className="space-y-3">
              {/* Metadata row */}
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

              {/* Persisted subject-property details */}
              {initialProfileDetails ? (
                <div className="rounded-md border bg-muted/20 px-3 py-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Subject property
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground">Address</div>
                      <div className="font-medium">
                        {(initialProfileDetails.address?.formatted ??
                          [
                            initialProfileDetails.address?.line1,
                            initialProfileDetails.address?.city,
                            initialProfileDetails.address?.state,
                            initialProfileDetails.address?.zip,
                          ]
                            .filter(Boolean)
                            .join(", ")) ||
                          "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Property type</div>
                      <div className="font-medium capitalize">
                        {initialProfileDetails.propertyType?.replace(/_/g, " ") ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Year built</div>
                      <div className="font-medium">{initialProfileDetails.yearBuilt ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Beds</div>
                      <div className="font-medium">{initialProfileDetails.beds ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Baths</div>
                      <div className="font-medium">{initialProfileDetails.baths ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Square feet</div>
                      <div className="font-medium">
                        {initialProfileDetails.squareFeet != null
                          ? initialProfileDetails.squareFeet.toLocaleString()
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Lot size (sqft)</div>
                      <div className="font-medium">
                        {initialProfileDetails.lotSize != null
                          ? initialProfileDetails.lotSize.toLocaleString()
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic">
                  Subject property details not available.
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No property profile fetched yet.
            </div>
          )}

          {shownProfileErr && !candidates && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {shownProfileErr}
            </div>
          )}

          {/* Candidate selection — shown when fetch returns no exact canonical match */}
          {candidates !== null && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-3 space-y-3">
              <div className="text-xs font-medium text-yellow-900">
                No reliable match found — admin selection required
              </div>
              {candidates.length === 0 ? (
                <div className="text-xs text-yellow-800">
                  RentCast returned no candidate records for this address.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-yellow-800">
                    Select the correct property from the candidates below:
                  </div>
                  {candidates.map((c, idx) => (
                    <div
                      key={idx}
                      className="rounded border border-yellow-200 bg-white px-3 py-2 flex items-start justify-between gap-3"
                    >
                      <div className="text-xs space-y-0.5 min-w-0">
                        <div className="font-medium truncate">
                          {c.addressLine1 ?? "—"}
                        </div>
                        <div className="text-muted-foreground">
                          {[c.city, c.state, c.zipCode].filter(Boolean).join(", ") || "—"}
                        </div>
                        {(c.propertyType || c.bedrooms != null || c.squareFootage != null || c.yearBuilt != null) && (
                          <div className="text-muted-foreground">
                            {[
                              c.propertyType,
                              c.bedrooms != null ? `${c.bedrooms}bd` : null,
                              c.bathrooms != null ? `${c.bathrooms}ba` : null,
                              c.squareFootage != null ? `${c.squareFootage.toLocaleString()} sqft` : null,
                              c.yearBuilt != null ? `built ${c.yearBuilt}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleConfirmCandidate(c, idx)}
                        disabled={anyPending}
                        className="shrink-0 text-xs px-2.5 py-1 rounded border border-yellow-400 hover:bg-yellow-100 disabled:opacity-50 whitespace-nowrap"
                      >
                        {confirmingIdx === idx ? "Confirming…" : "Use this match"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {confirmErr && (
                <div className="text-xs text-red-700">{confirmErr}</div>
              )}
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
