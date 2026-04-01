"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type DebtBasisAction =
  | "request_mortgage_docs"
  | "request_heloc_docs"
  | "mark_attom_stale"
  | "adopt_owner_verified"
  | "escalate_title"
  | "keep_attom";

const ACTION_META: Record<
  DebtBasisAction,
  { label: string; description: string; tone: "neutral" | "info" | "warning" | "success" }
> = {
  request_mortgage_docs: {
    label: "Request updated mortgage documents",
    description:
      "Sends a documentation request to the owner for current mortgage statement(s). Admin reviews on receipt.",
    tone: "neutral",
  },
  request_heloc_docs: {
    label: "Request HELOC / second-lien documents",
    description:
      "Sends a documentation request for HELOC or second-lien statement(s). Admin reviews on receipt.",
    tone: "neutral",
  },
  mark_attom_stale: {
    label: "Mark ATTOM debt estimate as stale",
    description:
      "Flags the ATTOM estimated loan balance as unreliable for this property. Does not change the controlling basis.",
    tone: "warning",
  },
  adopt_owner_verified: {
    label: "Adopt owner-verified debt amount",
    description:
      "Sets the controlling secured debt basis to the owner-provided and admin-reviewed amount. Requires a reason and optional evidence links.",
    tone: "success",
  },
  escalate_title: {
    label: "Escalate to title review",
    description:
      "Flags this property for title review to confirm the current secured debt balance. Title findings supersede all other sources.",
    tone: "warning",
  },
  keep_attom: {
    label: "Keep ATTOM debt basis",
    description:
      "Confirms the ATTOM estimated loan balance as the current controlling basis. Clears any pending debt-review flag.",
    tone: "neutral",
  },
};

const BASIS_LABEL: Record<string, string> = {
  attom_estimated: "ATTOM estimated",
  owner_verified_docs: "Owner-verified documentation",
  admin_adjusted: "Admin-adjusted",
  title_confirmed: "Title-confirmed",
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  propertyId: string;
  attomEstimatedDebt: number | null;
  ownerDeclaredDebt: number | null;
  debtDiscrepancySeverity: string | null;
  debtDiscrepancyDelta: number | null;
  currentControllingDebtBasis: string | null;
  currentControllingDebtAmount: number | null;
  debtBasisReason: string | null;
  debtBasisUpdatedAt: string | null;
};

