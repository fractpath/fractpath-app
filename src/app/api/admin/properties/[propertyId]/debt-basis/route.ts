import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveWorkflowContacts,
  sendWorkflowEmail,
  formatPropertyAddress,
  propertyActionUrl,
} from "@/lib/workflow/sendWorkflowEmail";

// Actions that constitute a material debt-basis decision (notify owner).
// Informational/pending actions (request_*,  mark_attom_stale, escalate_title) do not notify.
const MATERIAL_DEBT_ACTIONS = new Set(["adopt_owner_verified", "keep_attom"]);

// ─── Policy actions for admin debt basis management ───────────────────────────
// FractPath policy: debt discrepancy is a review signal, not an auto-blocker.
// Admin can request documentation, adopt owner-verified debt, escalate to title,
// or confirm the ATTOM basis.  All actions are auditable.

type DebtBasisAction =
  | "request_mortgage_docs"
  | "request_heloc_docs"
  | "mark_attom_stale"
  | "adopt_owner_verified"
  | "escalate_title"
  | "keep_attom";

const VALID_ACTIONS = new Set<DebtBasisAction>([
  "request_mortgage_docs",
  "request_heloc_docs",
  "mark_attom_stale",
  "adopt_owner_verified",
  "escalate_title",
  "keep_attom",
]);

const ACTION_BASIS_MAP: Partial<Record<DebtBasisAction, string>> = {
  adopt_owner_verified: "owner_verified_docs",
  keep_attom: "attom_estimated",
  escalate_title: "attom_estimated",
};

type Ctx = { params: Promise<{ propertyId: string }> };

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details: details ?? null }, { status });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return jsonError(admin.error, admin.status, { email: admin.email });
  }

  const { propertyId } = await ctx.params;

  let body: {
    action?: string;
    reason?: string | null;
    owner_verified_amount?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  const action = body?.action as DebtBasisAction | undefined;
  if (!action || !VALID_ACTIONS.has(action)) {
    return jsonError("Invalid action", 422, {
      received: action,
      allowed: [...VALID_ACTIONS],
    });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

  // "adopt_owner_verified" requires a valid amount.
  let ownerVerifiedAmount: number | null = null;
  if (action === "adopt_owner_verified") {
    const raw = body.owner_verified_amount;
    ownerVerifiedAmount = typeof raw === "number" && isFinite(raw) && raw >= 0 ? raw : null;
    if (ownerVerifiedAmount === null) {
      return jsonError("adopt_owner_verified requires a valid owner_verified_amount", 422, {
        received: raw,
      });
    }
  }

  const svc = createServiceClient();

  const { data: prop, error: fetchErr } = await (svc.from("properties") as any)
    .select("id, address_line1, city, state, postal_code")
    .eq("id", propertyId)
    .maybeSingle();

  if (fetchErr || !prop) {
    return jsonError("Property not found", 404, fetchErr ?? null);
  }

  const now = new Date().toISOString();

  // Determine what to write to properties table (basis + amount if adopting owner-verified).
  const update: Record<string, unknown> = {
    secured_debt_basis_reason: reason,
    secured_debt_basis_updated_at: now,
  };

  const newBasis = ACTION_BASIS_MAP[action] ?? null;
  if (newBasis) {
    update.current_controlling_secured_debt_basis = newBasis;
    if (action === "adopt_owner_verified" && ownerVerifiedAmount != null) {
      update.current_controlling_secured_debt_amount = ownerVerifiedAmount;
    }
  }

  const { error: updateErr } = await (svc.from("properties") as any)
    .update(update)
    .eq("id", propertyId);

  if (updateErr) {
    console.error("DEBT_BASIS_UPDATE_FAILED", { propertyId, action, updateErr });
    return jsonError("Failed to update debt basis", 500, updateErr);
  }

  // Log to property_status_audit for full audit trail.
  const auditLabel: Record<DebtBasisAction, string> = {
    request_mortgage_docs: "Admin requested updated mortgage documents from owner",
    request_heloc_docs: "Admin requested HELOC / second-lien documents from owner",
    mark_attom_stale: "Admin flagged ATTOM estimated debt balance as stale",
    adopt_owner_verified: `Admin adopted owner-verified debt basis${ownerVerifiedAmount != null ? ` ($${Math.round(ownerVerifiedAmount).toLocaleString()})` : ""}`,
    escalate_title: "Admin escalated to title review for debt confirmation",
    keep_attom: "Admin confirmed ATTOM estimated loan balance as controlling debt basis",
  };

  await (svc.from("property_status_audit") as any).insert({
    property_id: propertyId,
    changed_by: admin.email ?? "admin",
    change_type: "DEBT_BASIS_ACTION",
    new_value: action,
    notes: [auditLabel[action], reason].filter(Boolean).join(" — ") || null,
  });

  // ── Notify owner on material debt basis decisions (non-blocking) ──────────
  // Only `adopt_owner_verified` and `keep_attom` represent a resolved basis —
  // informational / pending actions (request_*, mark_attom_stale, escalate_title)
  // do not trigger a notification.
  // Buyers are NOT notified for debt-basis updates (provider details must stay internal).
  if (MATERIAL_DEBT_ACTIONS.has(action)) {
    void (async () => {
      try {
        const address = formatPropertyAddress(prop);
        const contacts = await resolveWorkflowContacts(svc, { propertyId });

        if (contacts.owner) {
          const r = await sendWorkflowEmail({
            audience: "owner",
            eventKey: "PROPERTY_DEBT_VERIFICATION_UPDATED",
            to: contacts.owner.email,
            recipientName: contacts.owner.name,
            propertyAddress: address,
            actionUrl: propertyActionUrl(propertyId),
          });
          console.log("DEBT_BASIS_OWNER_NOTIFICATION", {
            propertyId,
            action,
            ok: r.ok,
            error: r.error ?? null,
          });
        }
      } catch (err) {
        console.error("DEBT_BASIS_NOTIFICATION_ERROR", { propertyId, action, err });
      }
    })();
  }

  return NextResponse.json(
    {
      ok: true,
      propertyId,
      action,
      current_controlling_secured_debt_basis: newBasis ?? undefined,
      current_controlling_secured_debt_amount: ownerVerifiedAmount ?? undefined,
    },
    { status: 200 },
  );
}
