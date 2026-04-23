import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendWorkflowEmail } from "@/lib/workflow/sendWorkflowEmail";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return json(401, { error: "Unauthorized" });

  const email = user.email?.toLowerCase() ?? null;
  if (!email) return json(400, { error: "User has no email" });

  const svc = createServiceClient();

  // 1) Load thread — we need deal_id and buyer_user_id to notify the submitter.
  const { data: thread, error: tErr } = await (svc.from("deal_threads") as any)
    .select("id, deal_id, property_id, buyer_user_id, owner_user_id, status")
    .eq("id", threadId)
    .maybeSingle();

  if (tErr) return json(500, { error: tErr.message });
  if (!thread) return json(404, { error: "Thread not found" });

  // 2) Find the invite for this user on this thread.
  const { data: invite, error: invErr } = await (svc.from("thread_invites") as any)
    .select("id, intended_role, expires_at, used_at, declined_at")
    .eq("thread_id", threadId)
    .eq("invitee_email", email)
    .eq("intended_role", "owner")
    .is("declined_at", null)
    .limit(1)
    .maybeSingle();

  if (invErr) return json(500, { error: invErr.message });
  if (!invite) {
    return json(404, {
      error: "No pending owner invite found for this thread",
    });
  }

  // Guard: do not allow decline if the user has already claimed the property.
  if (thread.property_id) {
    const { data: prop } = await (svc.from("properties") as any)
      .select("owner_user_id, claimed_by_user_id, ownership_status")
      .eq("id", thread.property_id)
      .maybeSingle();

    const alreadyClaimedByThisUser =
      prop?.owner_user_id === user.id || prop?.claimed_by_user_id === user.id;

    if (alreadyClaimedByThisUser) {
      return json(409, {
        error:
          "You have already claimed this property. Use Release Claim instead.",
      });
    }
  }

  // 3) Mark the invite as declined (per-recipient — property stays unclaimed).
  const { error: declineErr } = await (svc.from("thread_invites") as any)
    .update({ declined_at: new Date().toISOString() })
    .eq("id", invite.id);

  if (declineErr) return json(500, { error: declineErr.message });

  // 4) Write a deal_events entry so the deal submitter sees this in-app.
  const dealId: string | null = thread.deal_id ?? null;
  if (dealId) {
    await (svc.from("deal_events") as any)
      .insert({
        deal_id: dealId,
        event_type: "OWNER_NOT_CONFIRMED",
        payload: {
          thread_id: threadId,
          property_id: thread.property_id ?? null,
          recipient_email: email,
          message:
            "The contacted recipient indicated they are not the owner of this property. Review the property details and update the owner if needed.",
        },
        created_by: user.id,
      })
      .select();

    // 5) Resolve buyer (deal submitter) contact and send email — non-fatal.
    try {
      const buyerUserId: string | null = thread.buyer_user_id ?? null;
      if (buyerUserId) {
        const { data: authUser } = await svc.auth.admin.getUserById(buyerUserId);
        const buyerEmail: string | null = authUser?.user?.email ?? null;

        if (buyerEmail) {
          const { data: profile } = await (svc.from("profiles") as any)
            .select("first_name, last_name")
            .eq("id", buyerUserId)
            .maybeSingle();

          const buyerName: string | null =
            profile?.first_name && profile?.last_name
              ? `${profile.first_name} ${profile.last_name}`
              : (profile?.first_name ?? null);

          await sendWorkflowEmail({
            audience: "buyer",
            eventKey: "OWNER_NOT_CONFIRMED",
            to: buyerEmail,
            recipientName: buyerName,
            actionUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://fractpath.com").replace(/\/$/, "")}/deal/${dealId}`,
          });
        }
      }
    } catch (err) {
      console.error("not_my_property_email_failed", { threadId, dealId, err });
    }
  }

  return json(200, { ok: true });
}
