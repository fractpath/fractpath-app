import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";
import { sendTemplateEmail } from "@/lib/email/sendTemplateEmail";
import { computeLtvPolicy } from "@/lib/ltvPolicy";

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

  const body = await req.json().catch(() => ({}));
  const decision =
    body?.decision === "accept" || body?.decision === "reject"
      ? (body.decision as "accept" | "reject")
      : null;

  if (!decision) {
    return json(400, { ok: false, error: "Invalid decision" });
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

  if (proposal.status !== "submitted") {
    return json(409, {
      ok: false,
      error: `Cannot ${decision} a proposal with status: ${proposal.status}`,
    });
  }

  if (proposal.created_by_user_id === user.id) {
    return json(403, {
      ok: false,
      error: "Cannot act on your own proposal. Wait for the other party.",
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

  if (!["pending_owner", "negotiating"].includes(thread.status)) {
    return json(409, {
      ok: false,
      error: `Invalid thread status: ${thread.status}`,
    });
  }

  const isBuyer = thread.buyer_user_id === user.id;
  const isThreadOwner = thread.owner_user_id === user.id;

  let isPropertyOwner = false;
  let propertyStatus: string | null = null;
  if (thread.property_id) {
    const { data: property } = await (svc.from("properties") as any)
      .select("id, status, owner_user_id")
      .eq("id", thread.property_id)
      .single();

    if (property) {
      isPropertyOwner = property.owner_user_id === user.id;
      propertyStatus = property.status ?? null;
    }
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

  const isOwnerSide = isPropertyOwner || isThreadOwner || isInvitedOwner;
  const hasAccess = isBuyer || isOwnerSide;

  if (!hasAccess) {
    return json(403, { ok: false, error: "Access denied" });
  }

  if (decision === "accept" && isOwnerSide && !isBuyer) {
    if (propertyStatus !== "verified") {
      return json(409, {
        ok: false,
        error: "Property verification required to accept",
      });
    }
  }

  let resolvedDealId: string | null = (thread.deal_id as string) ?? null;

  if (!resolvedDealId) {
    const { data: offerEv } = await (svc.from("deal_events") as any)
      .select("deal_id")
      .eq("event_type", "offer_submitted")
      .eq("payload->>proposal_id", proposalId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (offerEv?.deal_id) {
      resolvedDealId = offerEv.deal_id as string;
    }
  }

  if (!resolvedDealId) {
    return json(409, {
      ok: false,
      error: "Cannot resolve deal for this proposal",
    });
  }

  // --- LTV policy enforcement (accept only, owner side only) ---
  if (decision === "accept" && isOwnerSide && !isBuyer) {
    try {
      // Load property underwriting data
      let propUnderwriting: any = null;
      if (thread.property_id) {
        const { data: pu } = await (svc.from("properties") as any)
          .select(
            "has_secured_property_debt, secured_property_debt_amount, secured_debt_certified_at, secured_debt_last_verified_at, secured_debt_fresh_until, latest_verified_fmv, ltv_policy_ratio",
          )
          .eq("id", thread.property_id)
          .maybeSingle();
        propUnderwriting = pu ?? null;
      }

      // Load active proposal's terms to extract deal FMV / cash terms
      const { data: propTermsRow } = await (svc.from("deal_proposals") as any)
        .select("terms_snapshot")
        .eq("id", proposalId)
        .maybeSingle();

      let dealTerms: Record<string, unknown> | null = null;
      if (propTermsRow?.terms_snapshot) {
        const ts = propTermsRow.terms_snapshot;
        dealTerms = ts?.inputs?.deal_terms ?? ts?.deal_terms ?? null;
      }

      // Fall back to latest deal snapshot if proposal has no terms
      if (!dealTerms) {
        const { data: latestSnap } = await (svc.from("deal_snapshots") as any)
          .select("snapshot_json")
          .eq("deal_id", resolvedDealId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestSnap?.snapshot_json?.inputs?.deal_terms) {
          dealTerms = latestSnap.snapshot_json.inputs.deal_terms;
        }
      }

      const debtAmount =
        propUnderwriting?.has_secured_property_debt === true
          ? (propUnderwriting?.secured_property_debt_amount ?? 0)
          : 0;

      const ltvResult = computeLtvPolicy({
        proposed_deal_fmv: (dealTerms?.property_value as number | null) ?? null,
        upfront_payment: (dealTerms?.upfront_payment as number | null) ?? null,
        monthly_payment: (dealTerms?.monthly_payment as number | null) ?? null,
        number_of_payments:
          (dealTerms?.number_of_payments as number | null) ?? null,
        latest_verified_fmv: propUnderwriting?.latest_verified_fmv ?? null,
        secured_debt_amount: debtAmount,
        ltv_policy_ratio: propUnderwriting?.ltv_policy_ratio ?? 0.75,
        secured_debt_certified_at:
          propUnderwriting?.secured_debt_certified_at ?? null,
        secured_debt_last_verified_at:
          propUnderwriting?.secured_debt_last_verified_at ?? null,
        secured_debt_fresh_until:
          propUnderwriting?.secured_debt_fresh_until ?? null,
      });

      if (ltvResult.execution_readiness_blocked_by_underwriting) {
        console.log("OWNER_DECISION_LTV_BLOCK", {
          dealId: resolvedDealId,
          proposalId,
          reasons: ltvResult.block_reasons_internal,
          totalCommitted: ltvResult.total_committed_deal_cash,
          executableMax: ltvResult.executable_max_accessible_cash,
          debtIsStale: ltvResult.secured_debt_data_is_stale,
          verifiedFmvMissing: ltvResult.verified_fmv_required_for_execution,
        });

        return json(409, {
          ok: false,
          error:
            "This offer cannot be accepted at this time. Please review your property details or counter with revised terms.",
        });
      }
    } catch (ltvErr: any) {
      console.error("OWNER_DECISION_LTV_CHECK_ERROR", {
        dealId: resolvedDealId,
        error: ltvErr?.message,
      });
      // Fail-closed: block acceptance when policy check throws
      return json(500, {
        ok: false,
        error: "Policy check failed. Please try again.",
      });
    }
  }

  let canonicalHeader: Record<string, unknown> | undefined;
  try {
    const { data: headerEv } = await (svc.from("deal_events") as any)
      .select("payload")
      .eq("deal_id", resolvedDealId)
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
      "owner_decision_canonical_header_read_error",
      headerReadErr?.message,
    );
  }

  const propertyAddress = resolvePropertyAddress(canonicalHeader);
  const appBase = getAppBaseUrlServer();
  const actionUrl = `${appBase}/deal/${resolvedDealId}`;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? "notifications@notify.fractpath.com";

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
          dealId: resolvedDealId,
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
        dealId: resolvedDealId,
        userId: params.userId,
        error: emailErr?.message,
      });
    }
  }

  if (decision === "accept") {
    const { data: existing } = await (svc.from("deal_events") as any)
      .select("id")
      .eq("deal_id", resolvedDealId)
      .eq("event_type", "OFFER_ACCEPTED")
      .eq("payload->>proposal_id", proposalId)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { error: evInsErr } = await (svc.from("deal_events") as any).insert(
        {
          deal_id: resolvedDealId,
          event_type: "OFFER_ACCEPTED",
          payload: { thread_id: thread.id, proposal_id: proposalId },
          created_by: user.id,
        },
      );

      if (evInsErr) {
        return json(500, { ok: false, error: evInsErr.message });
      }
    }

    const { error: pUpdErr } = await (svc.from("deal_proposals") as any)
      .update({ status: "accepted" })
      .eq("id", proposalId)
      .eq("status", "submitted");

    if (pUpdErr) {
      console.error("accept_proposal_status_update_error", pUpdErr);
    }

    const threadPatch: Record<string, any> = { status: "accepted" };
    if (isOwnerSide && !thread.owner_user_id) {
      threadPatch.owner_user_id = user.id;
    }

    const { error: tUpdErr } = await (svc.from("deal_threads") as any)
      .update(threadPatch)
      .eq("id", thread.id)
      .in("status", ["pending_owner", "negotiating"]);

    if (tUpdErr) {
      return json(500, { ok: false, error: tUpdErr.message });
    }

    const finalOwnerUserId =
      (threadPatch.owner_user_id as string | undefined) ??
      (thread.owner_user_id as string | null);

    console.log("OWNER_DECISION_ACCEPT_EMAIL_ROUTING", {
      dealId: resolvedDealId,
      buyerUserId: thread.buyer_user_id,
      ownerUserId: finalOwnerUserId,
      buyerTemplate: process.env.RESEND_TEMPLATE_BUYER_OFFER_ACCEPTED_ID,
      homeownerTemplate: process.env.RESEND_TEMPLATE_HOMEOWNER_OFFER_ACCEPTED_ID,
      propertyAddress,
    });

    await Promise.all([
      sendEmailToUserId({
        userId: thread.buyer_user_id,
        templateId: process.env.RESEND_TEMPLATE_BUYER_OFFER_ACCEPTED_ID,
        fallbackTemplate: "fractpath-buyer-offer-accepted",
        subject: "Your FractPath offer was accepted",
        logKey: "buyer_offer_accepted_email",
      }),
      sendEmailToUserId({
        userId: finalOwnerUserId,
        templateId: process.env.RESEND_TEMPLATE_HOMEOWNER_OFFER_ACCEPTED_ID,
        fallbackTemplate: "fractpath-homeowner-offer-accepted",
        subject: "You accepted the FractPath offer",
        logKey: "homeowner_offer_accepted_email",
      }),
    ]);

    return json(200, {
      ok: true,
      deal_id: resolvedDealId,
      thread_id: thread.id,
      status: "accepted",
    });
  }

  const { data: existingReject } = await (svc.from("deal_events") as any)
    .select("id")
    .eq("deal_id", resolvedDealId)
    .eq("event_type", "OFFER_REJECTED")
    .eq("payload->>proposal_id", proposalId)
    .limit(1)
    .maybeSingle();

  if (!existingReject) {
    const { error: evInsErr } = await (svc.from("deal_events") as any).insert({
      deal_id: resolvedDealId,
      event_type: "OFFER_REJECTED",
      payload: { thread_id: thread.id, proposal_id: proposalId },
      created_by: user.id,
    });

    if (evInsErr) {
      return json(500, { ok: false, error: evInsErr.message });
    }
  }

  const { error: pUpdErr } = await (svc.from("deal_proposals") as any)
    .update({ status: "rejected" })
    .eq("id", proposalId)
    .eq("status", "submitted");

  if (pUpdErr) {
    console.error("reject_proposal_status_update_error", pUpdErr);
  }

  const threadPatch: Record<string, any> = { status: "closed" };
  if (isOwnerSide && !thread.owner_user_id) {
    threadPatch.owner_user_id = user.id;
  }

  const { error: tUpdErr } = await (svc.from("deal_threads") as any)
    .update(threadPatch)
    .eq("id", thread.id)
    .in("status", ["pending_owner", "negotiating"]);

  if (tUpdErr) {
    return json(500, { ok: false, error: tUpdErr.message });
  }

  const finalOwnerUserId =
    (threadPatch.owner_user_id as string | undefined) ??
    (thread.owner_user_id as string | null);

  console.log("OWNER_DECISION_REJECT_EMAIL_ROUTING", {
    dealId: resolvedDealId,
    buyerUserId: thread.buyer_user_id,
    ownerUserId: finalOwnerUserId,
    buyerTemplate: process.env.RESEND_TEMPLATE_BUYER_OFFER_REJECTED_ID,
    homeownerTemplate: process.env.RESEND_TEMPLATE_HOMEOWNER_OFFER_REJECTED_ID,
    propertyAddress,
  });

  await Promise.all([
    sendEmailToUserId({
      userId: thread.buyer_user_id,
      templateId: process.env.RESEND_TEMPLATE_BUYER_OFFER_REJECTED_ID,
      fallbackTemplate: "fractpath-buyer-offer-rejected",
      subject: "Your FractPath offer was declined",
      logKey: "buyer_offer_rejected_email",
    }),
    sendEmailToUserId({
      userId: finalOwnerUserId,
      templateId: process.env.RESEND_TEMPLATE_HOMEOWNER_OFFER_REJECTED_ID,
      fallbackTemplate: "fractpath-homeowner-offer-rejected",
      subject: "You declined the FractPath offer",
      logKey: "homeowner_offer_rejected_email",
    }),
  ]);

  return json(200, {
    ok: true,
    deal_id: resolvedDealId,
    thread_id: thread.id,
    status: "closed",
  });
}