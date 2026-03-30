import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";
import { sendTemplateEmail } from "@/lib/email/sendTemplateEmail";
import { computeDealAdapter as computeDeal } from "@/lib/computeAdapter";
import { ensureScenario } from "@/lib/defaultScenario";
import { CONTRACT_VERSION, SCHEMA_VERSION } from "@/lib/contractVersion";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

function resolvePropertyAddress(
  canonicalHeader: Record<string, unknown> | undefined,
): string {
  const displayAddress =
    typeof canonicalHeader?.display_address === "string"
      ? canonicalHeader.display_address.trim()
      : "";

  return displayAddress || "this property";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ proposalId: string }> },
) {
  const { proposalId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json(401, { ok: false, error: "Unauthorized" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const termsSnapshot = body?.terms_snapshot;
  if (!termsSnapshot || typeof termsSnapshot !== "object") {
    return json(422, { ok: false, error: "terms_snapshot required" });
  }

  const rawInputs =
    termsSnapshot?.inputs && typeof termsSnapshot.inputs === "object"
      ? termsSnapshot.inputs
      : {
          deal_terms:
            termsSnapshot?.deal_terms &&
            typeof termsSnapshot.deal_terms === "object"
              ? termsSnapshot.deal_terms
              : null,
          scenario:
            termsSnapshot?.scenario &&
            typeof termsSnapshot.scenario === "object"
              ? termsSnapshot.scenario
              : null,
        };

  const normalizedInputs = ensureScenario(rawInputs);

  if (
    !normalizedInputs?.deal_terms ||
    typeof normalizedInputs.deal_terms !== "object"
  ) {
    return json(422, {
      ok: false,
      error: "terms_snapshot must include deal_terms",
    });
  }

  const computeResult = await computeDeal(normalizedInputs);
  if (!computeResult.ok) {
    return json(500, {
      ok: false,
      error: computeResult.error ?? "Failed to compute counter snapshot",
    });
  }

  const svc = createServiceClient();

  const { data: proposal, error: propErr } = await (
    svc.from("deal_proposals") as any
  )
    .select("id, thread_id, status, created_by_user_id")
    .eq("id", proposalId)
    .single();

  if (propErr || !proposal) {
    return json(404, { ok: false, error: "Proposal not found" });
  }

  // Allow countering an accepted proposal when the deal is live-ineligible (void).
  // Standard path: proposal.status === "submitted". Void path: proposal.status === "accepted".
  const isVoidIneligibleCounter = proposal.status === "accepted";

  if (proposal.status !== "submitted" && !isVoidIneligibleCounter) {
    return json(409, {
      ok: false,
      error: `Cannot counter a proposal with status: ${proposal.status}`,
    });
  }

  // For void counters only: skip the "can't counter your own proposal" guard.
  // In the void/ineligible case the deal is non-executable regardless of who originally
  // sent the accepted proposal, and the owner must be able to restart the negotiation.
  if (!isVoidIneligibleCounter && proposal.created_by_user_id === user.id) {
    return json(403, {
      ok: false,
      error:
        "Cannot counter your own proposal. Wait for the other party to respond.",
    });
  }

  const { data: thread, error: threadErr } = await (
    svc.from("deal_threads") as any
  )
    .select("id, status, property_id, buyer_user_id, owner_user_id, deal_id")
    .eq("id", proposal.thread_id)
    .single();

  if (threadErr || !thread) {
    return json(404, { ok: false, error: "Thread not found" });
  }

  const isVoidAcceptedThread = thread.status === "accepted";

  if (!["pending_owner", "negotiating"].includes(thread.status) && !isVoidAcceptedThread) {
    return json(409, {
      ok: false,
      error: `Cannot counter in thread status: ${thread.status}`,
    });
  }

  // Void-ineligible guard: verify the deal is actually ineligible before allowing
  // either bypass. This prevents the accepted-proposal path from being abused on
  // healthy deals where the thread happened to reach accepted status normally.
  if (isVoidIneligibleCounter || isVoidAcceptedThread) {
    const { data: voidCheckDeal } = await (svc.from("deals") as any)
      .select("triage_status")
      .eq("id", thread.deal_id)
      .maybeSingle();

    if (voidCheckDeal?.triage_status !== "ineligible") {
      return json(409, {
        ok: false,
        error: `Cannot counter a proposal with status: ${proposal.status} — deal is not ineligible`,
      });
    }
  }

  const isBuyer = thread.buyer_user_id === user.id;
  const isThreadOwner = thread.owner_user_id === user.id;

  let isPropertyOwner = false;
  if (thread.property_id) {
    const { data: property } = await (svc.from("properties") as any)
      .select("owner_user_id")
      .eq("id", thread.property_id)
      .maybeSingle();
    isPropertyOwner = !!property && property.owner_user_id === user.id;
  }

  let isInvitedOwner = false;
  if (!isBuyer && !isThreadOwner && !isPropertyOwner && user.email) {
    const { data: invite } = await (svc.from("thread_invites") as any)
      .select("id, intended_role, expires_at")
      .eq("thread_id", thread.id)
      .eq("invitee_email", user.email.toLowerCase())
      .eq("intended_role", "owner")
      .limit(1)
      .maybeSingle();

    if (invite) {
      const notExpired =
        !invite.expires_at || new Date(invite.expires_at) > new Date();
      isInvitedOwner = notExpired;
    }
  }

  const hasAccess =
    isBuyer || isThreadOwner || isPropertyOwner || isInvitedOwner;
  if (!hasAccess) {
    return json(403, { ok: false, error: "Access denied" });
  }

  const dealId = thread.deal_id as string;

  let canonicalHeader: Record<string, unknown> | undefined;
  try {
    const { data: headerEv } = await (svc.from("deal_events") as any)
      .select("payload")
      .eq("deal_id", dealId)
      .eq("event_type", "DEAL_HEADER_UPDATED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (headerEv?.payload && typeof headerEv.payload === "object") {
      const p = headerEv.payload;
      if (p.property_id || p.display_address || p.title) {
        canonicalHeader = {
          title: p.title ?? null,
          property_id: p.property_id ?? null,
          display_address: p.display_address ?? null,
          property_status: p.property_status ?? null,
          ownership_status: p.ownership_status ?? null,
        };
      }
    }
  } catch (headerReadErr: any) {
    console.error(
      "counter_canonical_header_read_error",
      headerReadErr?.message,
    );
  }

  const computedAt = new Date().toISOString();
  const fullSnapshot: Record<string, unknown> = {
    contract_version: CONTRACT_VERSION,
    schema_version: SCHEMA_VERSION,
    inputs: normalizedInputs,
    outputs: { results: computeResult.result.results },
    computed_at: computedAt,
    computed_by: user.id,
    compute_version: computeResult.result.compute_version,
  };

  if (canonicalHeader) {
    fullSnapshot.meta = { header: canonicalHeader };
  }

  const { data: newProposal, error: newPropErr } = await (
    svc.from("deal_proposals") as any
  )
    .insert({
      thread_id: thread.id,
      created_by_user_id: user.id,
      status: "submitted",
      terms_snapshot: fullSnapshot,
    })
    .select("id")
    .single();

  if (newPropErr) {
    return json(500, { ok: false, error: newPropErr.message });
  }

  const { error: oldUpdErr } = await (svc.from("deal_proposals") as any)
    .update({ status: "withdrawn" })
    .eq("id", proposalId)
    .in("status", ["submitted", "accepted"]);

  if (oldUpdErr) {
    console.error("counter_old_proposal_update_error", oldUpdErr);
  }

  await (svc.from("deal_threads") as any)
    .update({
      current_proposal_id: newProposal.id,
      status: "negotiating",
    })
    .eq("id", thread.id);

  if (!thread.owner_user_id && (isPropertyOwner || isInvitedOwner)) {
    await (svc.from("deal_threads") as any)
      .update({ owner_user_id: user.id })
      .eq("id", thread.id)
      .is("owner_user_id", null);
  }

  await (svc.from("deal_events") as any).insert({
    deal_id: dealId,
    event_type: "COUNTER_OFFER_SENT",
    payload: {
      thread_id: thread.id,
      old_proposal_id: proposalId,
      new_proposal_id: newProposal.id,
      counter_by: user.id,
    },
    created_by: user.id,
  });

  const propertyAddress = resolvePropertyAddress(canonicalHeader);
  const appBase = getAppBaseUrlServer();
  const actionUrl = `${appBase}/deal/${dealId}`;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? "notifications@notify.fractpath.com";

  const finalOwnerUserId =
    (isPropertyOwner || isInvitedOwner) && !thread.owner_user_id
      ? user.id
      : (thread.owner_user_id as string | null);

  async function sendEmailToUserId(params: {
    userId: string | null | undefined;
    templateId: string | undefined;
    fallbackTemplate: string;
    subject: string;
    logKey: string;
  }) {
    if (!params.userId) return;

    try {
      const { data: targetUser } = await svc.auth.admin.getUserById(
        params.userId,
      );
      const targetEmail = normalizeEmail(targetUser?.user?.email);

      if (!targetEmail) {
        console.warn(`${params.logKey}_missing_email`, {
          dealId,
          userId: params.userId,
        });
        return;
      }

      await sendTemplateEmail({
        to: targetEmail,
        from: fromEmail,
        subject: params.subject,
        template: {
          id: params.templateId ?? params.fallbackTemplate,
          variables: {
            property_address: propertyAddress,
            ACTION_URL: actionUrl,
          },
        },
      });
    } catch (emailErr: any) {
      console.error(`${params.logKey}_failed`, {
        dealId,
        userId: params.userId,
        error: emailErr?.message,
      });
    }
  }

  console.log("COUNTER_EMAIL_ROUTING", {
    dealId,
    buyerUserId: thread.buyer_user_id,
    ownerUserId: finalOwnerUserId,
    buyerTemplate: process.env.RESEND_TEMPLATE_BUYER_OFFER_COUNTERED_ID,
    homeownerTemplate: process.env.RESEND_TEMPLATE_HOMEOWNER_OFFER_COUNTERED_ID,
    propertyAddress,
    counteredBy: user.id,
  });

  await Promise.all([
    sendEmailToUserId({
      userId: thread.buyer_user_id,
      templateId: process.env.RESEND_TEMPLATE_BUYER_OFFER_COUNTERED_ID,
      fallbackTemplate: "fractpath-buyer-offer-countered",
      subject: "A counteroffer is ready for review",
      logKey: "buyer_offer_countered_email",
    }),
    sendEmailToUserId({
      userId: finalOwnerUserId,
      templateId: process.env.RESEND_TEMPLATE_HOMEOWNER_OFFER_COUNTERED_ID,
      fallbackTemplate: "fractpath-homeowner-offer-countered",
      subject: "Your counteroffer was sent",
      logKey: "homeowner_offer_countered_email",
    }),
  ]);

  return json(200, {
    ok: true,
    proposal_id: newProposal.id,
    old_proposal_id: proposalId,
    thread_id: thread.id,
    deal_id: dealId,
  });
}