function fmt(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

const SEVERITY_CLS: Record<string, string> = {
  none: "bg-green-100 text-green-800",
  minor: "bg-yellow-100 text-yellow-800",
  significant: "bg-orange-100 text-orange-800",
  blocking: "bg-red-100 text-red-800",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminDebtBasisPanel({
  propertyId,
  attomEstimatedDebt,
  ownerDeclaredDebt,
  debtDiscrepancySeverity,
  debtDiscrepancyDelta,
  currentControllingDebtBasis,
  currentControllingDebtAmount,
  debtBasisReason,
  debtBasisUpdatedAt,
}: Props) {
  const router = useRouter();
  const [selectedAction, setSelectedAction] = useState<DebtBasisAction>("keep_attom");
  const [ownerVerifiedAmount, setOwnerVerifiedAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleApply() {
    setErr(null);
    setSuccess(null);
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        action: selectedAction,
        reason: reason.trim() || null,
      };
      if (selectedAction === "adopt_owner_verified") {
        const amt = Number(ownerVerifiedAmount);
        if (!ownerVerifiedAmount || isNaN(amt) || amt <= 0) {
          setErr("Enter a valid owner-verified debt amount.");
          setPending(false);
          return;
        }
        body.owner_verified_amount = amt;
      }
      const res = await fetch(
        `/api/admin/properties/${propertyId}/debt-basis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error ?? `Request failed (${res.status})`);
      } else {
        setSuccess(ACTION_META[selectedAction].label + " — applied.");
        router.refresh();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  const meta = ACTION_META[selectedAction];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-md border px-4 py-3 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Debt basis summary
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <div className="text-muted-foreground">ATTOM estimated total loan balance</div>
          <div className="font-medium font-mono">{fmt(attomEstimatedDebt)}</div>

          <div className="text-muted-foreground">Owner-declared debt</div>
          <div className="font-medium font-mono">{fmt(ownerDeclaredDebt)}</div>

          {debtDiscrepancySeverity && debtDiscrepancySeverity !== "none" && (
            <>
              <div className="text-muted-foreground">Discrepancy</div>
              <div className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CLS[debtDiscrepancySeverity] ?? "bg-gray-100 text-gray-700"}`}>
                  {debtDiscrepancySeverity}
                </span>
                {debtDiscrepancyDelta != null && (
                  <span className="font-mono text-muted-foreground">
                    {debtDiscrepancyDelta > 0 ? "+" : ""}
                    {fmt(debtDiscrepancyDelta)} vs owner
                  </span>
                )}
              </div>
            </>
          )}

          <div className="text-muted-foreground">Current controlling basis</div>
          <div className="font-medium">
            {currentControllingDebtBasis
              ? (BASIS_LABEL[currentControllingDebtBasis] ?? currentControllingDebtBasis)
              : <span className="italic text-muted-foreground">Not established</span>}
          </div>

          {currentControllingDebtAmount != null && (
            <>
              <div className="text-muted-foreground">Controlling debt amount</div>
              <div className="font-medium font-mono">{fmt(currentControllingDebtAmount)}</div>
            </>
          )}

          {debtBasisReason && (
            <>
              <div className="text-muted-foreground">Basis reason</div>
              <div className="text-foreground">{debtBasisReason}</div>
            </>
          )}

          {debtBasisUpdatedAt && (
            <>
              <div className="text-muted-foreground">Last updated</div>
              <div>{new Date(debtBasisUpdatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>
            </>
          )}
        </div>

        {debtDiscrepancySeverity && debtDiscrepancySeverity !== "none" && (
          <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800">
            <span className="font-semibold">Debt discrepancy — admin review signal.</span>{" "}
            Debt discrepancy does not automatically block deal eligibility. Use the actions below to
            request documentation, adopt owner-verified debt, or confirm the ATTOM basis.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Debt basis actions
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0">Action</label>
          <select
            className="text-sm border rounded px-2 py-1 bg-background"
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value as DebtBasisAction);
              setErr(null);
              setSuccess(null);
            }}
            disabled={pending}
          >
            {(Object.keys(ACTION_META) as DebtBasisAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_META[a].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleApply}
            disabled={pending}
            className={`text-xs px-3 py-1 rounded border disabled:opacity-50 ${
              meta.tone === "warning"
                ? "border-orange-300 text-orange-700 hover:bg-orange-50"
                : meta.tone === "success"
                  ? "border-green-300 text-green-700 hover:bg-green-50"
                  : meta.tone === "info"
                    ? "border-blue-300 text-blue-700 hover:bg-blue-50"
                    : "hover:bg-muted"
            }`}
          >
            {pending ? "Applying…" : "Apply"}
          </button>
        </div>

        <p className="text-xs text-muted-foreground">{meta.description}</p>

        {selectedAction === "adopt_owner_verified" && (
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground">
              Owner-verified debt amount (required)
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              placeholder="Verified debt amount ($)"
              value={ownerVerifiedAmount}
              onChange={(e) => setOwnerVerifiedAmount(e.target.value)}
              disabled={pending}
              className="text-sm border rounded px-2 py-1 w-48 font-mono"
            />
          </div>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Admin reason / note (logged to property audit trail)
          </label>
          <textarea
            className="w-full text-sm border rounded p-2 min-h-[56px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for this debt basis action…"
            disabled={pending}
          />
        </div>

        {err && <div className="text-xs text-red-600">{err}</div>}
        {success && <div className="text-xs text-green-700">{success}</div>}
      </div>
    </div>
  );
}
