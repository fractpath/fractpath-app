import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";
import { sendTemplateEmail } from "@/lib/email/sendTemplateEmail";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
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

  const otherPartyId = isBuyer
    ? (thread.owner_user_id ?? null)
    : thread.buyer_user_id;

  async function sendNotificationEmail(
    eventType: "accepted" | "rejected",
    templateEnvKey: string,
    templateAlias: string,
    subject: string,
  ) {
    if (!otherPartyId) return;
    try {
      const { data: otherUser } = await svc.auth.admin.getUserById(
        otherPartyId,
      );
      const otherEmail = otherUser?.user?.email;
      if (!otherEmail) return;

      const fromEmail =
        process.env.RESEND_FROM_EMAIL ?? "notifications@notify.fractpath.com";
      const templateId = process.env[templateEnvKey] ?? templateAlias;
      const APP = getAppBaseUrlServer();
      await sendTemplateEmail({
        to: otherEmail,
        from: fromEmail,
        subject,
        template: {
          id: templateId,
          variables: {
            ACTION_URL: `${APP}/deal/${resolvedDealId}`,
          },
        },
      });
    } catch (emailErr: any) {
      console.error(`decision_${eventType}_email_failed`, {
        dealId: resolvedDealId,
        otherPartyId,
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

    await sendNotificationEmail(
      "accepted",
      "RESEND_TEMPLATE_OFFER_ACCEPTED_ID",
      "fractpath-offer-accepted",
      "Your offer has been accepted — FractPath",
    );

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

  await sendNotificationEmail(
    "rejected",
    "RESEND_TEMPLATE_OFFER_REJECTED_ID",
    "fractpath-offer-rejected",
    "Update on your offer — FractPath",
  );

  return json(200, {
    ok: true,
    deal_id: resolvedDealId,
    thread_id: thread.id,
    status: "closed",
  });
}
